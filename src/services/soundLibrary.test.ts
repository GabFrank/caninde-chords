import { describe, it, expect } from 'vitest';
import { selectOrphans, formatBytes, formatDuration, makeFileKey } from './soundLibrary';

describe('selectOrphans', () => {
  it('borra lo que ningún pad referencia', () => {
    expect(selectOrphans(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('NUNCA borra una clave protegida, aunque ningún pad la referencie todavía', () => {
    // Este es el caso que causaba pérdida de datos: el audio se escribe antes de
    // que exista su ficha, así que durante esa ventana parece huérfano. Si en
    // ese instante llega un snapshot (un pad creado en otro dispositivo), el
    // archivo que el usuario acaba de elegir se borraba.
    expect(selectOrphans(['recien-escrita', 'vieja'], ['vieja'], ['recien-escrita'])).toEqual([]);
  });

  it('sin nada que conservar, borra todo', () => {
    expect(selectOrphans(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('no borra nada cuando la biblioteca está vacía', () => {
    expect(selectOrphans([], ['a'], ['b'])).toEqual([]);
  });
});

describe('makeFileKey', () => {
  it('produce claves distintas para el mismo nombre', () => {
    expect(makeFileKey('trueno.mp3')).not.toBe(makeFileKey('trueno.mp3'));
  });

  it('neutraliza los caracteres que romperían una ruta', () => {
    expect(makeFileKey('../a b/c.mp3')).not.toMatch(/[/ ]/);
  });

  it('entra en el límite que aceptan las reglas de Firestore', () => {
    expect(makeFileKey('x'.repeat(400) + '.mp3').length).toBeLessThan(200);
  });
});

describe('formateo', () => {
  it('muestra los tamaños en la unidad legible', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('muestra la duración en minutos y segundos', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(undefined)).toBe('--:--');
  });
});
