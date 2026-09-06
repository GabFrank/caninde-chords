import { describe, it, expect } from 'vitest';
import { resolveShortcut, shortcutIndex, shortcutKeyFor, isTypingTarget } from './padShortcuts';

const cerrado = { modalOpen: false };

describe('shortcutIndex', () => {
  it('la fila de números mapea a las diez primeras posiciones', () => {
    expect(shortcutIndex('1')).toBe(0);
    expect(shortcutIndex('9')).toBe(8);
    expect(shortcutIndex('0')).toBe(9); // el cero va al final, como en el teclado
  });

  it('cualquier otra tecla no es un atajo', () => {
    expect(shortcutIndex('a')).toBeNull();
    expect(shortcutIndex('Enter')).toBeNull();
  });

  it('ida y vuelta con shortcutKeyFor', () => {
    expect(shortcutKeyFor(0)).toBe('1');
    expect(shortcutKeyFor(9)).toBe('0');
    expect(shortcutKeyFor(10)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('reconoce los campos de texto', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as HTMLElement)).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' } as HTMLElement)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as HTMLElement)).toBe(true);
  });

  it('un botón no lo es', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' } as HTMLElement)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('resolveShortcut', () => {
  it('un número dispara el pad de esa posición', () => {
    expect(resolveShortcut({ key: '3' }, cerrado)).toEqual({ kind: 'trigger', index: 2 });
  });

  it('Escape es el pánico', () => {
    expect(resolveShortcut({ key: 'Escape' }, cerrado)).toEqual({ kind: 'panic' });
  });

  it('con un modal abierto, Escape lo cierra y no dispara el pánico', () => {
    // Si no, cerrar el editor callaría el sonido que se estaba probando.
    expect(resolveShortcut({ key: 'Escape' }, { modalOpen: true })).toBeNull();
    expect(resolveShortcut({ key: '3' }, { modalOpen: true })).toBeNull();
  });

  it('no dispara mientras se escribe', () => {
    // Escribir "Trueno 3" en el nombre de un pad no puede hacer sonar el tercero.
    const target = { tagName: 'INPUT' } as HTMLElement;
    expect(resolveShortcut({ key: '3', target }, cerrado)).toBeNull();
  });

  it('ignora las combinaciones con Ctrl, Cmd o Alt', () => {
    expect(resolveShortcut({ key: '1', ctrlKey: true }, cerrado)).toBeNull();
    expect(resolveShortcut({ key: '1', metaKey: true }, cerrado)).toBeNull();
    expect(resolveShortcut({ key: '1', altKey: true }, cerrado)).toBeNull();
  });

  it('mantener la tecla apretada dispara una sola vez', () => {
    expect(resolveShortcut({ key: '1', repeat: true }, cerrado)).toBeNull();
  });
});
