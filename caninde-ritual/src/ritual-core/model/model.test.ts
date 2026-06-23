import { describe, it, expect } from 'vitest';
import { valueFor } from './attributes';
import { energyAt, regionAt } from './template';
import { SEED_AYAHUASCA_TEMPLATE } from '../seed/library';

describe('valueFor', () => {
  it('encuentra el valor de un atributo', () => {
    const tags = [{ defId: 'calm', value: 8 }, { defId: 'depth', value: 6 }];
    expect(valueFor(tags, 'calm')?.value).toBe(8);
    expect(valueFor(tags, 'inexistente')).toBeUndefined();
  });
});

describe('energyAt (interpolación de la curva)', () => {
  const curve = SEED_AYAHUASCA_TEMPLATE.curve;
  it('respeta los extremos', () => {
    expect(energyAt(curve, 0)).toBeCloseTo(0.1);
    expect(energyAt(curve, 1)).toBeCloseTo(0.1);
  });
  it('interpola en el medio', () => {
    const e = energyAt(curve, 0.55);
    expect(e).toBeGreaterThan(0.9);
  });
  it('clampa fuera de rango', () => {
    expect(energyAt(curve, -1)).toBeCloseTo(0.1);
    expect(energyAt(curve, 2)).toBeCloseTo(0.1);
  });
});

describe('regionAt', () => {
  it('devuelve la región que cubre t', () => {
    expect(regionAt(SEED_AYAHUASCA_TEMPLATE.regions, 0.1)?.id).toBe('apertura');
    expect(regionAt(SEED_AYAHUASCA_TEMPLATE.regions, 0.5)?.id).toBe('pico');
    expect(regionAt(SEED_AYAHUASCA_TEMPLATE.regions, 0.95)?.id).toBe('cierre');
  });
});
