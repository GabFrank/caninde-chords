// Validación estructural del modelo (Fase 1, "cerrar el núcleo").
//
// Útil para el editor de plantillas (Fase 4) y antes de persistir (Fase 2): detecta
// curvas/regiones/anclas mal formadas con mensajes claros. No depende de framework.

import type { RitualTemplate } from './template';
import type { Track } from './track';
import type { AttributeDefinition } from './attributes';

export interface ValidationResult {
  ok: boolean;
  /** Problemas que impiden generar una ceremonia válida. */
  errors: string[];
  /** Avisos no bloqueantes (mejorables). */
  warnings: string[];
}

const inUnit = (n: number): boolean => n >= 0 && n <= 1;

/**
 * Valida una plantilla. Si se pasan `library`/`defs`, también chequea referencias
 * (anclas → tracks, objetivos → atributos). Devuelve errores y avisos por separado.
 */
export function validateTemplate(
  template: RitualTemplate,
  library?: Track[],
  defs?: AttributeDefinition[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (template.totalDurationMs <= 0) {
    errors.push('La duración total debe ser mayor a 0.');
  }

  // --- Curva ---
  if (template.curve.length < 2) {
    errors.push('La curva necesita al menos 2 puntos.');
  }
  for (const p of template.curve) {
    if (!inUnit(p.t) || !inUnit(p.energy)) {
      errors.push(`Punto de curva fuera de rango (t=${p.t}, energy=${p.energy}); deben estar en 0..1.`);
    }
  }

  // --- Regiones ---
  const regionIds = new Set<string>();
  const sorted = [...template.regions].sort((a, b) => a.startT - b.startT);
  for (const r of template.regions) {
    if (regionIds.has(r.id)) errors.push(`Región con id duplicado: "${r.id}".`);
    regionIds.add(r.id);
    if (!inUnit(r.startT) || !inUnit(r.endT)) {
      errors.push(`Región "${r.id}" fuera de rango (start=${r.startT}, end=${r.endT}).`);
    }
    if (r.startT >= r.endT) {
      errors.push(`Región "${r.id}": startT (${r.startT}) debe ser menor que endT (${r.endT}).`);
    }
    if (r.targets.length === 0) {
      warnings.push(`Región "${r.id}" sin clima emocional (targets vacíos): se rellena neutral.`);
    }
  }
  // Cobertura y solapamiento.
  if (sorted.length > 0) {
    if (sorted[0].startT > 0) warnings.push('La primera región no arranca en 0: hay un tramo inicial sin clima.');
    if (sorted[sorted.length - 1].endT < 1) warnings.push('La última región no llega a 1: hay un tramo final sin clima.');
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startT < sorted[i - 1].endT) {
        warnings.push(`Regiones "${sorted[i - 1].id}" y "${sorted[i].id}" se solapan.`);
      } else if (sorted[i].startT > sorted[i - 1].endT) {
        warnings.push(`Hueco entre "${sorted[i - 1].id}" y "${sorted[i].id}" (tramo sin clima).`);
      }
    }
  }

  // --- Silencios ---
  for (const s of template.silences) {
    if (!inUnit(s.t)) errors.push(`Silencio "${s.id}" con t fuera de rango (${s.t}).`);
    if (s.durationMs <= 0) errors.push(`Silencio "${s.id}" con duración no positiva.`);
  }

  // --- Referencias opcionales ---
  if (library) {
    const trackIds = new Set(library.map((t) => t.id));
    for (const a of template.anchors) {
      if (!trackIds.has(a.trackId)) {
        errors.push(`Ancla "${a.id}" referencia un track inexistente: "${a.trackId}".`);
      }
      if (a.placement.type === 'region' && !regionIds.has(a.placement.regionId)) {
        errors.push(`Ancla "${a.id}" referencia una región inexistente: "${a.placement.regionId}".`);
      }
    }
    if (template.ambient?.trackId && !trackIds.has(template.ambient.trackId)) {
      warnings.push(`La capa de naturaleza referencia un track inexistente: "${template.ambient.trackId}".`);
    }
  }

  if (defs) {
    const defIds = new Set(defs.map((d) => d.id));
    for (const r of template.regions) {
      for (const t of r.targets) {
        if (!defIds.has(t.defId)) {
          warnings.push(`Región "${r.id}": objetivo sobre un atributo desconocido "${t.defId}".`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
