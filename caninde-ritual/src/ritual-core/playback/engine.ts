// Capa de reproducción — puertos (ver doc §7).
//
// Ports-and-adapters: el secuenciador y el orquestador hablan SIEMPRE con esta
// interfaz, nunca con el proveedor concreto. Tres adaptadores la implementan.

import type { Provider, Track } from '../model/track';

/** Qué puede hacer cada proveedor (tabla del doc §7). */
export interface PlaybackCapabilities {
  /** Reproduce sin UI propia. */
  headless: boolean;
  /** Tiene Web Audio (volumen por muestra, capas, crossfade real). */
  webAudio: boolean;
  /** Requiere un reproductor visible (YouTube IFrame). */
  visiblePlayer: boolean;
  /** Soporta crossfade real entre dos pistas. */
  realCrossfade: boolean;
  /** Funciona offline. */
  offline: boolean;
}

export const CAPABILITIES: Record<Provider, PlaybackCapabilities> = {
  spotify: { headless: true, webAudio: false, visiblePlayer: false, realCrossfade: false, offline: false },
  youtube: { headless: false, webAudio: false, visiblePlayer: true, realCrossfade: false, offline: false },
  local: { headless: true, webAudio: true, visiblePlayer: false, realCrossfade: true, offline: true },
};

export type PlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

/**
 * Motor de reproducción para UN proveedor. Los adaptadores concretos viven en la app
 * (Fase 6) e implementan la mecánica real de cada SDK; el núcleo sólo conoce el puerto.
 */
export interface PlaybackEngine {
  readonly provider: Provider;
  readonly capabilities: PlaybackCapabilities;

  /** Carga el track (sin reproducir). */
  load(track: Track): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  /** Salta a una posición en ms. */
  seek(positionMs: number): Promise<void>;
  /** Volumen 0..1 inmediato. */
  setVolume(volume: number): Promise<void>;
  /** Rampa de volumen hasta `target` en `durationMs` (para fades). */
  fadeTo(target: number, durationMs: number): Promise<void>;
  /** Posición actual en ms. */
  getPosition(): number;
  /** Estado actual. */
  getState(): PlaybackState;
  /** Detiene y libera recursos. */
  stop(): Promise<void>;
}
