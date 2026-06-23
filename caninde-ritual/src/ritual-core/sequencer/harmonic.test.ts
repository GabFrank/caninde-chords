import { describe, it, expect } from 'vitest';
import {
  camelotScore,
  harmonicCompatibility,
  parseCamelot,
  pitchClass,
  tempoScore,
  toCamelot,
} from './harmonic';

describe('pitchClass (mod 12, estilo CanindéChords)', () => {
  it('mapea notas y bemoles', () => {
    expect(pitchClass('C')).toBe(0);
    expect(pitchClass('A')).toBe(9);
    expect(pitchClass('Bb')).toBe(pitchClass('A#'));
    expect(pitchClass('Db')).toBe(pitchClass('C#'));
  });
  it('devuelve null para basura', () => {
    expect(pitchClass('H')).toBeNull();
  });
});

describe('toCamelot', () => {
  it('C major → 8B, A minor → 8A (relativos)', () => {
    expect(toCamelot('C', 'major')).toBe('8B');
    expect(toCamelot('A', 'minor')).toBe('8A');
  });
});

describe('parseCamelot', () => {
  it('parsea códigos válidos', () => {
    expect(parseCamelot('8A')).toEqual({ num: 8, letter: 'A' });
    expect(parseCamelot('12b')).toEqual({ num: 12, letter: 'B' });
  });
  it('rechaza inválidos', () => {
    expect(parseCamelot('13A')).toBeNull();
    expect(parseCamelot('xx')).toBeNull();
  });
});

describe('camelotScore', () => {
  it('idéntico = 1', () => {
    expect(camelotScore('8A', '8A')).toBe(1);
  });
  it('relativo (mismo número, distinta letra) alto', () => {
    expect(camelotScore('8A', '8B')).toBeGreaterThanOrEqual(0.85);
  });
  it('vecino en la rueda mejor que lejano', () => {
    expect(camelotScore('8A', '9A')).toBeGreaterThan(camelotScore('8A', '2A'));
  });
  it('desconocido → neutral 0.5', () => {
    expect(camelotScore('', '8A')).toBe(0.5);
  });
});

describe('tempoScore', () => {
  it('mismo bpm = 1', () => {
    expect(tempoScore(120, 120)).toBe(1);
  });
  it('tolera medio/doble tiempo', () => {
    expect(tempoScore(120, 60)).toBe(1);
  });
  it('bpm faltante → neutral', () => {
    expect(tempoScore(undefined, 120)).toBe(0.5);
  });
});

describe('harmonicCompatibility', () => {
  it('combina armonía y tempo', () => {
    const r = harmonicCompatibility(
      { keyCamelot: '8A', bpm: 70 },
      { keyCamelot: '8A', bpm: 72 },
    );
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.compatible).toBe(true);
  });
  it('claves lejanas → menos compatible', () => {
    const r = harmonicCompatibility(
      { keyCamelot: '8A', bpm: 70 },
      { keyCamelot: '2B', bpm: 130 },
    );
    expect(r.score).toBeLessThan(0.5);
  });
});
