// Adaptador YouTube (stub) — ver doc §3 y §7.
//
// Restricciones grabadas en el diseño:
//  - IFrame Player API: reproductor VISIBLE obligatorio (≥200×200, con branding).
//  - Sin background play para terceros. Login con Google opcional.
//  - Fuente SECUNDARIA.

import type { Provider, Track } from '../../model/track';
import { BasePlaybackAdapter } from './base.adapter';

export class YouTubePlaybackAdapter extends BasePlaybackAdapter {
  readonly provider: Provider = 'youtube';

  /** Elemento DOM donde montar el IFrame visible (lo provee la app en Fase 6). */
  constructor(private mountEl?: unknown) {
    super();
  }

  override async load(track: Track): Promise<void> {
    // TODO Fase 6: crear YT.Player sobre `mountEl` (visible, ≥200×200, sin ocultar),
    // cargar `track.source.externalId` (videoId) y enganchar onStateChange.
    void this.mountEl;
    await super.load(track);
  }

  override async fadeTo(target: number, durationMs: number): Promise<void> {
    // TODO Fase 6: aproximar fade con player.setVolume(0..100) por pasos (sin Web Audio).
    await super.fadeTo(target, durationMs);
  }
}
