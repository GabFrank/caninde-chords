import { describe, it, expect } from 'vitest';
import { resolveTrim, hasTrim, MIN_TRIM_SEC } from './padTrim';
import { computePeaks } from './waveform';

describe('resolveTrim', () => {
  it('sin marcas, suena el archivo entero', () => {
    expect(resolveTrim(10)).toEqual({ offsetSec: 0, durationSec: 10 });
  });

  it('recorta por los dos lados', () => {
    expect(resolveTrim(10, 2000, 7000)).toEqual({ offsetSec: 2, durationSec: 5 });
  });

  it('sólo el comienzo', () => {
    expect(resolveTrim(10, 3000)).toEqual({ offsetSec: 3, durationSec: 7 });
  });

  it('sólo el final', () => {
    expect(resolveTrim(10, undefined, 4000)).toEqual({ offsetSec: 0, durationSec: 4 });
  });

  it('acota las marcas que se pasan del archivo', () => {
    expect(resolveTrim(10, -5000, 99999)).toEqual({ offsetSec: 0, durationSec: 10 });
  });

  it('con las marcas invertidas suena entero, no mudo', () => {
    // Un pad mudo en plena ceremonia es mucho peor que uno que suena de más.
    expect(resolveTrim(10, 8000, 2000)).toEqual({ offsetSec: 0, durationSec: 10 });
  });

  it('un recorte más corto que el mínimo se ignora', () => {
    expect(resolveTrim(10, 5000, 5000 + MIN_TRIM_SEC * 1000 / 2))
      .toEqual({ offsetSec: 0, durationSec: 10 });
  });

  it('un audio de duración desconocida no rompe nada', () => {
    expect(resolveTrim(0, 1000, 2000)).toEqual({ offsetSec: 0, durationSec: 0 });
    expect(resolveTrim(NaN)).toEqual({ offsetSec: 0, durationSec: 0 });
  });
});

describe('hasTrim', () => {
  it('distingue un recorte real de uno que no acorta nada', () => {
    expect(hasTrim(10)).toBe(false);
    expect(hasTrim(10, 0, 10000)).toBe(false);
    expect(hasTrim(10, 1000)).toBe(true);
    expect(hasTrim(10, undefined, 9000)).toBe(true);
    // Marcas inconsistentes: no hay recorte, suena entero.
    expect(hasTrim(10, 9000, 1000)).toBe(false);
  });
});

describe('computePeaks', () => {
  it('devuelve un pico por columna', () => {
    expect(computePeaks(new Float32Array(1000), 50)).toHaveLength(50);
  });

  it('normaliza contra el pico global', () => {
    const samples = new Float32Array([0.1, 0.1, 0.5, 0.5]);
    // Un sonido grabado bajo tiene que verse igual que uno fuerte.
    const [bajo, alto] = computePeaks(samples, 2);
    expect(bajo).toBeCloseTo(0.2);  // Float32 no guarda 0.1 exacto
    expect(alto).toBe(1);
  });

  it('toma el valor absoluto: la mitad negativa cuenta igual', () => {
    expect(computePeaks(new Float32Array([-1, 0, 0.5, 0]), 2)).toEqual([1, 0.5]);
  });

  it('un silencio no divide por cero', () => {
    expect(computePeaks(new Float32Array(100), 4)).toEqual([0, 0, 0, 0]);
  });

  it('tolera entradas vacías', () => {
    expect(computePeaks(new Float32Array(0), 10)).toEqual([]);
    expect(computePeaks(new Float32Array(10), 0)).toEqual([]);
  });
});
