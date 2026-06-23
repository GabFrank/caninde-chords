// Adaptador Spotify (stub) — ver doc §3 y §7.
//
// Restricciones grabadas en el diseño:
//  - Web Playback SDK requiere Premium + OAuth (Auth Code + PKCE).
//  - Reproducción headless, SIN Web Audio → no hay crossfade real.
//  - Dev mode: hasta 5 usuarios Premium en allowlist.

import type { Provider, Track } from '../../model/track';
import { BasePlaybackAdapter } from './base.adapter';

export class SpotifyPlaybackAdapter extends BasePlaybackAdapter {
  readonly provider: Provider = 'spotify';

  /** Token de acceso vigente (lo provee AuthSession). */
  constructor(private getAccessToken?: () => Promise<string>) {
    super();
  }

  override async load(track: Track): Promise<void> {
    // TODO Fase 6: inicializar Spotify Web Playback SDK con el access token,
    // crear el Player ("Caniné Ritual"), transferir la reproducción a este device
    // y precargar `track.source.uri` vía la Web API (PUT /me/player/play).
    void this.getAccessToken;
    await super.load(track);
  }

  override async fadeTo(target: number, durationMs: number): Promise<void> {
    // TODO Fase 6: sin Web Audio, aproximar el fade con PUT /me/player/volume por pasos.
    await super.fadeTo(target, durationMs);
  }
}
