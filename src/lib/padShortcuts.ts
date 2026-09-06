// Atajos de teclado del Soundpad.
//
// Las teclas 1-9 y 0 disparan los diez primeros pads de lo que se esté viendo, y
// Escape es el pánico. La numeración sigue al tablero, así que el modo Organizar
// también decide qué tecla dispara qué.

/** Orden de las teclas: la fila de números tal como está en el teclado. */
export const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

/** Posición del pad que dispara una tecla, o `null` si esa tecla no es un atajo. */
export function shortcutIndex(key: string): number | null {
  const i = SHORTCUT_KEYS.indexOf(key as typeof SHORTCUT_KEYS[number]);
  return i === -1 ? null : i;
}

/** La tecla que dispara el pad de la posición dada, si tiene una. */
export function shortcutKeyFor(index: number): string | null {
  return SHORTCUT_KEYS[index] ?? null;
}

/** Tipos de `input` que NO son escribir: no deben bloquear los atajos. */
const NO_ES_TEXTO = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'];

/**
 * ¿El evento viene de un sitio donde el usuario está escribiendo?
 *
 * Sin esto, escribir "Trueno 3" en el nombre de un pad dispararía el tercer
 * sonido a todo volumen.
 *
 * Un deslizador NO cuenta: tratarlo como campo de texto dejaba al operador sin
 * atajos —y sin pánico— justo después de tocar el volumen general.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'INPUT') {
    const tipo = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
    return !NO_ES_TEXTO.includes(tipo);
  }
  return ['TEXTAREA', 'SELECT'].includes(el.tagName);
}

export interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}

export type ShortcutAction =
  | { kind: 'trigger'; index: number }
  | { kind: 'panic' }
  | null;

/**
 * Qué hay que hacer ante una tecla. Devuelve `null` cuando no corresponde actuar.
 *
 * `modalOpen` importa porque Escape ya cierra los modales: si además disparara el
 * pánico, cerrar el editor callaría el sonido que se estaba probando.
 */
export function resolveShortcut(
  e: ShortcutEvent,
  opts: { modalOpen: boolean; arranging?: boolean },
): ShortcutAction {
  // Con Ctrl, Cmd o Alt las teclas son atajos del navegador o del sistema.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // Mantener la tecla apretada no debe disparar el sonido veinte veces.
  if (e.repeat) return null;

  // El pánico se resuelve ANTES del resto de los guardas: es el único botón que
  // el operador tiene para arreglar un error, y no puede desactivarse porque el
  // foco esté en el buscador o porque se estén acomodando los pads. Sólo cede
  // ante un modal abierto, donde Escape significa "cerrá esto".
  if (e.key === 'Escape') return opts.modalOpen ? null : { kind: 'panic' };

  if (opts.modalOpen) return null;
  // Organizando, los pads no suenan: las teclas de disparo tampoco.
  if (opts.arranging) return null;
  if (isTypingTarget(e.target ?? null)) return null;

  const index = shortcutIndex(e.key);
  return index === null ? null : { kind: 'trigger', index };
}
