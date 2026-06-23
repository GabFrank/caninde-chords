// Base común para los adaptadores de reproducción (ver doc §7).
//
// Lleva el estado y la posición simulada para que el núcleo y los tests funcionen sin
// SDKs. Los métodos específicos de cada proveedor se completan en la Fase 6 (marcados
// con `TODO Fase 6`). Cada subclase declara su tabla de `capabilities`.

import type { Provider, Track } from '../../model/track';
import type { PlaybackCapabilities, PlaybackEngine, PlaybackState } from '../engine';
import { CAPABILITIES } from '../engine';

export abstract class BasePlaybackAdapter implements PlaybackEngine {
  abstract readonly provider: Provider;

  protected current?: Track;
  protected state: PlaybackState = 'idle';
  protected volume = 1;
  protected positionMs = 0;
  protected lastStartedAt = 0;

  get capabilities(): PlaybackCapabilities {
    return CAPABILITIES[this.provider];
  }

  async load(track: Track): Promise<void> {
    this.current = track;
    this.positionMs = 0;
    this.state = 'ready';
  }

  async play(): Promise<void> {
    if (!this.current) throw new Error('play() sin track cargado');
    this.state = 'playing';
    this.lastStartedAt = Date.now();
  }

  async pause(): Promise<void> {
    this.positionMs = this.getPosition();
    this.state = 'paused';
  }

  async seek(positionMs: number): Promise<void> {
    this.positionMs = Math.max(0, positionMs);
    this.lastStartedAt = Date.now();
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = clamp01(volume);
  }

  async fadeTo(target: number, durationMs: number): Promise<void> {
    // Implementación neutral: fija el destino. Los adaptadores con Web Audio (local)
    // hacen la rampa real; los headless aproximan por pasos en la Fase 6.
    void durationMs;
    this.volume = clamp01(target);
  }

  getPosition(): number {
    if (this.state === 'playing') {
      return this.positionMs + (Date.now() - this.lastStartedAt);
    }
    return this.positionMs;
  }

  getState(): PlaybackState {
    return this.state;
  }

  async stop(): Promise<void> {
    this.state = 'idle';
    this.positionMs = 0;
    this.current = undefined;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
