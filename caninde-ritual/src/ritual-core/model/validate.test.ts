import { describe, it, expect } from 'vitest';
import { validateTemplate } from './validate';
import type { RitualTemplate } from './template';
import { SEED_ATTRIBUTES, SEED_LIBRARY, SEED_AYAHUASCA_TEMPLATE } from '../seed/library';

describe('validateTemplate', () => {
  it('la plantilla semilla es válida', () => {
    const res = validateTemplate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('detecta duración no positiva y curva corta', () => {
    const bad: RitualTemplate = {
      ...SEED_AYAHUASCA_TEMPLATE,
      totalDurationMs: 0,
      curve: [{ t: 0, energy: 0.1 }],
    };
    const res = validateTemplate(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('duración'))).toBe(true);
    expect(res.errors.some((e) => e.includes('curva'))).toBe(true);
  });

  it('detecta región invertida (start >= end)', () => {
    const bad: RitualTemplate = {
      ...SEED_AYAHUASCA_TEMPLATE,
      regions: [{ id: 'r', startT: 0.6, endT: 0.4, targets: [] }],
    };
    const res = validateTemplate(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('menor que'))).toBe(true);
  });

  it('detecta ancla con track inexistente', () => {
    const bad: RitualTemplate = {
      ...SEED_AYAHUASCA_TEMPLATE,
      anchors: [{ id: 'x', trackId: 'no-existe', placement: { type: 'anywhere' } }],
    };
    const res = validateTemplate(bad, SEED_LIBRARY);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('inexistente'))).toBe(true);
  });

  it('avisa de huecos entre regiones sin bloquear', () => {
    const gappy: RitualTemplate = {
      ...SEED_AYAHUASCA_TEMPLATE,
      regions: [
        { id: 'a', startT: 0, endT: 0.3, targets: [{ defId: 'calm', weight: 1, min: 1, max: 10 }] },
        { id: 'b', startT: 0.5, endT: 1, targets: [{ defId: 'calm', weight: 1, min: 1, max: 10 }] },
      ],
      anchors: [],
    };
    const res = validateTemplate(gappy);
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.toLowerCase().includes('hueco'))).toBe(true);
  });
});
