import { describe, it, expect } from 'vitest';
import { makeRng, pickWeighted } from './rng';

describe('rng', () => {
  it('es determinista por semilla', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('semillas distintas dan secuencias distintas', () => {
    const a = Array.from({ length: 10 }, makeRng(1).next);
    const b = Array.from({ length: 10 }, makeRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('next() siempre en [0,1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() respeta el rango', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });
});

describe('pickWeighted', () => {
  it('con temperatura baja elige casi siempre el mejor puntaje', () => {
    const rng = makeRng(3);
    const scores = [0.1, 0.2, 0.9, 0.3];
    let best = 0;
    for (let i = 0; i < 200; i++) {
      if (pickWeighted(scores, 0.05, rng) === 2) best++;
    }
    expect(best).toBeGreaterThan(180);
  });

  it('con temperatura alta explora más', () => {
    const rng = makeRng(3);
    const scores = [0.4, 0.5, 0.6, 0.55];
    const chosen = new Set<number>();
    for (let i = 0; i < 200; i++) chosen.add(pickWeighted(scores, 5, rng));
    expect(chosen.size).toBeGreaterThan(1);
  });
});
