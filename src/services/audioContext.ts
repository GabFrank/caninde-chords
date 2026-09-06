// Un único AudioContext para toda la aplicación.
//
// El Afinador y el Soundpad son dos motores independientes con cadenas de nodos
// distintas (el afinador colorea para sonar a guitarra, el soundpad reproduce
// fiel), pero comparten el contexto: los navegadores limitan cuántos se pueden
// abrir, y en iOS cada contexto nuevo exige su propio gesto del usuario para
// desbloquearse. Con uno solo, el primer toque en cualquier herramienta habilita
// el audio de las dos.

let ctx: AudioContext | null = null;

/**
 * Devuelve el AudioContext compartido, creándolo la primera vez. Devuelve `null`
 * si el navegador no soporta la Web Audio API o si estamos fuera del navegador
 * (por ejemplo dentro de vitest, que corre en Node).
 */
export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    console.warn('Este navegador no soporta la Web Audio API.');
    return null;
  }
  try {
    ctx = new AudioCtx();
  } catch (e) {
    console.error('No se pudo crear el AudioContext', e);
    return null;
  }
  return ctx;
}

/**
 * Reanuda el contexto si el navegador lo dejó suspendido. Hay que llamarlo desde
 * un gesto del usuario (toque o clic): iOS y Android arrancan el contexto
 * suspendido y sólo lo liberan dentro del manejador del gesto. En iOS además el
 * contexto se vuelve a suspender cuando se bloquea la pantalla o la app pasa a
 * segundo plano, así que también conviene llamarlo al volver al frente.
 */
export function resumeAudioContext(): void {
  const c = getAudioContext();
  if (c && c.state === 'suspended') {
    c.resume().catch((e) => console.warn('No se pudo reanudar el AudioContext', e));
  }
}
