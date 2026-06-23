// Compatibilidad armónica de empalmes (ver doc §6).
//
// El motor empalma por armonía (rueda de Camelot) + tempo. Estos datos son OCULTOS:
// nunca se muestran al usuario, sólo guían al secuenciador.
//
// NOTA (doc §9, Fase 1): "reemplazar sequencer/harmonic.ts por pitch-core real".
// CanindéChords no expone `pitch-core` como paquete: su lógica de altura mod 12 vive
// en `src/lib/chordUtils.ts`. Como esta es una app HERMANA (sin paquete compartido
// todavía), portamos acá la misma idea mod-12 y la usamos para mapear tono → Camelot.
// Cuando se extraiga `pitch-core` a un paquete compartido, este archivo lo importa.

import type { AudioMeta } from '../model/track';

/** Notas científicas mod 12 — misma convención que CanindéChords (`chordUtils.ts`). */
export const SCIENTIFIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const FLAT_MAP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
};

export type Mode = 'major' | 'minor';

// Rueda de Camelot: número 1..12 (quintas) + letra (A = menor, B = mayor).
// Mapeo pitch-class (0..11, C=0) → número de Camelot, por modo.
const MAJOR_TO_CAMELOT: Record<number, number> = {
  0: 8, 1: 3, 2: 10, 3: 5, 4: 12, 5: 7, 6: 2, 7: 9, 8: 4, 9: 11, 10: 6, 11: 1,
};
const MINOR_TO_CAMELOT: Record<number, number> = {
  0: 5, 1: 12, 2: 7, 3: 2, 4: 9, 5: 4, 6: 11, 7: 6, 8: 1, 9: 8, 10: 3, 11: 10,
};

/** Índice mod 12 de una nota científica (acepta bemoles). `null` si no se reconoce. */
export function pitchClass(note: string): number | null {
  const normalized = FLAT_MAP[note] ?? note;
  const idx = SCIENTIFIC_NOTES.indexOf(normalized as (typeof SCIENTIFIC_NOTES)[number]);
  return idx === -1 ? null : idx;
}

/** Convierte tono (nota + modo) a código Camelot (ej. C major → `8B`). */
export function toCamelot(note: string, mode: Mode): string | null {
  const pc = pitchClass(note);
  if (pc === null) return null;
  const num = mode === 'major' ? MAJOR_TO_CAMELOT[pc] : MINOR_TO_CAMELOT[pc];
  return `${num}${mode === 'major' ? 'B' : 'A'}`;
}

export interface ParsedCamelot {
  num: number;
  letter: 'A' | 'B';
}

export function parseCamelot(code: string): ParsedCamelot | null {
  const m = code.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2] as 'A' | 'B' };
}

/** Distancia circular entre dos números de la rueda (0..6). */
function wheelDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 12 - d);
}

/**
 * Puntaje de compatibilidad armónica entre dos códigos Camelot (0..1).
 * Reglas clásicas de mezcla armónica:
 *  - mismo código → 1.0
 *  - mismo número, distinta letra (relativo mayor/menor) → 0.9
 *  - ±1 en la rueda, misma letra (vecinos) → 0.8
 *  - ±2 → 0.5
 *  - más lejos → cae hacia 0.
 */
export function camelotScore(a: string, b: string): number {
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  if (!pa || !pb) return 0.5; // desconocido → neutral
  if (pa.num === pb.num && pa.letter === pb.letter) return 1.0;
  if (pa.num === pb.num) return 0.9; // relativo

  const dist = wheelDistance(pa.num, pb.num);
  if (pa.letter === pb.letter) {
    if (dist === 1) return 0.8;
    if (dist === 2) return 0.5;
    return Math.max(0, 0.5 - (dist - 2) * 0.12);
  }
  // distinta letra y distinto número: sólo el "salto de energía" (±1, distinta letra)
  if (dist === 1) return 0.4;
  return Math.max(0, 0.3 - (dist - 1) * 0.05);
}

/** Compatibilidad de tempo entre dos BPM (0..1), tolerando medio/doble tiempo. */
export function tempoScore(fromBpm?: number, toBpm?: number): number {
  if (!fromBpm || !toBpm) return 0.5;
  const candidates = [toBpm, toBpm * 2, toBpm / 2];
  let best = Infinity;
  for (const c of candidates) {
    const rel = Math.abs(fromBpm - c) / fromBpm;
    if (rel < best) best = rel;
  }
  // 0% diff → 1.0 ; ~25% diff → 0.0
  return Math.max(0, 1 - best / 0.25);
}

/** Puntaje armónico combinado (armonía + tempo) entre dos tracks. */
export interface HarmonicResult {
  score: number;
  compatible: boolean;
  harmonicScore: number;
  tempoScore: number;
}

export function harmonicCompatibility(from?: AudioMeta, to?: AudioMeta): HarmonicResult {
  const h = camelotScore(from?.keyCamelot ?? '', to?.keyCamelot ?? '');
  const t = tempoScore(from?.bpm, to?.bpm);
  // La armonía pesa más que el tempo en el clima de una ceremonia.
  const score = h * 0.7 + t * 0.3;
  return { score, compatible: score >= 0.55, harmonicScore: h, tempoScore: t };
}
