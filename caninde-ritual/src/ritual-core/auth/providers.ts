// Configuraciones OAuth listas para Spotify y YouTube (ver doc §8).

import type { OAuthConfig } from './oauth';

export interface ProviderClientOptions {
  clientId: string;
  redirectUri: string;
}

/**
 * Spotify: Authorization Code + PKCE. Scopes mínimos para Web Playback SDK + lectura.
 * Recordar (doc §3): dev mode → 5 usuarios Premium allowlisteados.
 */
export function makeSpotifyConfig(opts: ProviderClientOptions): OAuthConfig {
  return {
    provider: 'spotify',
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    authorizeUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'streaming',
      'user-read-email',
      'user-read-private',
      'user-read-playback-state',
      'user-modify-playback-state',
      'playlist-read-private',
    ],
  };
}

/**
 * YouTube / Google: login OPCIONAL (sólo da acceso a las playlists propias).
 * `access_type=offline` + `prompt=consent` para recibir refresh token.
 */
export function makeYouTubeConfig(opts: ProviderClientOptions): OAuthConfig {
  return {
    provider: 'youtube',
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    extraAuthParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  };
}
