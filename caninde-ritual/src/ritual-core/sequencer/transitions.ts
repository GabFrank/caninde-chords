// Planificador de transiciones (ver doc §6 y §7).
//
// Por cada empalme decide:
//  - crossfade REAL → sólo si ambos tracks son locales (Web Audio).
//  - fade-a-silencio → entre proveedores sellados (Spotify/YouTube headless),
//    con la CAPA DE NATURALEZA cubriendo la costura.

import type { Track } from '../model/track';
import { isLocal } from '../model/track';
import type { TransitionInfo } from '../model/sequence';
import { harmonicCompatibility } from './harmonic';

export const DEFAULT_CROSSFADE_MS = 8000;
export const DEFAULT_FADE_MS = 4000;

export interface TransitionOptions {
  crossfadeMs?: number;
  fadeMs?: number;
  /** Si la capa de naturaleza está disponible para tapar costuras. */
  ambientAvailable?: boolean;
}

/** Decide la transición de entrada de `next` viniendo de `prev`. */
export function planTransition(
  prev: Track | undefined,
  next: Track,
  opts: TransitionOptions = {},
): TransitionInfo {
  const crossfadeMs = opts.crossfadeMs ?? DEFAULT_CROSSFADE_MS;
  const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
  const ambientAvailable = opts.ambientAvailable ?? true;

  const compat = harmonicCompatibility(prev?.audioMeta, next.audioMeta);
  const harmonic = { compatible: compat.compatible, score: compat.harmonicScore };
  const tempo = {
    fromBpm: prev?.audioMeta?.bpm,
    toBpm: next.audioMeta?.bpm,
    score: compat.tempoScore,
  };

  if (!prev) {
    // Primer elemento: entra con un fade suave, sin costura previa.
    return { kind: 'fade-to-silence', durationMs: fadeMs, natureCover: false, harmonic, tempo };
  }

  // Crossfade real sólo si ambos son locales (Web Audio en el mismo motor).
  if (isLocal(prev) && isLocal(next)) {
    return { kind: 'crossfade', durationMs: crossfadeMs, natureCover: false, harmonic, tempo };
  }

  // Proveedores sellados o mezcla: fade a silencio; la naturaleza tapa la costura.
  return {
    kind: 'fade-to-silence',
    durationMs: fadeMs,
    natureCover: ambientAvailable,
    harmonic,
    tempo,
  };
}
