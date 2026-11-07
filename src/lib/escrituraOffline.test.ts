import { describe, it, expect, vi } from 'vitest';
import { esperarEscritura } from './escrituraOffline';

/** Una promesa que nunca resuelve: es exactamente `addDoc` sin red. */
const nuncaResuelve = () => new Promise<void>(() => {});

describe('esperarEscritura', () => {
  it('devuelve "confirmado" cuando el servidor acusa a tiempo', async () => {
    const alFallar = vi.fn();
    expect(await esperarEscritura(Promise.resolve('ok'), alFallar, 50)).toBe('confirmado');
    expect(alFallar).not.toHaveBeenCalled();
  });

  it('no se cuelga cuando la escritura nunca resuelve', async () => {
    // Éste es EL caso: sin red, la promesa queda pendiente para siempre y la
    // app quedaba trabada detrás del velo de "SAVING…".
    const antes = Date.now();
    expect(await esperarEscritura(nuncaResuelve(), vi.fn(), 30)).toBe('pendiente');
    expect(Date.now() - antes).toBeLessThan(1000);
  });

  it('devuelve "fallo" y avisa cuando la escritura es rechazada', async () => {
    const alFallar = vi.fn();
    const error = new Error('permission-denied');
    expect(await esperarEscritura(Promise.reject(error), alFallar, 50)).toBe('fallo');
    expect(alFallar).toHaveBeenCalledWith(error);
  });

  it('avisa también si el rechazo llega DESPUÉS del plazo', async () => {
    // Una escritura que el servidor rechaza media hora más tarde no puede
    // quedar como un `unhandledrejection` mudo: el usuario creería que su
    // cambio está guardado.
    const alFallar = vi.fn();
    let rechazar: (e: unknown) => void = () => {};
    const tarde = new Promise((_, rej) => { rechazar = rej; });

    expect(await esperarEscritura(tarde, alFallar, 20)).toBe('pendiente');
    expect(alFallar).not.toHaveBeenCalled();

    const error = new Error('tarde');
    rechazar(error);
    await new Promise(r => setTimeout(r, 10));
    expect(alFallar).toHaveBeenCalledWith(error);
  });

  it('un `alFallar` que lanza no se convierte en un rechazo suelto', async () => {
    // `handleFirestoreError` lanza a propósito; no puede romper esto.
    const alFallar = vi.fn(() => { throw new Error('handleFirestoreError'); });
    expect(await esperarEscritura(Promise.reject(new Error('x')), alFallar, 50)).toBe('fallo');
    expect(alFallar).toHaveBeenCalled();
  });

  it('el fallo gana sobre el plazo cuando llega primero', async () => {
    const alFallar = vi.fn();
    expect(await esperarEscritura(Promise.reject(new Error('x')), alFallar, 500)).toBe('fallo');
  });
});
