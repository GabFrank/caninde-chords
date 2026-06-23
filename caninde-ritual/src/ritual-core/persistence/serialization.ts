// Serialización segura para almacenamiento (Fase 2).
//
// Firestore no acepta `undefined`. Nuestros modelos usan campos opcionales (artist?,
// audioMeta?, ambient?, ...), así que antes de guardar hay que limpiar los `undefined`
// recursivamente (sin tocar `null`, números, arrays ni objetos anidados).

/** Genera un id estable y único (prefijo legible + uuid). */
export function makeId(prefix = 'id'): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const uuid = c?.randomUUID ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${uuid}`;
}

/** Clon profundo (structuredClone si está; si no, vía JSON). */
function deepClone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <V>(v: V) => V }).structuredClone;
  if (sc) return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Devuelve una copia profunda del valor sin claves cuyo valor sea `undefined`.
 * Apto para escribir en Firestore. No muta la entrada.
 */
export function sanitizeForStorage<T>(value: T): T {
  return stripUndefined(deepClone(value)) as T;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}
