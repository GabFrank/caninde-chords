import { describe, it, expect, vi, beforeEach } from 'vitest';

// El motor lee los audios de IndexedDB, que no existe en Node. Se sustituye por
// un blob de mentira: lo que se prueba acá es la lógica de disparo, no el
// almacenamiento.
vi.mock('./soundLibrary', () => ({
  getSound: vi.fn(async (fileKey: string) =>
    fileKey === 'ausente' ? undefined : new Blob([new Uint8Array([1, 2, 3])])),
}));

import {
  SoundpadEngine, MissingAudioError, computePlayback, clampVolume,
  resolveFadeSec, voicesToCut, DEFAULT_FADE_MS,
} from './soundpadEngine';
import { SoundPad } from '../types';

// ── Doble del AudioContext ───────────────────────────────────────────────────

class FakeParam {
  value = 1;
  cancelScheduledValues() {}
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime() {}
  setTargetAtTime(v: number) { this.value = v; }
}

class FakeGain {
  gain = new FakeParam();
  connect() {}
}

class FakeSource {
  buffer: { duration: number } | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started: number | null = null;
  stopped: number | null = null;
  connect() {}
  start(t: number) { this.started = t; }
  stop(t: number) { this.stopped = t; }
  /** Simula el final de la reproducción, que en el navegador dispara onended. */
  finish() { this.onended?.(); }
}

class FakeContext {
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g as unknown as GainNode;
  }
  createDynamicsCompressor() {
    return {
      threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(),
      attack: new FakeParam(), release: new FakeParam(), connect() {},
    } as unknown as DynamicsCompressorNode;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s as unknown as AudioBufferSourceNode;
  }
  async decodeAudioData() { return { duration: 2 } as AudioBuffer; }
}

function makePad(over: Partial<SoundPad> = {}): SoundPad {
  return {
    id: 'p1', ownerId: 'u1', name: 'Trueno', categoryId: 'naturaleza',
    fileKey: 'k1', fileName: 'trueno.mp3', fileSize: 1000,
    volume: 0.8, repeat: 1, overlay: false, favorite: false, order: 0,
    createdAt: null, updatedAt: null, ...over,
  };
}

// ── Lógica pura ──────────────────────────────────────────────────────────────

describe('computePlayback', () => {
  it('una sola pasada no usa bucle', () => {
    expect(computePlayback(2, 1)).toEqual({ loop: false, stopAfterSec: 2 });
  });

  it('varias repeticiones usan una única fuente en bucle, parada al final', () => {
    // Encadenar una fuente por repetición acumula error de scheduling; con bucle
    // + stop programado, tres pasadas de 2 s duran exactamente 6 s.
    expect(computePlayback(2, 3)).toEqual({ loop: true, stopAfterSec: 6 });
  });

  it('repeat 0 es bucle indefinido', () => {
    expect(computePlayback(2, 0)).toEqual({ loop: true, stopAfterSec: null });
  });

  it('trata los valores inválidos como bucle indefinido', () => {
    expect(computePlayback(2, -5)).toEqual({ loop: true, stopAfterSec: null });
    expect(computePlayback(2, NaN)).toEqual({ loop: true, stopAfterSec: null });
  });

  it('recorta al máximo permitido por las reglas de Firestore', () => {
    expect(computePlayback(1, 999)).toEqual({ loop: true, stopAfterSec: 50 });
  });

  it('descarta la parte fraccionaria', () => {
    expect(computePlayback(2, 2.7)).toEqual({ loop: true, stopAfterSec: 4 });
  });
});

describe('clampVolume', () => {
  it('mantiene el rango 0..1', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(3)).toBe(1);
    expect(clampVolume(NaN)).toBe(1);
  });
});

describe('resolveFadeSec', () => {
  it('usa el fundido por defecto cuando el pad no define uno', () => {
    expect(resolveFadeSec({ fadeOutMs: undefined })).toBeCloseTo(DEFAULT_FADE_MS / 1000);
  });

  it('respeta el del pad y lo acota', () => {
    expect(resolveFadeSec({ fadeOutMs: 300 })).toBeCloseTo(0.3);
    expect(resolveFadeSec({ fadeOutMs: 99999 })).toBeCloseTo(5);
    expect(resolveFadeSec({ fadeOutMs: -10 })).toBe(0);
  });
});

describe('voicesToCut', () => {
  const activas = [{ voiceId: 'v1' }, { voiceId: 'v2' }];

  it('un pad de overlay no corta nada', () => {
    expect(voicesToCut({ overlay: true }, activas)).toEqual([]);
  });

  it('un pad exclusivo corta todo lo que suene', () => {
    expect(voicesToCut({ overlay: false }, activas)).toEqual(activas);
  });
});

// ── Motor ────────────────────────────────────────────────────────────────────

describe('SoundpadEngine', () => {
  let ctx: FakeContext;
  let engine: SoundpadEngine;

  beforeEach(() => {
    ctx = new FakeContext();
    engine = new SoundpadEngine(() => ctx as unknown as AudioContext);
  });

  it('un pad de overlay deja sonando lo anterior', async () => {
    await engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true, repeat: 0 }));
    await engine.play(makePad({ id: 'b', fileKey: 'k2', overlay: true, repeat: 0 }));

    expect(engine.getVoices().map(v => v.padId).sort()).toEqual(['a', 'b']);
  });

  it('un pad exclusivo programa el corte de lo que estaba sonando', async () => {
    await engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true, repeat: 0 }));
    const previa = ctx.sources[0];
    expect(previa.stopped).toBeNull();

    ctx.currentTime = 5;
    await engine.play(makePad({ id: 'b', fileKey: 'k2', overlay: false, fadeOutMs: 200 }));

    // La voz anterior se apaga con fundido, no de golpe.
    expect(previa.stopped).toBeCloseTo(5.2);
  });

  it('la voz desaparece del registro cuando termina', async () => {
    await engine.play(makePad({ id: 'a' }));
    expect(engine.isPadPlaying('a')).toBe(true);

    ctx.sources[0].finish();
    expect(engine.isPadPlaying('a')).toBe(false);
    expect(engine.getVoices()).toEqual([]);
  });

  it('el volumen del pad va a su propia ganancia, no a la maestra', async () => {
    await engine.play(makePad({ volume: 0.25 }));
    // La primera ganancia que se crea es la maestra (en init()); la segunda, la
    // del pad. Bajar un pad no debe bajar toda la mesa.
    const [maestra, delPad] = ctx.gains;
    expect(maestra.gain.value).toBe(0.9);
    expect(delPad.gain.value).toBe(0.25);
    expect(engine.getMasterVolume()).toBe(0.9);
  });

  it('avisa a los suscriptores al disparar y al terminar', async () => {
    const visto: number[] = [];
    engine.subscribe(voices => visto.push(voices.length));

    await engine.play(makePad({ id: 'a' }));
    ctx.sources[0].finish();

    expect(visto).toEqual([1, 0]);
  });

  it('el pánico programa el corte de todas las voces', async () => {
    await engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true, repeat: 0 }));
    await engine.play(makePad({ id: 'b', fileKey: 'k2', overlay: true, repeat: 0 }));

    engine.stopAll(0.05);

    expect(ctx.sources.map(s => s.stopped)).toEqual([0.05, 0.05]);
  });

  it('un audio que no está en este dispositivo se distingue de un fallo real', async () => {
    await expect(engine.play(makePad({ fileKey: 'ausente' }))).rejects.toBeInstanceOf(MissingAudioError);
  });

  it('preload informa qué pads se quedaron sin audio', async () => {
    const { missing } = await engine.preload([
      makePad({ id: 'ok', fileKey: 'k1' }),
      makePad({ id: 'roto', fileKey: 'ausente' }),
    ]);
    expect(missing).toEqual(['roto']);
  });

  it('decodifica una sola vez por archivo', async () => {
    const spy = vi.spyOn(ctx, 'decodeAudioData');
    await engine.play(makePad({ fileKey: 'k1' }));
    await engine.play(makePad({ fileKey: 'k1' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
