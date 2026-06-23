// Modelo de plantilla de ritual (ver doc §5).
//
// El ritual se diseña como una CURVA de energía vs tiempo (ambos 0..1), dividida en
// REGIONES que describen el clima emocional de cada tramo. Sobre eso se clavan
// ANCLAS (temas obligatorios), SILENCIOS planificados y una capa de NATURALEZA.

import type { AttributeTarget } from './attributes';

/** Un punto de la curva de energía: `t` y `energy` en 0..1. */
export interface CurvePoint {
  t: number;
  energy: number;
}

/** Un tramo del viaje con su clima emocional (objetivos de atributos). */
export interface Region {
  id: string;
  name?: string;
  /** Inicio normalizado 0..1. */
  startT: number;
  /** Fin normalizado 0..1. */
  endT: number;
  targets: AttributeTarget[];
}

/** Dónde se clava un ancla. */
export type AnchorPlacement =
  | { type: 'time'; t: number }
  | { type: 'region'; regionId: string; position: 'start' | 'end' | 'any' }
  | { type: 'anywhere' };

/** Un tema obligatorio clavado en el ritual. */
export interface FixedAnchor {
  id: string;
  trackId: string;
  placement: AnchorPlacement;
}

/** Un silencio intencional. */
export interface PlannedSilence {
  id: string;
  /** Posición normalizada 0..1. */
  t: number;
  durationMs: number;
}

/** Capa de naturaleza/silencios que tapa las costuras entre proveedores sellados. */
export interface AmbientLayer {
  enabled: boolean;
  /** Track local de naturaleza usado como loop de fondo. */
  trackId?: string;
  /** Volumen base 0..1. */
  baseVolume: number;
}

export interface RitualTemplate {
  id: string;
  name: string;
  totalDurationMs: number;
  curve: CurvePoint[];
  regions: Region[];
  anchors: FixedAnchor[];
  silences: PlannedSilence[];
  ambient?: AmbientLayer;
}

/** Energía interpolada de la curva en una posición `t` (0..1). */
export function energyAt(curve: CurvePoint[], t: number): number {
  if (curve.length === 0) return 0;
  const sorted = [...curve].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].energy;
  const last = sorted[sorted.length - 1];
  if (t >= last.t) return last.energy;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const ratio = (t - a.t) / span;
      return a.energy + (b.energy - a.energy) * ratio;
    }
  }
  return last.energy;
}

/** Devuelve la región que cubre una posición `t`, o `undefined`. */
export function regionAt(regions: Region[], t: number): Region | undefined {
  return regions.find((r) => t >= r.startT && t < r.endT);
}
