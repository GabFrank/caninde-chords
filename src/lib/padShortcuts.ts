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

/**
 * ¿El evento viene de un sitio donde el usuario está escribiendo?
 *
 * Sin esto, escribir "Trueno 3" en el nombre de un pad dispararía el tercer
 * sonido a todo volumen.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
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
export function resolveShortcut(e: ShortcutEvent, opts: { modalOpen: boolean }): ShortcutAction {
  // Con Ctrl, Cmd o Alt las teclas son atajos del navegador o del sistema.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // Mantener la tecla apretada no debe disparar el sonido veinte veces.
  if (e.repeat) return null;
  if (isTypingTarget(e.target ?? null)) return null;

  if (e.key === 'Escape') return opts.modalOpen ? null : { kind: 'panic' };
  if (opts.modalOpen) return null;

  const index = shortcutIndex(e.key);
  return index === null ? null : { kind: 'trigger', index };
}
