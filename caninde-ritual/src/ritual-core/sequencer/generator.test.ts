import { describe, it, expect } from 'vitest';
import { generate } from './generator';
import { sequenceDurationMs, trackElements } from '../model/sequence';
import { SEED_ATTRIBUTES, SEED_LIBRARY, SEED_AYAHUASCA_TEMPLATE } from '../seed/library';

const gen = (seed: number) =>
  generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, { seed, temperature: 0.4 });

describe('generate (motor de generación)', () => {
  it('es reproducible: misma plantilla + misma semilla → misma ceremonia', () => {
    expect(gen(42)).toEqual(gen(42));
  });

  it('semillas distintas producen ceremonias distintas', () => {
    const a = gen(1).elements.map((e) => e.trackId).join(',');
    const b = gen(2).elements.map((e) => e.trackId).join(',');
    expect(a).not.toEqual(b);
  });

  it('respeta la duración total (deriva acotada)', () => {
    const seq = gen(7);
    const total = SEED_AYAHUASCA_TEMPLATE.totalDurationMs;
    const drift = Math.abs(sequenceDurationMs(seq) - total);
    // Tolerancia: una franja mínima (~1min) de hueco final.
    expect(drift).toBeLessThan(2 * 60_000);
  });

  it('nunca repite el mismo tema dos veces seguidas', () => {
    const tracks = trackElements(gen(13));
    for (let i = 1; i < tracks.length; i++) {
      // permitido sólo si entre medio hubo un silencio; chequeamos elementos crudos abajo
      expect(tracks[i].trackId).not.toBe(tracks[i - 1].trackId);
    }
  });

  it('coloca todas las anclas obligatorias', () => {
    const ids = new Set(gen(5).elements.map((e) => e.trackId));
    for (const anchor of SEED_AYAHUASCA_TEMPLATE.anchors) {
      expect(ids.has(anchor.trackId)).toBe(true);
    }
  });

  it('inserta los silencios planificados', () => {
    const silences = gen(5).elements.filter((e) => e.kind === 'silence');
    expect(silences.length).toBe(SEED_AYAHUASCA_TEMPLATE.silences.length);
  });

  it('cada track lleva info de transición', () => {
    const seq = gen(5);
    for (const el of trackElements(seq)) {
      expect(el.transitionIn).toBeDefined();
    }
  });

  it('avisa cuando la biblioteca es muy chica', () => {
    const seq = generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY.slice(0, 2), SEED_ATTRIBUTES, { seed: 1 });
    expect(seq.warnings.some((w) => w.toLowerCase().includes('biblioteca'))).toBe(true);
  });
});
