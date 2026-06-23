// Modelo de la secuencia generada (ver doc §5).
//
// El motor devuelve un BORRADOR editable: una lista de elementos (track | silence |
// nature) con información de transición, más advertencias para el facilitador.

export type ElementKind = 'track' | 'silence' | 'nature';

/** Tipo de empalme decidido por el planificador de transiciones. */
export type TransitionKind = 'crossfade' | 'fade-to-silence' | 'cut';

export interface TransitionInfo {
  kind: TransitionKind;
  durationMs: number;
  /** `true` si la capa de naturaleza cubre la costura (proveedores sellados). */
  natureCover: boolean;
  /** Compatibilidad armónica del empalme (oculta al usuario). */
  harmonic?: { compatible: boolean; score: number };
  /** Tempo del empalme (oculto al usuario). */
  tempo?: { fromBpm?: number; toBpm?: number; score: number };
}

export interface SequenceElement {
  kind: ElementKind;
  /** Para `track` y `nature`. */
  trackId?: string;
  startMs: number;
  durationMs: number;
  /** Transición de entrada respecto del elemento anterior. */
  transitionIn?: TransitionInfo;
}

export interface GeneratedSequence {
  templateId: string;
  /** Semilla usada: misma plantilla + misma semilla → misma ceremonia. */
  seed: number;
  elements: SequenceElement[];
  warnings: string[];
}

/** Duración total real de la secuencia (suma de elementos). */
export function sequenceDurationMs(seq: GeneratedSequence): number {
  return seq.elements.reduce((acc, el) => acc + el.durationMs, 0);
}

/** Sólo los elementos que son tracks reales (no silencios ni naturaleza). */
export function trackElements(seq: GeneratedSequence): SequenceElement[] {
  return seq.elements.filter((el) => el.kind === 'track');
}
