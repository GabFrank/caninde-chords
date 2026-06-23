// OAuth 2.0 Authorization Code + PKCE — primitivas (ver doc §8).
//
// Funciones puras + un intercambio de token que recibe `fetch` inyectado (testeable).

export interface OAuthConfig {
  provider: 'spotify' | 'youtube';
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  /** Parámetros extra para la URL de autorización (ej. access_type para Google). */
  extraAuthParams?: Record<string, string>;
}

export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  /** Epoch ms en que expira (calculado al recibirlo). */
  expiresAt: number;
  refreshToken?: string;
  scope?: string;
}

/** Construye la URL de autorización (paso 1 del flujo). Función pura. */
export function buildAuthorizationUrl(
  config: OAuthConfig,
  params: { challenge: string; state: string },
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('state', params.state);
  for (const [k, v] of Object.entries(config.extraAuthParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function resolveFetch(custom?: FetchLike): FetchLike {
  if (custom) return custom;
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (!f) throw new Error('fetch no disponible: inyectá uno para el intercambio de token.');
  return f;
}

function toToken(raw: {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}): OAuthToken {
  const expiresInSec = raw.expires_in ?? 3600;
  return {
    accessToken: raw.access_token,
    tokenType: raw.token_type ?? 'Bearer',
    expiresAt: Date.now() + expiresInSec * 1000,
    refreshToken: raw.refresh_token,
    scope: raw.scope,
  };
}

/** Paso 2: canjea el `code` por un token (PKCE: manda el verifier, no el secret). */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  params: { code: string; verifier: string },
  fetchImpl?: FetchLike,
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: params.verifier,
  });
  const res = await resolveFetch(fetchImpl)(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Intercambio de token falló (${res.status}): ${await safeText(res)}`);
  }
  return toToken(await res.json());
}

/** Refresca el access token usando el refresh token. */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl?: FetchLike,
): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  const res = await resolveFetch(fetchImpl)(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Refresh de token falló (${res.status}): ${await safeText(res)}`);
  }
  const token = toToken(await res.json());
  // Algunos proveedores no devuelven un refresh_token nuevo: conservamos el anterior.
  if (!token.refreshToken) token.refreshToken = refreshToken;
  return token;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<sin cuerpo>';
  }
}

export function isExpired(token: OAuthToken, skewMs = 60_000): boolean {
  return Date.now() >= token.expiresAt - skewMs;
}
