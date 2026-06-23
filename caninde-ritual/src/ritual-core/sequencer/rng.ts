// Generador de números pseudoaleatorios determinista por semilla (ver doc §6).
//
// "Azar controlado (temperatura + semilla) → misma plantilla, ceremonia distinta."
// Misma semilla ⇒ misma secuencia, reproducible para tests y para repetir una
// ceremonia que gustó. Usa mulberry32: rápido, sin dependencias, bien distribuido.

export interface Rng {
  /** Siguiente flotante en [0, 1). */
  next(): number;
  /** Entero en [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Elige un elemento del array (no muta). */
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seed: number): Rng {
  // Estado de 32 bits.
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
  };
}

/**
 * Selección estilo softmax con temperatura sobre una lista de candidatos puntuados.
 * - temperature → 0: casi siempre el mejor (determinista, codicioso).
 * - temperature alto: más exploración, ceremonias más variadas.
 * Devuelve el índice elegido.
 */
export function pickWeighted(
  scores: number[],
  temperature: number,
  rng: Rng,
): number {
  if (scores.length === 0) return -1;
  if (scores.length === 1) return 0;

  const temp = Math.max(temperature, 1e-3);
  // Estabilidad numérica: restamos el máximo antes de exponenciar.
  const maxScore = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - maxScore) / temp));
  const total = weights.reduce((acc, w) => acc + w, 0);
  if (total <= 0) return 0;

  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
