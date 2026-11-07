// Program Change: el mensaje MIDI que le cambia el preset a un pedal.
//
// Son dos bytes y nada más: `[0xC0 | canal, programa]`. El estado byte lleva el
// canal en su mitad baja, y por eso un canal 1 de la vida real viaja como 0.
// Esa diferencia de uno es la fuente clásica de "no me responde el pedal", así
// que acá el canal se maneja SIEMPRE como lo ve el músico (1 a 16) y la
// conversión ocurre en un solo lugar.
//
// Sobre la numeración de los programas: el estándar define 0 a 127, pero muchos
// fabricantes imprimen sus tablas empezando en 1. En el Hologram Microcosm hay
// reportes de usuarios de que el número del manual aparece corrido en uno
// (mandar 22 para cargar lo que la tabla llama 23). Por eso la app NO intenta
// adivinar ni corregir: guarda el número que se manda tal cual, y la interfaz
// trae un botón para probarlo contra el aparato. Averiguarlo una vez, de pie
// frente al pedal, es más barato que una tabla de equivalencias que sólo sirve
// para un modelo.

/** Rango del estándar MIDI para el número de programa. */
export const MIN_PROGRAM = 0;
export const MAX_PROGRAM = 127;

/** Los canales, como los ve el músico: 1 a 16. El Microcosm viene en el 1. */
export const MIN_CHANNEL = 1;
export const MAX_CHANNEL = 16;
export const DEFAULT_CHANNEL = 1;

const esEntero = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n);

export function isValidProgram(n: unknown): n is number {
  return esEntero(n) && n >= MIN_PROGRAM && n <= MAX_PROGRAM;
}

export function isValidChannel(n: unknown): n is number {
  return esEntero(n) && n >= MIN_CHANNEL && n <= MAX_CHANNEL;
}

/**
 * Los bytes de un Program Change.
 *
 * @param program 0..127.
 * @param channel 1..16, como lo ve el músico.
 * @throws si alguno está fuera de rango — mandar basura por MIDI no falla de
 *   forma visible: el pedal simplemente ignora el mensaje, o peor, hace algo
 *   inesperado en medio de la ceremonia.
 */
export function programChangeBytes(program: number, channel: number): Uint8Array {
  if (!isValidProgram(program)) throw new RangeError(`programa fuera de rango: ${program}`);
  if (!isValidChannel(channel)) throw new RangeError(`canal fuera de rango: ${channel}`);
  return new Uint8Array([0xC0 | (channel - 1), program]);
}

/**
 * Lee lo que el usuario escribió en el campo de preset.
 *
 * Devuelve `null` para el campo vacío —que significa "esta canción no toca el
 * pedal"— y `undefined` para algo que no es un número válido, para poder
 * distinguir "lo borró" de "escribió cualquier cosa".
 */
export function parseProgramInput(text: string): number | null | undefined {
  const limpio = text.trim();
  if (limpio === '') return null;
  if (!/^\d{1,3}$/.test(limpio)) return undefined;
  const n = Number(limpio);
  return isValidProgram(n) ? n : undefined;
}

/**
 * ¿Hay que mandar el Program Change al pasar de una canción a otra?
 *
 * No se manda si el preset es el mismo que ya está cargado: en el escenario,
 * dos canciones seguidas con el mismo sonido no tienen por qué provocar un
 * cambio de preset —que en muchos pedales corta la cola del efecto— sólo
 * porque cambió el título en la pantalla.
 *
 * Tampoco se manda si la canción no tiene preset: "sin preset" significa
 * "dejá el pedal como está", no "volvé al preset 0". Querer silencio es una
 * decisión que se toma eligiendo un preset, no omitiéndolo.
 */
export function shouldSendProgram(
  anterior: number | null | undefined,
  siguiente: number | null | undefined,
): boolean {
  if (!isValidProgram(siguiente)) return false;
  return siguiente !== anterior;
}
