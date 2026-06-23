// Puntuación de candidatos (ver doc §6).
//
// En cada hueco a rellenar, el motor elige el mejor candidato por puntaje:
//   emotionalFit (0.6) · transitionFit (0.3) · novelty (0.1)
// con azar controlado (temperatura). Regla dura: nunca el mismo tema dos veces seguidas.

import type { AttributeDefinition, AttributeTarget } from '../model/attributes';
import { valueFor } from '../model/attributes';
import type { Track } from '../model/track';
import { harmonicCompatibility } from './harmonic';

export interface ScoreWeights {
  /** Qué tan bien las emociones del track caen en el clima pedido. */
  emotional: number;
  /** Calidad del empalme con el anterior (armonía + tempo, ocultos). */
  transition: number;
  /** Penaliza temas usados recientemente. */
  novelty: number;
}

/** Pesos por defecto del doc §6. Configurables al generar para afinarlos. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  emotional: 0.6,
  transition: 0.3,
  novelty: 0.1,
};

/**
 * Qué tan bien el track cae en el clima emocional pedido (0..1).
 * Promedio ponderado por `weight` sobre los objetivos de la región.
 */
export function emotionalFit(
  track: Track,
  targets: AttributeTarget[],
  defs: Map<string, AttributeDefinition>,
): number {
  if (targets.length === 0) return 0.5; // sin clima definido → neutral

  let totalWeight = 0;
  let acc = 0;
  for (const target of targets) {
    const weight = target.weight > 0 ? target.weight : 0;
    totalWeight += weight;
    acc += weight * singleTargetFit(track, target, defs.get(target.defId));
  }
  if (totalWeight === 0) return 0.5;
  return acc / totalWeight;
}

function singleTargetFit(
  track: Track,
  target: AttributeTarget,
  def: AttributeDefinition | undefined,
): number {
  const tv = valueFor(track.tags, target.defId);
  if (!tv) return 0; // el track no declara este atributo → no aporta al clima

  const kind = def?.kind ?? inferKind(target);

  if (kind === 'intensity') {
    const value = typeof tv.value === 'number' ? tv.value : Number(tv.value);
    if (Number.isNaN(value)) return 0;
    const min = target.min ?? def?.min ?? 1;
    const max = target.max ?? def?.max ?? 10;
    if (value >= min && value <= max) return 1;
    // Caída lineal fuera del rango, normalizada por la amplitud del atributo.
    const span = (def?.max ?? 10) - (def?.min ?? 1) || 1;
    const dist = value < min ? min - value : value - max;
    return Math.max(0, 1 - dist / span);
  }

  // category / flag → coincidencia exacta.
  if (target.equals === undefined) return 0.5;
  return tv.value === target.equals ? 1 : 0;
}

function inferKind(target: AttributeTarget): 'intensity' | 'category' | 'flag' {
  if (target.min !== undefined || target.max !== undefined) return 'intensity';
  if (typeof target.equals === 'boolean') return 'flag';
  return 'category';
}

/** Qué tan bien empalma el candidato con el track anterior (0..1). Datos ocultos. */
export function transitionFit(prev: Track | undefined, candidate: Track): number {
  if (!prev) return 1; // primer track: no hay costura que cuidar
  return harmonicCompatibility(prev.audioMeta, candidate.audioMeta).score;
}

/**
 * Novedad (0..1): penaliza temas usados recientemente.
 * `recent` es la lista de ids usados, del más reciente al más antiguo.
 */
export function noveltyScore(candidateId: string, recent: string[], window = 6): number {
  const idx = recent.indexOf(candidateId);
  if (idx === -1) return 1; // no usado en la ventana → máxima novedad
  if (idx >= window) return 1;
  // Cuanto más reciente, más penalizado.
  return idx / window;
}

export interface ScoreContext {
  prev?: Track;
  recent: string[];
  targets: AttributeTarget[];
  defs: Map<string, AttributeDefinition>;
  /** Pesos a usar; por defecto `DEFAULT_WEIGHTS`. */
  weights?: ScoreWeights;
}

/** Detalle del puntaje, útil para depurar el afinado de pesos (no se muestra al usuario). */
export interface ScoreBreakdown {
  emotional: number;
  transition: number;
  novelty: number;
  total: number;
}

/** Puntaje desglosado de un candidato combinando los tres factores. */
export function scoreBreakdown(candidate: Track, ctx: ScoreContext): ScoreBreakdown {
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const emotional = emotionalFit(candidate, ctx.targets, ctx.defs);
  const transition = transitionFit(ctx.prev, candidate);
  const novelty = noveltyScore(candidate.id, ctx.recent);
  const total = w.emotional * emotional + w.transition * transition + w.novelty * novelty;
  return { emotional, transition, novelty, total };
}

/** Puntaje total de un candidato combinando los tres factores. */
export function scoreCandidate(candidate: Track, ctx: ScoreContext): number {
  return scoreBreakdown(candidate, ctx).total;
}
