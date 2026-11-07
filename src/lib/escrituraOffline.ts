// Guardar sin depender del servidor.
//
// El problema, verificado: con la red caída, `addDoc` y `updateDoc` **no
// resuelven nunca**. Su promesa espera el acuse del servidor, no la escritura.
// Como el código esperaba esa promesa para cerrar el editor y apagar el velo de
// "SAVING…", la app quedaba trabada a pantalla completa para siempre, y la
// única salida era recargar. A los 30 segundos seguía igual.
//
// Lo irónico es que el guardado **había funcionado**: con persistencia offline,
// Firestore aplica la escritura en la caché local al instante, la muestra en la
// lista y la sincroniza sola cuando vuelve la conexión. Lo único roto era la
// espera.
//
// Esto importa especialmente acá: el lugar de la ceremonia no suele tener red,
// y es justo donde alguien necesita corregir la letra de un tema.
//
// Es el mismo razonamiento que ya usa el Soundpad (gotcha 7 de
// docs/SOUNDPAD.md), con una diferencia: allá las escrituras directamente no se
// esperaban. Acá sí se espera, pero con un plazo, para poder decir "guardado y
// confirmado" cuando hay red y "guardado, se sincroniza después" cuando no.

export type EstadoEscritura =
  /** El servidor la acusó dentro del plazo. */
  | 'confirmado'
  /** Aplicada localmente; el servidor todavía no la acusó. */
  | 'pendiente'
  /** La rechazó (reglas, validación): NO se guardó. */
  | 'fallo';

/** Cuánto esperar el acuse antes de seguir. Suficiente para una red lenta. */
export const PLAZO_ESCRITURA_MS = 1500;

/**
 * Espera una escritura de Firestore sin colgarse cuando no hay red.
 *
 * @param promesa La que devuelve `addDoc`, `updateDoc` o `setDoc`.
 * @param alFallar Qué hacer si la escritura es rechazada. Se llama SIEMPRE que
 *   falle, también después de vencido el plazo: sin esto, una escritura
 *   rechazada por las reglas media hora más tarde sería un `unhandledrejection`
 *   mudo y el usuario nunca sabría que su cambio no está.
 * @param plazoMs Para las pruebas.
 */
export function esperarEscritura(
  promesa: Promise<unknown>,
  alFallar: (e: unknown) => void,
  plazoMs: number = PLAZO_ESCRITURA_MS,
): Promise<EstadoEscritura> {
  const manejada: Promise<EstadoEscritura> = promesa.then(
    () => 'confirmado',
    (e) => {
      // `alFallar` puede lanzar —`handleFirestoreError` lo hace a propósito—,
      // y eso no puede convertirse en un rechazo que nadie atrapa.
      try { alFallar(e); } catch { /* ya quedó registrado */ }
      return 'fallo';
    },
  );

  const plazo = new Promise<EstadoEscritura>(resolver => {
    setTimeout(() => resolver('pendiente'), plazoMs);
  });

  return Promise.race([manejada, plazo]);
}
