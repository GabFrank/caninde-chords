// Modelo de clasificación emocional (ver doc §5).
//
// La app clasifica la música por EMOCIÓN, no por datos técnicos. El usuario parte
// de una paleta de fábrica editable y puede crear sus propias clasificaciones.
//
// Tres tipos (`kind`):
//  - `intensity`  → una emoción con intensidad numérica (1..10). Es el tipo principal.
//  - `category`   → opción de una lista cerrada (ej. "momento": apertura/pico/cierre).
//  - `flag`       → booleano (ej. "instrumental").

export type AttributeKind = 'intensity' | 'category' | 'flag';

/** Una clasificación (emoción de fábrica o propia del usuario). */
export interface AttributeDefinition {
  id: string;
  name: string;
  /** Color para la UI (hex). */
  color: string;
  kind: AttributeKind;
  /** Opciones para `category`. */
  options?: string[];
  /** Mínimo para `intensity` (por defecto 1). */
  min?: number;
  /** Máximo para `intensity` (por defecto 10). */
  max?: number;
  /** `true` si viene de la paleta de fábrica. */
  builtIn: boolean;
}

/** El valor que un track tiene para una clasificación dada. */
export interface AttributeValue {
  defId: string;
  /** número (intensity) · string (category) · boolean (flag). */
  value: number | string | boolean;
}

/**
 * El clima emocional deseado de un atributo dentro de una región del ritual.
 * Para `intensity` se usa [min, max]; para `category`/`flag` se usa `equals`.
 * `weight` (0..1) pondera cuánto importa este objetivo frente a los demás.
 */
export interface AttributeTarget {
  defId: string;
  weight: number;
  min?: number;
  max?: number;
  equals?: string | boolean;
}

export const DEFAULT_INTENSITY_MIN = 1;
export const DEFAULT_INTENSITY_MAX = 10;

export function isIntensity(def: AttributeDefinition): boolean {
  return def.kind === 'intensity';
}

/** Devuelve el valor de un track para una clasificación, o `undefined` si no lo tiene. */
export function valueFor(values: AttributeValue[], defId: string): AttributeValue | undefined {
  return values.find((v) => v.defId === defId);
}
