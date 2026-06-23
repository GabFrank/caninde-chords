// Modelo de track (ver doc §5).
//
// Spotify, YouTube y archivos locales son IGUALES en la capa creativa. Lo que cambia
// es la capa de reproducción (ver playback/). Los datos técnicos (tono/BPM) se
// guardan en `audioMeta` y NUNCA se muestran: solo los usa el motor para empalmar.

import type { AttributeValue } from './attributes';

export type Provider = 'spotify' | 'youtube' | 'local';

export interface TrackSource {
  provider: Provider;
  /** id en el proveedor (uri de Spotify, videoId de YouTube, ruta/handle local). */
  externalId: string;
  /** uri canónica opcional (ej. `spotify:track:...`). */
  uri?: string;
}

/** Metadatos técnicos OCULTOS. Solo el secuenciador los lee para decidir empalmes. */
export interface AudioMeta {
  /** Tonalidad en notación Camelot (ej. `8A`, `11B`). */
  keyCamelot?: string;
  bpm?: number;
}

export interface Track {
  id: string;
  title: string;
  artist?: string;
  durationMs: number;
  /** Emociones y demás clasificaciones VISIBLES del track. */
  tags: AttributeValue[];
  source: TrackSource;
  /** Datos técnicos ocultos (tono/BPM). Opcional: se analiza en silencio. */
  audioMeta?: AudioMeta;
}

export function isLocal(track: Track): boolean {
  return track.source.provider === 'local';
}
