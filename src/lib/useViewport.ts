import { useEffect, useState } from 'react';

export type LayoutMode = 'compact' | 'regular';

export interface Viewport {
  width: number;
  height: number;
  /** 'compact' = un solo panel con barra inferior; 'regular' = lista y contenido a la vez. */
  mode: LayoutMode;
  isLandscape: boolean;
  /** Alto insuficiente para apilar cabecera, contenido y barra inferior. */
  isShort: boolean;
  /** Capa intermedia: sirve para densidad y tipografía, no cambia la estructura. */
  isTablet: boolean;
}

/** Debajo de esto el alto no alcanza para el layout de dos paneles. */
const SHORT_ENTER = 560;
/** Histéresis: se sale de "corto" más arriba de lo que se entra, para no oscilar. */
const SHORT_EXIT = 600;
/** Debajo de esto nunca hay dos paneles, por más alto que haya. */
const NARROW = 700;
/**
 * Por encima de esto el alto ya no puede degradar a un panel: una ventana de
 * escritorio baja (1600x520, o con las herramientas de desarrollo abajo) sigue
 * siendo escritorio.
 */
const WIDE_ENOUGH_TO_IGNORE_HEIGHT = 1100;
/** Separa tablet de escritorio. No cambia la estructura. */
const DESKTOP = 1180;

/**
 * Decide el layout a partir de las dimensiones. Es una función pura para poder
 * probarla: los umbrales salen del código y de dimensiones de referencia, no de
 * dispositivos físicos, así que tienen que poder ajustarse sin romper nada.
 *
 * @param wasShort estado anterior de `isShort`, para aplicar histéresis.
 */
export function resolveLayout(width: number, height: number, wasShort = false): Viewport {
  const isShort = wasShort ? height < SHORT_EXIT : height < SHORT_ENTER;
  const mode: LayoutMode =
    width < NARROW || (isShort && width < WIDE_ENOUGH_TO_IGNORE_HEIGHT) ? 'compact' : 'regular';

  return {
    width,
    height,
    mode,
    isLandscape: width > height,
    isShort,
    isTablet: mode === 'regular' && width < DESKTOP,
  };
}

/** ¿Hay un campo de texto enfocado? El teclado virtual encoge la ventana. */
function isTyping() {
  const el = document.activeElement;
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  );
}

/**
 * El teclado en pantalla dispara `resize` reduciendo `innerHeight`. Sin esto, un
 * iPad apaisado editando una canción cruzaría el umbral de alto y cambiaría el
 * layout mientras el músico escribe.
 */
function keyboardIsOpen() {
  const vv = window.visualViewport;
  return vv ? window.innerHeight - vv.height > 150 : false;
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() =>
    resolveLayout(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      // Mientras se escribe, el alto que informa el navegador es el del teclado,
      // no el del dispositivo: no se recalcula nada.
      if (isTyping() || keyboardIsOpen()) return;
      setViewport((prev) => {
        const next = resolveLayout(window.innerWidth, window.innerHeight, prev.isShort);
        if (
          next.width === prev.width &&
          next.height === prev.height &&
          next.mode === prev.mode
        ) {
          return prev;
        }
        return next;
      });
    };

    // rAF colapsa a un frame, pero durante un arrastre eso son 60 recálculos por
    // segundo y cada cambio de modo reflowea la app entera: hace falta debounce.
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        frame = requestAnimationFrame(measure);
      }, 150);
    };

    window.addEventListener('resize', schedule);
    // En iOS `orientationchange` llega antes de que innerWidth/Height se
    // actualicen; el `resize` posterior es el que trae los valores buenos.
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, []);

  return viewport;
}
