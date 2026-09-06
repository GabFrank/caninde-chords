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

import { getAudioContext } from './audioContext';
import { getSound } from './soundLibrary';
import { resolveTrim } from '../lib/padTrim';
import { SoundPad } from '../types';

/** Fundido por defecto, en ms: corto, para que no se oiga el corte. */
export const DEFAULT_FADE_MS = 120;

/** Techo del fundido configurable, en ms. Coincide con las reglas de Firestore. */
export const MAX_FADE_MS = 15000;

/**
 * Fundido de la SEGUNDA petición de parada sobre una voz que ya se está
 * apagando. Es la salida de emergencia: apretar el pánico dos veces corta.
 */
export const SECOND_STOP_SEC = 0.05;

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
  // `Math.max(1, ...)`: un `repeat` fraccionario (0.5, que puede venir en el
  // manifiesto de un pack) daba cero pasadas, o sea un `stop()` programado en el
  // mismo instante del `start()`, y el pad no sonaba nunca.
  const times = Math.min(Math.max(1, Math.floor(repeat)), MAX_REPEAT);
  if (times === 1) return { loop: false, stopAfterSec: bufferDurationSec };
  return { loop: true, stopAfterSec: bufferDurationSec * times };
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

export function resolveFadeSec(pad: Pick<SoundPad, 'fadeOutMs'>): number {
  const ms = Number.isFinite(pad.fadeOutMs as number) ? (pad.fadeOutMs as number) : DEFAULT_FADE_MS;
  return Math.max(0, Math.min(MAX_FADE_MS, ms)) / 1000;
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
  /**
   * Fundido de ESTA voz al ser apagada, en segundos. Es del pad que suena, no
   * del que lo corta: si la lluvia se configuró para apagarse en tres segundos,
   * tiene que apagarse en tres segundos la corte quien la corte.
   */
  fadeSec: number;
  /** Cuándo está programado que calle, en el reloj del contexto. */
  stopAt: number | null;
  /** Ya se le pidió parar: otra petición más tiene que cortar en seco. */
  stopping: boolean;
}

type Listener = (voices: ActiveVoice[]) => void;

export class SoundpadEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer>>();
  /** Claves olvidadas mientras se decodificaban: su resultado ya no vale. */
  private stale = new Set<string>();
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
    const ctx = this.init();
    // El contexto propio, no el singleton global: el motor puede haber recibido
    // otro por inyección (las pruebas lo hacen) y reanudar el equivocado sería
    // un no-op silencioso.
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(e => console.warn('No se pudo reanudar el AudioContext', e));
    }
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

    this.stale.delete(fileKey);
    const job = (async () => {
      const blob = await getSound(fileKey);
      if (!blob) throw new MissingAudioError(fileKey);
      const bytes = await blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      // Si el archivo se reemplazó mientras se decodificaba, este resultado ya
      // no es el que corresponde: se devuelve, pero no se cachea.
      if (!this.stale.has(fileKey)) this.buffers.set(fileKey, buffer);
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

  /**
   * Olvida un audio (al reemplazar el archivo de un pad o al importar un pack).
   *
   * También descarta la decodificación en vuelo si la hay: si no, al terminar
   * volvía a escribir el buffer viejo en el caché y ya no había forma de
   * desalojarlo.
   */
  forget(fileKey: string): void {
    this.buffers.delete(fileKey);
    this.stale.add(fileKey);
    this.decoding.delete(fileKey);
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
      this.fadeOutVoice(voice);
    }

    const now = ctx.currentTime;
    // El recorte no toca el archivo: se reproduce sólo la ventana marcada.
    const win = resolveTrim(buffer.duration, pad.trimStartMs, pad.trimEndMs);
    const { loop, stopAfterSec } = computePlayback(win.durationSec, pad.repeat);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    const gain = ctx.createGain();
    gain.gain.value = clampVolume(pad.volume);

    source.connect(gain);
    gain.connect(this.master);

    if (loop) {
      // En bucle, el recorte se expresa con `loopStart`/`loopEnd`; el tercer
      // argumento de `start()` NO sirve acá, porque limita el total reproducido
      // y cortaría el bucle en la primera pasada.
      source.loopStart = win.offsetSec;
      source.loopEnd = win.offsetSec + win.durationSec;
      source.start(now, win.offsetSec);
    } else {
      source.start(now, win.offsetSec, win.durationSec);
    }
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
      fadeSec: resolveFadeSec(pad),
      stopAt: stopAfterSec === null ? null : now + stopAfterSec,
      stopping: false,
    };
    this.voices.set(voiceId, voice);
    source.onended = () => {
      this.voices.delete(voiceId);
      // Desconectar explícitamente: sin fuente viva son recolectables igual,
      // pero así no queda la duda de si el grafo crece con cada disparo.
      try { gain.disconnect(); } catch { /* ya desconectado */ }
      this.notify();
    };
    this.notify();
    return voiceId;
  }

  /** Para una voz concreta. Sin `fadeSec`, con el fundido propio del pad. */
  stopVoice(voiceId: string, fadeSec?: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    this.fadeOutVoice(voice, fadeSec);
    this.notify();
  }

  /** Para todas las voces de un pad (puede haber varias si es de overlay). */
  stopPad(padId: string, fadeSec?: number): void {
    for (const voice of this.voices.values()) {
      if (voice.padId === padId) this.fadeOutVoice(voice, fadeSec);
    }
    this.notify();
  }

  /**
   * Pánico: silencio. Usa el fundido propio de cada voz salvo que se imponga
   * uno, para que un ambiente con fundido largo no se corte en seco.
   */
  stopAll(fadeSec?: number): void {
    for (const voice of this.voices.values()) this.fadeOutVoice(voice, fadeSec);
    // Un solo aviso para todas: ocho voces no deben producir ocho renders.
    this.notify();
  }

  /**
   * Retira un disparo que resultó ser el comienzo de un desplazamiento. Corta de
   * inmediato, sin el fundido del pad: la idea es que el sonido no llegue a
   * oírse, no que se apague con gracia.
   */
  retract(voiceId: string): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    this.fadeOutVoice(voice, 0.015);
    this.notify();
  }

  /**
   * Apaga una voz. Sin `overrideSec`, usa el fundido configurado en el pad que
   * la originó; sólo el pánico y el retiro de un disparo accidental imponen uno.
   */
  private fadeOutVoice(voice: Voice, overrideSec?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    // Segunda petición sobre una voz que ya se apaga: se corta en seco. Si no,
    // insistir con el pánico REINICIABA el fundido desde el volumen del momento
    // y alejaba el silencio en vez de acercarlo.
    const pedido = voice.stopping
      ? Math.min(SECOND_STOP_SEC, overrideSec ?? voice.fadeSec)
      : (overrideSec ?? voice.fadeSec);
    let end = now + Math.max(0.01, pedido);

    // NUNCA más tarde de lo que ya iba a callar. En Web Audio la última llamada
    // a `stop()` es la que manda, así que un fundido más largo que lo que le
    // quedaba de repeticiones ALARGABA el sonido: parar un pad de 6 s con 15 s
    // de fundido lo dejaba sonando 15,6 s. El pánico tiene que acortar siempre.
    if (voice.stopAt !== null) end = Math.min(end, voice.stopAt);
    end = Math.max(now + 0.01, end);

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
    voice.stopAt = end;
    voice.stopping = true;
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

  /**
   * Observa las voces activas. El oyente recibe el estado ACTUAL al suscribirse,
   * no sólo los cambios posteriores.
   *
   * El motor es un singleton que sobrevive al desmontaje del tablero: sin esta
   * entrega inicial, salir a otra pestaña y volver dejaba un bucle sonando que
   * la interfaz no veía —ningún pad marcado, botón de pánico deshabilitado— y
   * sin forma de pararlo salvo recargando la página.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    try { listener(this.getVoices()); } catch (e) { console.error('Listener del soundpad falló', e); }
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
