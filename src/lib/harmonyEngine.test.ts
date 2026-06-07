import { describe, it, expect } from 'vitest';
import {
  notesOf, transpose, mod12, getQualityClass,
  getAugmentedPortalCandidates, getCandidates, getDiminishedBridgeCandidates,
  getChromaticMediantCandidates, getDiatonicLadder, analyzeGesture,
  computePhase, getChordString, SongExportAdapter,
  getAllCandidates, getKeepMoodCandidates, getRootVariations,
  Chord, Slot, Composition, Quality, Tool
} from './harmonyEngine';

const C: Chord = { root: 0, quality: 'major' };
const names = (chords: { chord: Chord }[]) => chords.map(c => getChordString(c.chord));
const slotsFrom = (levels: number[]): Slot[] =>
  levels.map((a, i) => ({ id: String(i), chord: C, durationBeats: 4, toolUsed: 'free' as Tool, astralLevel: a }));

describe('primitivas', () => {
  it('notesOf usa clases de altura mod 12', () => {
    expect(notesOf({ root: 0, quality: 'major' })).toEqual([0, 4, 7]);
    expect(notesOf({ root: 9, quality: 'minor' })).toEqual([0, 4, 9]); // Am = A C E
  });
  it('transpose es invariante por traslación', () => {
    expect(transpose(C, 2)).toEqual({ root: 2, quality: 'major' });
    expect(mod12(-1)).toBe(11);
  });
  it('getQualityClass agrupa correctamente', () => {
    expect(getQualityClass('maj7')).toBe('major');
    expect(getQualityClass('min7b5')).toBe('dim');
  });
});

describe('REQ-HRM-02: portal aumentado', () => {
  it('getAugmentedPortal(C) produce {E, Ab, Dbm, Fm, Am} (C excluido)', () => {
    const got = new Set(names(getAugmentedPortalCandidates(C).candidates));
    // El motor usa sostenidos: G#=Ab, C#m=Dbm
    expect(got).toEqual(new Set(['E', 'G#', 'C#m', 'Fm', 'Am']));
  });
  it('transponer la entrada transpone la salida (cualquier tonalidad)', () => {
    for (const k of [2, 5, 7, 11]) {
      const base = getAugmentedPortalCandidates(C).candidates.map(c => mod12(c.chord.root + k)).sort();
      const moved = getAugmentedPortalCandidates({ root: k, quality: 'major' }).candidates.map(c => c.chord.root).sort();
      expect(moved).toEqual(base);
    }
  });
});

describe('REQ-HRM-03: sin acorde actual ni duplicados', () => {
  const tools: Tool[] = ['augmentedPortal', 'diminishedBridge', 'chromaticMediant', 'diatonic', 'modalColor', 'free'];
  for (const tool of tools) {
    it(`getCandidates('${tool}') no repite ni devuelve el actual`, () => {
      const cands = getCandidates(tool, C, { tonic: 0, mode: 'major' });
      const keys = cands.map(c => `${c.chord.root}_${c.chord.quality}`);
      expect(new Set(keys).size).toBe(keys.length); // sin duplicados
      expect(keys).not.toContain('0_major'); // nunca el actual (C)
    });
  }
  it('el puente disminuido ya no duplica major(r+2)', () => {
    const cands = getCandidates('diminishedBridge', C, { tonic: 0, mode: 'major' });
    const d = cands.filter(c => c.chord.root === 2 && c.chord.quality === 'major');
    expect(d.length).toBe(1);
  });
});

describe('teoría diatónica', () => {
  it('la escalera mayor de C es correcta', () => {
    const ladder = getDiatonicLadder(0, 'major');
    expect(ladder.map(d => getChordString(d.chord)))
      .toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  });
});

describe('analyzeGesture', () => {
  it('V (dominante) -> luminoso astral 2', () => {
    const g = analyzeGesture(C, { root: 7, quality: 'major' });
    expect(g.emotion).toBe('luminoso');
    expect(g.astral).toBe(2);
  });
  it('destino aumentado -> ingravidez', () => {
    expect(analyzeGesture(C, { root: 0, quality: 'aug' }).emotion).toBe('ingravidez');
  });
});

describe('REQ-FAS: computePhase (ejemplo de la sección 10)', () => {
  it('[0,1,2,3] -> Portal, apuntando a Cima, cobertura 4/5', () => {
    const p = computePhase(slotsFrom([0, 1, 2, 3]));
    expect(p.phase).toBe('Portal');
    expect(p.trend).toBe('subiendo');
    expect(p.pointingTo).toBe('Cima');
    expect(p.coverage).toBeCloseTo(0.8);
    expect(p.peak).toBe(3);
  });
  it('vacío -> Anclaje', () => {
    expect(computePhase([]).phase).toBe('Anclaje');
  });
});

describe('modo Sencillo (emotion-first)', () => {
  const key = { tonic: 0, mode: 'major' as const };
  it('getAllCandidates no incluye el actual ni duplicados', () => {
    const cands = getAllCandidates(C, key);
    expect(cands.length).toBeGreaterThan(0);
    const keys = cands.map(c => `${c.chord.root}_${c.chord.quality}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('0_major');
  });
  it('getKeepMoodCandidates respeta el límite y excluye el actual', () => {
    const keep = getKeepMoodCandidates(C, key, 4);
    expect(keep.length).toBeLessThanOrEqual(4);
    expect(keep.every(c => !(c.chord.root === 0 && c.chord.quality === 'major'))).toBe(true);
  });
  it('getRootVariations devuelve variaciones del root con emoción en contexto', () => {
    const vars = getRootVariations(C, 7); // sobre G
    expect(vars.length).toBeGreaterThan(5);
    expect(vars.every(v => v.chord.root === 7 && typeof v.emotion === 'string')).toBe(true);
  });
});

describe('REQ-INT/REQ-DAT: round-trip de Composition sin pérdida', () => {
  it('export -> import preserva slots, tono, ritmo y voicings', () => {
    const comp: Composition = {
      id: 'x', title: 'T', key: { tonic: 4, mode: 'minor' },
      tempo: { bpm: 88, timeSignature: [4, 4] },
      defaultArticulation: 'arpeggio', rhythmPatternId: 'vals', instrument: 'guitar',
      slots: [
        { id: '1', chord: { root: 4, quality: 'minor' }, durationBeats: 4, toolUsed: 'free', emotion: 'melancolico', astralLevel: 1, voicing: { frets: [0, 2, 2, 0, 0, 0] }, lyric: 'hola', section: 'Intro' },
        { id: '2', chord: { root: 0, quality: 'aug' }, durationBeats: 8, toolUsed: 'augmentedPortal', emotion: 'ingravidez', astralLevel: 3, voicing: { frets: [-1, 3, 2, 1, 1, 0] }, section: 'Verso' }
      ],
      meta: { createdWith: 'x', specVersion: '1.0', createdAt: '', updatedAt: '' }
    };
    const content = SongExportAdapter.toHostSongContent(comp);
    const back = SongExportAdapter.fromHostSongContent('T', content, 'u');
    expect(back.slots.length).toBe(2);
    expect(back.key).toEqual({ tonic: 4, mode: 'minor' });
    expect(back.rhythmPatternId).toBe('vals');
    expect(back.slots[1].chord.quality).toBe('aug');
    expect(back.slots[1].voicing?.frets).toEqual([-1, 3, 2, 1, 1, 0]);
    expect(back.slots[0].section).toBe('Intro');
    expect(back.slots[1].section).toBe('Verso');
  });
});
