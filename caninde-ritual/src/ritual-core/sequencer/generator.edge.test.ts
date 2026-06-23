import { describe, it, expect } from 'vitest';
import { generate } from './generator';
import { trackElements } from '../model/sequence';
import type { RitualTemplate } from '../model/template';
import { SEED_ATTRIBUTES, SEED_LIBRARY, SEED_AYAHUASCA_TEMPLATE } from '../seed/library';

describe('generate — casos de borde', () => {
  it('biblioteca vacía: no crashea, avisa y no produce tracks', () => {
    const seq = generate(SEED_AYAHUASCA_TEMPLATE, [], SEED_ATTRIBUTES, { seed: 1 });
    expect(trackElements(seq).length).toBe(0);
    expect(seq.warnings.length).toBeGreaterThan(0);
  });

  it('biblioteca de 1 tema: no repite dos veces seguidas (corta y avisa)', () => {
    const one = SEED_LIBRARY.slice(0, 1);
    const seq = generate(SEED_AYAHUASCA_TEMPLATE, one, SEED_ATTRIBUTES, { seed: 1 });
    const tracks = trackElements(seq);
    for (let i = 1; i < tracks.length; i++) {
      expect(tracks[i].trackId).not.toBe(tracks[i - 1].trackId);
    }
    // con un solo tema, tras colocarlo no hay candidato → debe terminar sin colgarse
    expect(seq.warnings.some((w) => w.toLowerCase().includes('candidatos') || w.toLowerCase().includes('biblioteca'))).toBe(true);
  });

  it('plantilla sin regiones: rellena igual (clima neutral)', () => {
    const noRegions: RitualTemplate = { ...SEED_AYAHUASCA_TEMPLATE, regions: [], anchors: [], silences: [] };
    const seq = generate(noRegions, SEED_LIBRARY, SEED_ATTRIBUTES, { seed: 3 });
    expect(trackElements(seq).length).toBeGreaterThan(0);
  });

  it('el ancla de apertura abre y la de cierre termina la ceremonia', () => {
    // (los tracks pueden repetirse como relleno, así que verificamos los extremos:
    //  apertura(start) clavada primero, cierre(end) clavada al final).
    const seq = generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, { seed: 9 });
    const tracks = trackElements(seq);
    expect(tracks[0].trackId).toBe('icaro-apertura'); // ancla de apertura
    expect(tracks[tracks.length - 1].trackId).toBe('cierre-tierra'); // ancla de cierre
  });

  it('pesos configurables alteran la selección', () => {
    const a = generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, {
      seed: 11,
      temperature: 0.01,
      weights: { emotional: 1, transition: 0, novelty: 0 },
    });
    const b = generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, {
      seed: 11,
      temperature: 0.01,
      weights: { emotional: 0, transition: 0, novelty: 1 },
    });
    const seqA = a.elements.map((e) => e.trackId).join(',');
    const seqB = b.elements.map((e) => e.trackId).join(',');
    expect(seqA).not.toEqual(seqB);
  });
});
