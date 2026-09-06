// Motor de reproducción del Soundpad.
//
// Cadena deliberadamente transparente:
//     fuente → ganancia del pad → ganancia maestra → limitador → salida
// Sin reverb ni filtros: un trueno o un canto de pájaro tienen que salir tal
// cual se grabaron. El limitador está sólo para que varios pads superpuestos a
// volumen alto no recorten en la salida.
//
// El contexto se comparte con el afinador (`audioContext.ts`), pero la cadena es
// propia: el afinador colorea su señal para sonar a guitarra.

import { getAudioContext, resumeAudioContext } from './audioContext';
import { getSound } from './soundLibrary';
import { SoundPad } from '../types';

/** Fundido por defecto, en ms, cuando un pad exclusivo corta a los demás. */
export const DEFAULT_FADE_MS = 120;

/** Máximo de repeticiones que aceptamos (coincide con las reglas de Firestore). */
export const MAX_REPEAT = 50;

export class MissingAudioError extends Error {
  constructor(public fileKey: string) {
    super(`El audio ${fileKey} no está en este dispositivo.`);
    this.name = 'MissingAudioError';
  }
}

// ── Lógica pura (con pruebas unitarias) ──────────────────────────────────────

/**
 * Cómo hay que reproducir un buffer para que suene `repeat` veces.
 *
 * Se usa una sola fuente en bucle y se la para al final, en vez de encadenar un
 * `AudioBufferSourceNode` por repetición: encadenar acumula el error de cada
 * `start()` y a la quinta repetición ya se oye el hueco entre pasadas.
 *
 * `repeat <= 0` significa bucle indefinido hasta que se lo pare a mano.
 */
export function computePlayback(bufferDurationSec: number, repeat: number): { loop: boolean; stopAfterSec: number | null } {
  if (!Number.isFinite(repeat) || repeat <= 0) return { loop: true, stopAfterSec: null };
  const times = Math.min(Math.floor(repeat), MAX_REPEAT);
  if (times === 1) return { loop: false, stopAfterSec: bufferDurationSec };
  return { loop: true, stopAfterSec: bufferDurationSec * times };
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

export function resolveFadeSec(pad: Pick<SoundPad, 'fadeOutMs'>): number {
  const ms = Number.isFinite(pad.fadeOutMs as number) ? (pad.fadeOutMs as number) : DEFAULT_FADE_MS;
  return Math.max(0, Math.min(5000, ms)) / 1000;
}

/**
 * Un pad sin `overlay` corta a los que estén sonando. Devuelve qué voces hay que
 * apagar antes de arrancar la nueva.
 */
export function voicesToCut<T extends { voiceId: string }>(pad: Pick<SoundPad, 'overlay'>, active: T[]): T[] {
  return pad.overlay ? [] : active.slice();
}

// ── Estado que la interfaz observa ───────────────────────────────────────────

export interface ActiveVoice {
  voiceId: string;
  padId: string;
  padName: string;
  /** Reloj del AudioContext, en segundos. */
  startedAt: number;
  /** `null` cuando el pad está en bucle indefinido. */
  endsAt: number | null;
}

interface Voice extends ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

type Listener = (voices: ActiveVoice[]) => void;

export class SoundpadEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer>>();
  private voices = new Map<string, Voice>();
  private listeners = new Set<Listener>();
  private masterVolume = 0.9;
  private voiceSeq = 0;

  constructor(private ctxProvider: () => AudioContext | null = getAudioContext) {}

  /** Arma la cadena la primera vez. Idempotente. */
  init(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = this.ctxProvider();
    if (!ctx) return null;
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.masterVolume;

    // Limitador suave: sólo entra cuando se acumulan pads superpuestos.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;

    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;
    return ctx;
  }

  /**
   * Reanuda el contexto. Hay que llamarlo desde el manejador del gesto del
   * usuario: en móvil el audio no arranca de otra forma.
   */
  unlock(): void {
    this.init();
    resumeAudioContext();
  }

  // ── Buffers ────────────────────────────────────────────────────────────────

  /** Decodifica y cachea el audio de un pad. Lanza MissingAudioError si no está. */
  async ensureBuffer(fileKey: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(fileKey);
    if (cached) return cached;

    const inFlight = this.decoding.get(fileKey);
    if (inFlight) return inFlight;

    const ctx = this.init();
    if (!ctx) throw new Error('No hay AudioContext disponible.');

    const job = (async () => {
      const blob = await getSound(fileKey);
      if (!blob) throw new MissingAudioError(fileKey);
      const bytes = await blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      this.buffers.set(fileKey, buffer);
      return buffer;
    })();

    this.decoding.set(fileKey, job);
    try {
      return await job;
    } finally {
      this.decoding.delete(fileKey);
    }
  }

  /**
   * Decodifica en segundo plano los audios de todos los pads, para que el primer
   * toque de cada uno suene sin esperar. Los que falten en este dispositivo se
   * devuelven en `missing`.
   */
  async preload(pads: SoundPad[]): Promise<{ missing: string[] }> {
    const missing: string[] = [];
    for (const pad of pads) {
      try {
        await this.ensureBuffer(pad.fileKey);
      } catch (e) {
        if (e instanceof MissingAudioError) missing.push(pad.id);
        else console.warn(`No se pudo preparar el sonido "${pad.name}"`, e);
      }
    }
    return { missing };
  }

  /** Olvida un audio ya decodificado (al reemplazar el archivo de un pad). */
  forget(fileKey: string): void {
    this.buffers.delete(fileKey);
  }

  hasBuffer(fileKey: string): boolean {
    return this.buffers.has(fileKey);
  }

  // ── Reproducción ───────────────────────────────────────────────────────────

  /**
   * Dispara un pad. Devuelve el id de la voz, o `null` si no hay audio.
   *
   * Si el pad no es de overlay, apaga con un fundido corto todo lo que esté
   * sonando antes de arrancar: cortar en seco produce un chasquido audible en un
   * equipo de sala.
   */
  async play(pad: SoundPad): Promise<string | null> {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;

    const buffer = await this.ensureBuffer(pad.fileKey);

    for (const voice of voicesToCut(pad, [...this.voices.values()])) {
      this.fadeOutVoice(voice, resolveFadeSec(pad));
    }

    const now = ctx.currentTime;
    const { loop, stopAfterSec } = computePlayback(buffer.duration, pad.repeat);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    const gain = ctx.createGain();
    gain.gain.value = clampVolume(pad.volume);

    source.connect(gain);
    gain.connect(this.master);
    source.start(now);
    if (stopAfterSec !== null) source.stop(now + stopAfterSec);

    const voiceId = `v${++this.voiceSeq}`;
    const voice: Voice = {
      voiceId,
      padId: pad.id,
      padName: pad.name,
      startedAt: now,
      endsAt: stopAfterSec === null ? null : now + stopAfterSec,
      source,
      gain,
    };
    this.voices.set(voiceId, voice);
    source.onended = () => {
      this.voices.delete(voiceId);
      this.notify();
    };
    this.notify();
    return voiceId;
  }

  /** Para una voz concreta con un fundido corto. */
  stopVoice(voiceId: string, fadeSec = DEFAULT_FADE_MS / 1000): void {
    const voice = this.voices.get(voiceId);
    if (voice) this.fadeOutVoice(voice, fadeSec);
  }

  /** Para todas las voces de un pad (puede haber varias si es de overlay). */
  stopPad(padId: string, fadeSec = DEFAULT_FADE_MS / 1000): void {
    for (const voice of this.voices.values()) {
      if (voice.padId === padId) this.fadeOutVoice(voice, fadeSec);
    }
  }

  /** Pánico: silencio inmediato. */
  stopAll(fadeSec = DEFAULT_FADE_MS / 1000): void {
    for (const voice of this.voices.values()) this.fadeOutVoice(voice, fadeSec);
  }

  private fadeOutVoice(voice: Voice, fadeSec: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const end = now + Math.max(0.01, fadeSec);
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      // Rampa lineal hasta un valor mínimo: `exponentialRampToValueAtTime` no
      // admite llegar a cero.
      voice.gain.gain.linearRampToValueAtTime(0.0001, end);
    } catch {
      // Si el nodo ya se soltó, seguir igual: lo que importa es el stop().
    }
    try {
      voice.source.stop(end);
    } catch {
      // Ya estaba parada.
    }
    // La voz sale del registro cuando `onended` dispara, al terminar el fundido.
    // Adelantar `endsAt` hace que la barra de progreso muestre el apagado.
    voice.endsAt = end;
    this.notify();
  }

  isPadPlaying(padId: string): boolean {
    for (const voice of this.voices.values()) {
      if (voice.padId === padId) return true;
    }
    return false;
  }

  getVoices(): ActiveVoice[] {
    return [...this.voices.values()].map(({ voiceId, padId, padName, startedAt, endsAt }) => ({
      voiceId, padId, padName, startedAt, endsAt,
    }));
  }

  /** Reloj del contexto, para calcular el progreso de una voz en la interfaz. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // ── Volumen maestro ────────────────────────────────────────────────────────

  setMasterVolume(v: number): void {
    this.masterVolume = clampVolume(v);
    const ctx = this.init();
    if (ctx && this.master) {
      // Rampa corta para que mover el control no produzca escalones audibles.
      this.master.gain.setTargetAtTime(this.masterVolume, ctx.currentTime, 0.02);
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  // ── Observación desde React ────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    const snapshot = this.getVoices();
    this.listeners.forEach(l => {
      try { l(snapshot); } catch (e) { console.error('Listener del soundpad falló', e); }
    });
  }
}

/** Instancia única que usa la interfaz. */
export const soundpadEngine = new SoundpadEngine();
