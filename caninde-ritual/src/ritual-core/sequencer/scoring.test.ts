import { describe, it, expect } from 'vitest';
import type { AttributeDefinition, AttributeTarget } from '../model/attributes';
import type { Track } from '../model/track';
import { emotionalFit, noveltyScore, transitionFit } from './scoring';

const defs = new Map<string, AttributeDefinition>([
  ['calm', { id: 'calm', name: 'Calma', color: '#000', kind: 'intensity', min: 1, max: 10, builtIn: true }],
  ['moment', { id: 'moment', name: 'Momento', color: '#000', kind: 'category', options: ['apertura', 'pico'], builtIn: true }],
]);

function track(tags: Track['tags'], audioMeta?: Track['audioMeta']): Track {
  return { id: 't', title: 't', durationMs: 1000, tags, source: { provider: 'local', externalId: 'x' }, audioMeta };
}

describe('emotionalFit', () => {
  it('1 cuando la intensidad cae dentro del rango', () => {
    const targets: AttributeTarget[] = [{ defId: 'calm', weight: 1, min: 7, max: 10 }];
    expect(emotionalFit(track([{ defId: 'calm', value: 8 }]), targets, defs)).toBe(1);
  });

  it('cae fuera del rango', () => {
    const targets: AttributeTarget[] = [{ defId: 'calm', weight: 1, min: 7, max: 10 }];
    const inside = emotionalFit(track([{ defId: 'calm', value: 8 }]), targets, defs);
    const outside = emotionalFit(track([{ defId: 'calm', value: 3 }]), targets, defs);
    expect(outside).toBeLessThan(inside);
  });

  it('coincidencia de categoría', () => {
    const targets: AttributeTarget[] = [{ defId: 'moment', weight: 1, equals: 'pico' }];
    expect(emotionalFit(track([{ defId: 'moment', value: 'pico' }]), targets, defs)).toBe(1);
    expect(emotionalFit(track([{ defId: 'moment', value: 'apertura' }]), targets, defs)).toBe(0);
  });

  it('sin objetivos → neutral', () => {
    expect(emotionalFit(track([]), [], defs)).toBe(0.5);
  });
});

describe('transitionFit', () => {
  it('sin previo = 1', () => {
    expect(transitionFit(undefined, track([]))).toBe(1);
  });
  it('claves compatibles puntúan más que incompatibles', () => {
    const prev = track([], { keyCamelot: '8A', bpm: 70 });
    const good = transitionFit(prev, track([], { keyCamelot: '8A', bpm: 71 }));
    const bad = transitionFit(prev, track([], { keyCamelot: '3B', bpm: 128 }));
    expect(good).toBeGreaterThan(bad);
  });
});

describe('noveltyScore', () => {
  it('no usado = 1', () => {
    expect(noveltyScore('x', ['a', 'b', 'c'])).toBe(1);
  });
  it('usado recientemente penaliza más', () => {
    expect(noveltyScore('a', ['a', 'b', 'c'])).toBeLessThan(noveltyScore('c', ['a', 'b', 'c']));
  });
});
