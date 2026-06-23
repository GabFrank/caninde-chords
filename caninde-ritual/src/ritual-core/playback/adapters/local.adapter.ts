// Adaptador Local (stub) — ver doc §3 y §7.
//
// El ÚNICO con Web Audio API: crossfade real, capas simultáneas y offline. Fuente de
// la música propia (Alma Caniné) y de los sonidos de naturaleza/silencios.

import type { Provider, Track } from '../../model/track';
import { BasePlaybackAdapter } from './base.adapter';

export class LocalPlaybackAdapter extends BasePlaybackAdapter {
  readonly provider: Provider = 'local';

  override async load(track: Track): Promise<void> {
    // TODO Fase 6: decodificar el archivo (AudioContext.decodeAudioData), crear un
    // AudioBufferSourceNode conectado a un GainNode propio para fades reales.
    await super.load(track);
  }

  override async fadeTo(target: number, durationMs: number): Promise<void> {
    // TODO Fase 6: rampa real con gainNode.gain.linearRampToValueAtTime(target, t+dur).
    // Este adaptador es el que habilita el crossfade real (capabilities.realCrossfade).
    await super.fadeTo(target, durationMs);
  }
}
