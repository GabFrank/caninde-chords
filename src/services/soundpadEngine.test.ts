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
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started: number | null = null;
  /** Argumentos de start(): [cuándo, desde dónde del archivo, cuánto]. */
  startArgs: (number | undefined)[] = [];
  stopped: number | null = null;
  connect() {}
  start(t: number, offset?: number, duration?: number) {
    this.started = t;
    this.startArgs = [t, offset, duration];
  }
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
    expect(resolveFadeSec({ fadeOutMs: 99999 })).toBeCloseTo(15);  // el techo
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

  it('un pad de overlay NO toca lo que ya estaba sonando', async () => {
    await engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true, repeat: 0 }));
    const previa = ctx.sources[0];

    await engine.play(makePad({ id: 'b', fileKey: 'k2', overlay: true, repeat: 0 }));

    // Que la voz siga en el registro no alcanza como prueba: `fadeOutVoice` la
    // saca recién en `onended`, que el doble no dispara. Lo que demuestra que no
    // se la cortó es que nadie le programó un stop().
    expect(previa.stopped).toBeNull();
    expect(engine.getVoices().map(v => v.padId).sort()).toEqual(['a', 'b']);
  });

  it('un pad exclusivo programa el corte de lo que estaba sonando', async () => {
    await engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true, repeat: 0 }));
    const previa = ctx.sources[0];
    expect(previa.stopped).toBeNull();

    ctx.currentTime = 5;
    await engine.play(makePad({ id: 'b', fileKey: 'k2', overlay: false }));

    // Se apaga con fundido, no de golpe.
    expect(previa.stopped).toBeGreaterThan(5);
  });

  it('el fundido es el del pad que se apaga, no el del que lo corta', async () => {
    // La lluvia se configuró para apagarse en 3 s; la corte quien la corte, se
    // tiene que apagar en 3 s.
    await engine.play(makePad({ id: 'lluvia', fileKey: 'k1', overlay: true, repeat: 0, fadeOutMs: 3000 }));
    const lluvia = ctx.sources[0];

    ctx.currentTime = 10;
    await engine.play(makePad({ id: 'trueno', fileKey: 'k2', overlay: false, fadeOutMs: 50 }));

    expect(lluvia.stopped).toBeCloseTo(13);
  });

  it('el pánico apaga cada voz con su propio fundido', async () => {
    await engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true, repeat: 0, fadeOutMs: 100 }));
    await engine.play(makePad({ id: 'b', fileKey: 'k2', overlay: true, repeat: 0, fadeOutMs: 2000 }));

    engine.stopAll();

    expect(ctx.sources.map(s => s.stopped)).toEqual([0.1, 2]);
  });

  it('una sola pasada no usa bucle y para al final del audio', async () => {
    await engine.play(makePad({ repeat: 1 }));
    const src = ctx.sources[0];
    expect(src.loop).toBe(false);
    expect(src.stopped).toBeCloseTo(2); // el buffer del doble dura 2 s
  });

  it('tres repeticiones son una única fuente en bucle parada a los 6 s', async () => {
    await engine.play(makePad({ repeat: 3 }));
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].loop).toBe(true);
    expect(ctx.sources[0].stopped).toBeCloseTo(6);
  });

  it('el bucle indefinido no programa ningún final', async () => {
    await engine.play(makePad({ repeat: 0 }));
    expect(ctx.sources[0].loop).toBe(true);
    expect(ctx.sources[0].stopped).toBeNull();
    expect(engine.getVoices()[0].endsAt).toBeNull();
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

  it('quien se suscribe recibe lo que YA está sonando', async () => {
    // Es el fallo que dejaba un bucle imposible de parar: el tablero se
    // desmontaba al cambiar de pestaña y al volver se suscribía en cero, sin
    // ver la voz viva, con el botón de pánico deshabilitado.
    await engine.play(makePad({ id: 'lluvia', repeat: 0 }));

    let recibido: string[] = [];
    engine.subscribe(voces => { recibido = voces.map(v => v.padId); });

    expect(recibido).toEqual(['lluvia']);
  });

  it('avisa a los suscriptores al disparar y al terminar', async () => {
    const visto: number[] = [];
    engine.subscribe(voices => visto.push(voices.length));

    await engine.play(makePad({ id: 'a' }));
    ctx.sources[0].finish();

    // El primer 0 es la entrega inicial de subscribe().
    expect(visto).toEqual([0, 1, 0]);
  });

  it('retirar un disparo lo corta de inmediato, sin el fundido del pad', async () => {
    // Un pad disparado sin querer al empezar a desplazar la grilla: la idea es
    // que no llegue a oírse, no que se apague con gracia.
    const voiceId = await engine.play(makePad({ fadeOutMs: 3000 }));
    engine.retract(voiceId!);

    expect(ctx.sources[0].stopped).toBeCloseTo(0.015);
  });

  // ── Recorte no destructivo ──────────────────────────────────────────────
  // El buffer del doble dura 2 s.

  it('sin recorte suena el archivo entero desde el principio', async () => {
    await engine.play(makePad({ repeat: 1 }));
    expect(ctx.sources[0].startArgs).toEqual([0, 0, 2]);
  });

  it('con recorte arranca en la marca y dura sólo la ventana', async () => {
    await engine.play(makePad({ repeat: 1, trimStartMs: 500, trimEndMs: 1500 }));
    expect(ctx.sources[0].startArgs).toEqual([0, 0.5, 1]);
    expect(ctx.sources[0].stopped).toBeCloseTo(1);
  });

  it('en bucle, el recorte va en loopStart/loopEnd y no en start()', async () => {
    // El tercer argumento de start() limita el TOTAL reproducido: pasarlo con
    // loop activo cortaría el bucle al final de la primera pasada.
    await engine.play(makePad({ repeat: 0, trimStartMs: 400, trimEndMs: 1400 }));
    const src = ctx.sources[0];
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBeCloseTo(0.4);
    expect(src.loopEnd).toBeCloseTo(1.4);
    expect(src.startArgs).toEqual([0, 0.4, undefined]);
    expect(src.stopped).toBeNull();
  });

  it('las repeticiones cuentan la ventana recortada, no el archivo', async () => {
    // Tres pasadas de un recorte de 1 s son 3 s, no 6.
    await engine.play(makePad({ repeat: 3, trimStartMs: 500, trimEndMs: 1500 }));
    expect(ctx.sources[0].stopped).toBeCloseTo(3);
  });

  it('un recorte incoherente hace sonar el archivo entero, no silencio', async () => {
    await engine.play(makePad({ repeat: 1, trimStartMs: 1800, trimEndMs: 200 }));
    expect(ctx.sources[0].startArgs).toEqual([0, 0, 2]);
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

  it('dos disparos simultáneos del mismo archivo lo decodifican una sola vez', async () => {
    // Sin `await` entre medio: es el caso que ejercita la deduplicación de
    // decodificaciones en vuelo, que el caché de buffers por sí solo no cubre.
    const spy = vi.spyOn(ctx, 'decodeAudioData');
    await Promise.all([
      engine.play(makePad({ id: 'a', fileKey: 'k1', overlay: true })),
      engine.play(makePad({ id: 'b', fileKey: 'k1', overlay: true })),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('olvidar un archivo obliga a decodificarlo otra vez', async () => {
    const spy = vi.spyOn(ctx, 'decodeAudioData');
    await engine.play(makePad({ fileKey: 'k1' }));
    engine.forget('k1');
    await engine.play(makePad({ fileKey: 'k1' }));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
