import { describe, expect, it } from 'vitest';
import { resolveLayout } from './useViewport';

describe('resolveLayout', () => {
  it('teléfono vertical: un panel', () => {
    expect(resolveLayout(390, 844).mode).toBe('compact');
  });

  it('teléfono horizontal: un panel, aunque supere los 700px de ancho', () => {
    // El bug original: 844 >= 768 lo trataba como escritorio con 390px de alto.
    const v = resolveLayout(844, 390);
    expect(v.mode).toBe('compact');
    expect(v.isShort).toBe(true);
    expect(v.isLandscape).toBe(true);
  });

  it('tablet de 7-8" da el mismo layout en las dos orientaciones', () => {
    // Antes cambiaba de interfaz al girarla: 744 < 768 en vertical.
    expect(resolveLayout(744, 1133).mode).toBe('regular');
    expect(resolveLayout(1133, 744).mode).toBe('regular');
  });

  it('tablet de 10" en las dos orientaciones', () => {
    expect(resolveLayout(820, 1180).mode).toBe('regular');
    expect(resolveLayout(1180, 820).mode).toBe('regular');
  });

  it('ventana de escritorio baja sigue siendo escritorio', () => {
    // 1600x520: el alto no puede degradar el layout si sobra ancho.
    const v = resolveLayout(1600, 520);
    expect(v.mode).toBe('regular');
    expect(v.isShort).toBe(true);
  });

  it('tablet apaisada con el teclado abierto no cambia de modo por sí sola', () => {
    // 1024x340 es lo que informa el navegador con el teclado desplegado. El hook
    // no llega a llamar aquí (descarta el evento), pero si lo hiciera, un ancho
    // de 1024 no alcanza para ignorar el alto y caería a compact: por eso el
    // filtro del teclado es obligatorio, no una optimización.
    expect(resolveLayout(1024, 340).mode).toBe('compact');
    expect(resolveLayout(1024, 768).mode).toBe('regular');
  });

  it('histéresis: no oscila en el borde del umbral de alto', () => {
    // Viniendo de "corto", hace falta pasar de 600 para dejar de serlo.
    expect(resolveLayout(390, 580, true).isShort).toBe(true);
    expect(resolveLayout(390, 580, false).isShort).toBe(false);
    expect(resolveLayout(390, 620, true).isShort).toBe(false);
  });

  it('isTablet separa tablet de escritorio sin cambiar la estructura', () => {
    expect(resolveLayout(1024, 1366).isTablet).toBe(true);
    expect(resolveLayout(1440, 900).isTablet).toBe(false);
    // En compacto no hay capa de tablet.
    expect(resolveLayout(390, 844).isTablet).toBe(false);
  });

  it('isLandscape refleja la orientación real', () => {
    expect(resolveLayout(844, 390).isLandscape).toBe(true);
    expect(resolveLayout(390, 844).isLandscape).toBe(false);
  });
});
