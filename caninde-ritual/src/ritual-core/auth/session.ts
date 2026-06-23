// Sesión de autenticación (ver doc §8).
//
// `AuthSession`: arranca el login (URL + verifier), completa el intercambio y entrega
// SIEMPRE un access token válido (refresca sólo cuando hace falta).

import type { OAuthConfig, OAuthToken } from './oauth';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  isExpired,
  refreshAccessToken,
} from './oauth';
import { createPkcePair, generateState } from './pkce';
import type { TokenStore } from './token-store';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Lo que la app necesita guardar entre el redirect de ida y la vuelta a `/callback`. */
export interface PendingLogin {
  url: string;
  verifier: string;
  state: string;
}

export class AuthSession {
  constructor(
    private config: OAuthConfig,
    private store: TokenStore,
    private fetchImpl?: FetchLike,
  ) {}

  /** Paso 1: genera PKCE + state y devuelve la URL de login y el verifier a guardar. */
  async startLogin(): Promise<PendingLogin> {
    const { challenge, verifier } = await createPkcePair();
    const state = generateState();
    const url = buildAuthorizationUrl(this.config, { challenge, state });
    return { url, verifier, state };
  }

  /** Paso 2: en `/callback`, canjea el code por un token y lo persiste. */
  async completeLogin(code: string, verifier: string): Promise<OAuthToken> {
    const token = await exchangeCodeForToken(this.config, { code, verifier }, this.fetchImpl);
    await this.store.set(this.config.provider, token);
    return token;
  }

  /** Devuelve un access token válido, refrescando si está por vencer. */
  async getAccessToken(): Promise<string> {
    const token = await this.store.get(this.config.provider);
    if (!token) throw new Error(`Sin sesión para ${this.config.provider}: hacé login primero.`);
    if (!isExpired(token)) return token.accessToken;

    if (!token.refreshToken) {
      throw new Error(`Token vencido y sin refresh token para ${this.config.provider}.`);
    }
    const refreshed = await refreshAccessToken(this.config, token.refreshToken, this.fetchImpl);
    await this.store.set(this.config.provider, refreshed);
    return refreshed.accessToken;
  }

  async isLoggedIn(): Promise<boolean> {
    return (await this.store.get(this.config.provider)) !== null;
  }

  async logout(): Promise<void> {
    await this.store.clear(this.config.provider);
  }
}
