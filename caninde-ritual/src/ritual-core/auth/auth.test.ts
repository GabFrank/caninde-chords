import { describe, it, expect } from 'vitest';
import { base64UrlEncode, challengeFromVerifier, createPkcePair, generateVerifier } from './pkce';
import { buildAuthorizationUrl, exchangeCodeForToken, isExpired, type OAuthToken } from './oauth';
import { makeSpotifyConfig, makeYouTubeConfig } from './providers';
import { InMemoryTokenStore } from './token-store';
import { AuthSession } from './session';

describe('pkce', () => {
  it('base64url no contiene +, / ni padding', () => {
    const enc = base64UrlEncode(new Uint8Array([251, 252, 253, 254, 255]));
    expect(enc).not.toMatch(/[+/=]/);
  });

  it('verifier tiene largo válido (43..128)', () => {
    const v = generateVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('challenge S256 es estable para el mismo verifier', async () => {
    const a = await challengeFromVerifier('verifier-fijo-123');
    const b = await challengeFromVerifier('verifier-fijo-123');
    expect(a).toBe(b);
    expect(a).not.toMatch(/[+/=]/);
  });

  it('createPkcePair genera par coherente', async () => {
    const pair = await createPkcePair();
    expect(pair.method).toBe('S256');
    expect(await challengeFromVerifier(pair.verifier)).toBe(pair.challenge);
  });
});

describe('buildAuthorizationUrl', () => {
  const config = makeSpotifyConfig({ clientId: 'CID', redirectUri: 'http://localhost:3001/callback' });

  it('incluye los parámetros PKCE obligatorios', () => {
    const url = new URL(buildAuthorizationUrl(config, { challenge: 'CH', state: 'ST' }));
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('CH');
    expect(url.searchParams.get('state')).toBe('ST');
  });

  it('YouTube agrega access_type=offline', () => {
    const yt = makeYouTubeConfig({ clientId: 'G', redirectUri: 'http://localhost:3001/callback' });
    const url = new URL(buildAuthorizationUrl(yt, { challenge: 'CH', state: 'ST' }));
    expect(url.searchParams.get('access_type')).toBe('offline');
  });
});

describe('isExpired', () => {
  it('detecta token vencido con skew', () => {
    const token: OAuthToken = { accessToken: 'a', tokenType: 'Bearer', expiresAt: Date.now() + 1000 };
    expect(isExpired(token)).toBe(true); // dentro del skew de 60s
    const fresh: OAuthToken = { accessToken: 'a', tokenType: 'Bearer', expiresAt: Date.now() + 600_000 };
    expect(isExpired(fresh)).toBe(false);
  });
});

describe('exchange + session (fetch inyectado)', () => {
  const config = makeSpotifyConfig({ clientId: 'CID', redirectUri: 'http://localhost:3001/callback' });

  const fakeFetch = async (_url: string, init: RequestInit): Promise<Response> => {
    const body = String(init.body);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code_verifier=');
    return new Response(
      JSON.stringify({ access_token: 'TOKEN123', token_type: 'Bearer', expires_in: 3600, refresh_token: 'R1' }),
      { status: 200 },
    );
  };

  it('exchangeCodeForToken parsea la respuesta', async () => {
    const token = await exchangeCodeForToken(config, { code: 'C', verifier: 'V' }, fakeFetch);
    expect(token.accessToken).toBe('TOKEN123');
    expect(token.refreshToken).toBe('R1');
    expect(token.expiresAt).toBeGreaterThan(Date.now());
  });

  it('AuthSession completa login y entrega access token', async () => {
    const store = new InMemoryTokenStore();
    const session = new AuthSession(config, store, fakeFetch);

    const pending = await session.startLogin();
    expect(pending.url).toContain('accounts.spotify.com');
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43);

    await session.completeLogin('CODE', pending.verifier);
    expect(await session.isLoggedIn()).toBe(true);
    expect(await session.getAccessToken()).toBe('TOKEN123');

    await session.logout();
    expect(await session.isLoggedIn()).toBe(false);
  });

  it('getAccessToken refresca cuando el token está vencido', async () => {
    const store = new InMemoryTokenStore();
    // Token ya vencido pero con refresh token.
    await store.set('spotify', {
      accessToken: 'VIEJO',
      tokenType: 'Bearer',
      expiresAt: Date.now() - 1000,
      refreshToken: 'R-OLD',
    });

    let refreshCalled = false;
    const refreshingFetch = async (_url: string, init: RequestInit): Promise<Response> => {
      const body = String(init.body);
      expect(body).toContain('grant_type=refresh_token');
      refreshCalled = true;
      return new Response(
        JSON.stringify({ access_token: 'NUEVO', token_type: 'Bearer', expires_in: 3600 }),
        { status: 200 },
      );
    };

    const session = new AuthSession(config, store, refreshingFetch);
    expect(await session.getAccessToken()).toBe('NUEVO');
    expect(refreshCalled).toBe(true);
    // Conserva el refresh token previo si el proveedor no manda uno nuevo.
    expect((await store.get('spotify'))?.refreshToken).toBe('R-OLD');
  });

  it('getAccessToken sin sesión lanza error claro', async () => {
    const session = new AuthSession(config, new InMemoryTokenStore(), fakeFetch);
    await expect(session.getAccessToken()).rejects.toThrow(/login/i);
  });
});
