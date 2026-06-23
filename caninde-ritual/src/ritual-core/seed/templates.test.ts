import { describe, it, expect } from 'vitest';
import { generate } from '../sequencer/generator';
import { sequenceDurationMs, trackElements } from '../model/sequence';
import { validateTemplate } from '../model/validate';
import {
  SEED_ATTRIBUTES,
  SEED_LIBRARY,
  SEED_RAPE_TEMPLATE,
  SEED_TEMPLATES,
} from './library';

describe('plantillas semilla', () => {
  it('todas validan sin errores contra la biblioteca y los atributos', () => {
    for (const tpl of SEED_TEMPLATES) {
      const res = validateTemplate(tpl, SEED_LIBRARY, SEED_ATTRIBUTES);
      expect(res.errors, `${tpl.id}: ${res.errors.join(' | ')}`).toEqual([]);
      expect(res.ok).toBe(true);
    }
  });

  it('tienen ids únicos', () => {
    const ids = SEED_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('rapé — Soplo y Tierra (~30min)', () => {
  const gen = (seed: number) =>
    generate(SEED_RAPE_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, { seed, temperature: 0.4 });

  it('es reproducible por semilla', () => {
    expect(gen(7)).toEqual(gen(7));
  });

  it('respeta la duración total (deriva acotada)', () => {
    const drift = Math.abs(sequenceDurationMs(gen(7)) - SEED_RAPE_TEMPLATE.totalDurationMs);
    expect(drift).toBeLessThan(2 * 60_000);
  });

  it('abre con el ícaro y cierra a tierra', () => {
    const tracks = trackElements(gen(3));
    expect(tracks[0].trackId).toBe('icaro-apertura');
    expect(tracks[tracks.length - 1].trackId).toBe('cierre-tierra');
  });

  it('coloca el soplo (fuego-interior) y el silencio de quietud', () => {
    const seq = gen(3);
    expect(seq.elements.some((e) => e.trackId === 'fuego-interior')).toBe(true);
    expect(seq.elements.filter((e) => e.kind === 'silence').length).toBe(1);
  });

  it('nunca repite el mismo tema dos veces seguidas', () => {
    const tracks = trackElements(gen(21));
    for (let i = 1; i < tracks.length; i++) {
      expect(tracks[i].trackId).not.toBe(tracks[i - 1].trackId);
    }
  });
});
