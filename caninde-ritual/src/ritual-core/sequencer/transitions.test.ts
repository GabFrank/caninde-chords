import { describe, it, expect } from 'vitest';
import type { Track } from '../model/track';
import { planTransition } from './transitions';

const local = (id: string): Track => ({
  id,
  title: id,
  durationMs: 1000,
  tags: [],
  source: { provider: 'local', externalId: id },
  audioMeta: { keyCamelot: '8A', bpm: 70 },
});
const spotify = (id: string): Track => ({
  id,
  title: id,
  durationMs: 1000,
  tags: [],
  source: { provider: 'spotify', externalId: id },
  audioMeta: { keyCamelot: '8A', bpm: 70 },
});

describe('planTransition', () => {
  it('crossfade real sólo entre locales', () => {
    expect(planTransition(local('a'), local('b')).kind).toBe('crossfade');
  });

  it('entre proveedores sellados: fade a silencio con naturaleza cubriendo', () => {
    const t = planTransition(spotify('a'), local('b'), { ambientAvailable: true });
    expect(t.kind).toBe('fade-to-silence');
    expect(t.natureCover).toBe(true);
  });

  it('sin capa de naturaleza disponible, no la marca', () => {
    const t = planTransition(spotify('a'), spotify('b'), { ambientAvailable: false });
    expect(t.natureCover).toBe(false);
  });

  it('primer elemento entra con fade suave sin costura', () => {
    const t = planTransition(undefined, local('a'));
    expect(t.natureCover).toBe(false);
  });
});
