// Motor de generación (ver doc §6).
//
// Recorre la curva REGIÓN POR REGIÓN. En cada tramo: coloca las anclas que caen ahí,
// rellena el tiempo restante eligiendo el mejor candidato por puntaje (con azar
// controlado por temperatura + semilla) e inserta los silencios planificados.
// Devuelve un BORRADOR editable. Misma plantilla + misma semilla → misma ceremonia.
//
// Estrategia: se resuelven las anclas a un tiempo de inicio objetivo y se ordenan; el
// relleno se hace por TRAMOS entre anclas, reservando el espacio de cada ancla para no
// pisar la duración total ni dejar fuera al tema de cierre.

import type { AttributeDefinition } from '../model/attributes';
import type { Track } from '../model/track';
import type { FixedAnchor, RitualTemplate } from '../model/template';
import { regionAt } from '../model/template';
import type { GeneratedSequence, SequenceElement } from '../model/sequence';
import { makeRng, pickWeighted, type Rng } from './rng';
import { DEFAULT_WEIGHTS, scoreCandidate, type ScoreWeights } from './scoring';
import { planTransition } from './transitions';

export interface GenerateOptions {
  /** Semilla de reproducibilidad. */
  seed?: number;
  /** Temperatura del azar controlado (0 = codicioso, alto = explorador). */
  temperature?: number;
  /** Pesos del scoring (emotional/transition/novelty). Por defecto los del doc §6. */
  weights?: Partial<ScoreWeights>;
}

const EPS_MS = 500;
const MIN_SLOT_MS = 30_000; // no abrir un hueco si queda menos de 30s

interface ResolvedAnchor {
  anchor: FixedAnchor;
  track: Track;
  /** Tiempo de inicio objetivo (ms) según el tipo de colocación. */
  startTarget: number;
}

export function generate(
  template: RitualTemplate,
  library: Track[],
  attributeDefs: AttributeDefinition[],
  options: GenerateOptions = {},
): GeneratedSequence {
  const seed = options.seed ?? 1;
  const temperature = options.temperature ?? 0.4;
  const weights: ScoreWeights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const rng = makeRng(seed);
  const total = template.totalDurationMs;
  const ambientAvailable = !!template.ambient?.enabled;

  const defs = new Map(attributeDefs.map((d) => [d.id, d]));
  const byId = new Map(library.map((t) => [t.id, t]));
  const warnings: string[] = [];

  if (library.length < 4) {
    warnings.push(
      `Biblioteca chica (${library.length} temas): habrá repeticiones. Sumá más música.`,
    );
  }

  const anchors = resolveAnchors(template, byId, total, warnings);
  const silences = [...template.silences]
    .map((s) => ({ absMs: clamp(s.t, 0, 1) * total, durationMs: s.durationMs }))
    .sort((a, b) => a.absMs - b.absMs);
  let silenceIdx = 0;

  const elements: SequenceElement[] = [];
  let cursor = 0;
  // `prev` cuida la costura armónica (lo corta un silencio). `lastTrackId` aplica la
  // regla dura "nunca dos veces seguidas" y NO se resetea con los silencios.
  let prev: Track | undefined;
  let lastTrackId: string | undefined;
  const recent: string[] = []; // más reciente primero

  const insertDueSilences = (): void => {
    while (silenceIdx < silences.length && silences[silenceIdx].absMs <= cursor + EPS_MS) {
      const s = silences[silenceIdx];
      const durationMs = Math.min(s.durationMs, total - cursor);
      if (durationMs > 0) {
        elements.push({ kind: 'silence', startMs: cursor, durationMs });
        cursor += durationMs;
        prev = undefined; // el silencio corta la costura armónica
      }
      silenceIdx++;
    }
  };

  const placeTrack = (track: Track, durationMs: number): void => {
    if (durationMs <= 0) return;
    const transitionIn = planTransition(prev, track, { ambientAvailable });
    elements.push({ kind: 'track', trackId: track.id, startMs: cursor, durationMs, transitionIn });
    cursor += durationMs;
    prev = track;
    lastTrackId = track.id;
    recent.unshift(track.id);
  };

  // Rellena con temas hasta acercarse a `limitMs` sin pasarse. `excludeNextId` evita
  // que el último relleno coincida con el ancla que viene justo después (sería un
  // "dos veces seguidas" al colocarla).
  const fillUntil = (limitMs: number, excludeNextId?: string): void => {
    while (true) {
      insertDueSilences();
      const remaining = limitMs - cursor;
      if (remaining < MIN_SLOT_MS) break;

      const t = cursor / total;
      const region = regionAt(template.regions, t);
      const candidate = pickCandidate(
        library,
        { prev, recent, targets: region?.targets ?? [], defs, weights },
        [lastTrackId, excludeNextId],
        temperature,
        rng,
      );
      if (!candidate) {
        warnings.push(
          `Sin candidatos para el tramo en t=${t.toFixed(2)} (${region?.name ?? 'sin región'}).`,
        );
        break;
      }
      // No pisar el límite del tramo: si el tema no entra entero, se acorta (fade temprano).
      placeTrack(candidate, Math.min(candidate.durationMs, remaining));
    }
  };

  // Relleno por tramos: antes de cada ancla, hasta su inicio objetivo; luego el ancla.
  for (const a of anchors) {
    fillUntil(a.startTarget, a.track.id);
    insertDueSilences();
    // Las anclas son OBLIGATORIAS: van con su duración completa (sin recortar).
    placeTrack(a.track, a.track.durationMs);
    if (cursor > total + EPS_MS) {
      warnings.push(`El ancla "${a.track.title}" empuja la ceremonia más allá de la duración total.`);
    }
  }

  // Relleno final hasta completar la duración total.
  fillUntil(total);
  insertDueSilences();

  const finalDuration = elements.reduce((acc, el) => acc + el.durationMs, 0);
  const driftMs = Math.abs(finalDuration - total);
  if (driftMs > 2 * MIN_SLOT_MS) {
    warnings.push(
      `Duración generada (${msToMin(finalDuration)}) vs objetivo (${msToMin(total)}): ` +
        `diferencia de ${msToMin(driftMs)}.`,
    );
  }

  return { templateId: template.id, seed, elements, warnings };
}

function pickCandidate(
  library: Track[],
  ctx: Parameters<typeof scoreCandidate>[1],
  excludeIds: Array<string | undefined>,
  temperature: number,
  rng: Rng,
): Track | undefined {
  // Regla dura: nunca el mismo tema dos veces seguidas (ni a través de un silencio,
  // ni como relleno pegado a un ancla idéntica).
  const banned = new Set(excludeIds.filter((id): id is string => !!id));
  const candidates = library.filter((track) => !banned.has(track.id));
  if (candidates.length === 0) return undefined;
  const scores = candidates.map((c) => scoreCandidate(c, ctx));
  const idx = pickWeighted(scores, temperature, rng);
  return candidates[idx];
}

function resolveAnchors(
  template: RitualTemplate,
  byId: Map<string, Track>,
  total: number,
  warnings: string[],
): ResolvedAnchor[] {
  const resolved: ResolvedAnchor[] = [];
  const floating: FixedAnchor[] = [];

  for (const anchor of template.anchors) {
    const track = byId.get(anchor.trackId);
    if (!track) {
      warnings.push(`Ancla con track inexistente (${anchor.trackId}); se omite.`);
      continue;
    }
    const p = anchor.placement;
    if (p.type === 'time') {
      resolved.push({ anchor, track, startTarget: clamp(p.t, 0, 1) * total });
    } else if (p.type === 'region') {
      const region = template.regions.find((r) => r.id === p.regionId);
      if (!region) {
        warnings.push(`Ancla en región inexistente (${p.regionId}); se trata como "anywhere".`);
        floating.push(anchor);
        continue;
      }
      // `end` ⇒ el tema CIERRA el tramo: empieza tan tarde como para terminar en endT.
      const startTarget =
        p.position === 'start'
          ? region.startT * total
          : p.position === 'end'
            ? region.endT * total - track.durationMs
            : (region.startT + region.endT) / 2 * total;
      resolved.push({ anchor, track, startTarget: clamp(startTarget, 0, total) });
    } else {
      floating.push(anchor);
    }
  }

  // Distribuye las anclas "anywhere" repartidas a lo largo de la línea de tiempo.
  floating.forEach((anchor, i) => {
    const track = byId.get(anchor.trackId)!;
    const startTarget = ((i + 1) / (floating.length + 1)) * total;
    resolved.push({ anchor, track, startTarget });
  });

  return resolved.sort((a, b) => a.startTarget - b.startTarget);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function msToMin(ms: number): string {
  return `${Math.round(ms / 60000)}min`;
}
