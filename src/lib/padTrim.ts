// Recorte no destructivo de un sonido.
//
// El archivo NO se toca: se guardan dos marcas en la ficha del pad y el motor
// arranca la reproducción en la primera y la corta en la segunda. Así se puede
// mover el recorte cuantas veces haga falta, o quitarlo, sin haber perdido nada
// del audio original — que además es el mismo archivo que viaja en el pack.

/** Ventana de reproducción, ya resuelta contra la duración real del audio. */
export interface TrimWindow {
  /** Dónde empieza, en segundos desde el inicio del archivo. */
  offsetSec: number;
  /** Cuánto dura la parte que suena, en segundos. */
  durationSec: number;
}

/** Por debajo de esto el recorte no se oiría: se ignora y suena entero. */
export const MIN_TRIM_SEC = 0.05;

/**
 * Resuelve las marcas contra la duración real del archivo.
 *
 * Ante cualquier inconsistencia —marcas invertidas, fuera de rango, un recorte
 * más corto que un parpadeo— devuelve el audio entero. Un pad mudo en plena
 * ceremonia es mucho peor que un pad que suena de más.
 */
export function resolveTrim(
  bufferDurationSec: number,
  trimStartMs?: number,
  trimEndMs?: number,
): TrimWindow {
  const total = Number.isFinite(bufferDurationSec) && bufferDurationSec > 0 ? bufferDurationSec : 0;
  const entero: TrimWindow = { offsetSec: 0, durationSec: total };
  if (total <= 0) return entero;

  const start = Number.isFinite(trimStartMs as number)
    ? Math.max(0, Math.min(total, (trimStartMs as number) / 1000))
    : 0;
  const end = Number.isFinite(trimEndMs as number)
    ? Math.max(0, Math.min(total, (trimEndMs as number) / 1000))
    : total;

  const durationSec = end - start;
  if (durationSec < MIN_TRIM_SEC) return entero;
  return { offsetSec: start, durationSec };
}

/** ¿Este pad tiene un recorte que realmente acorta el audio? */
export function hasTrim(
  bufferDurationSec: number,
  trimStartMs?: number,
  trimEndMs?: number,
): boolean {
  const w = resolveTrim(bufferDurationSec, trimStartMs, trimEndMs);
  return w.offsetSec > 0 || w.durationSec < bufferDurationSec - 0.001;
}
