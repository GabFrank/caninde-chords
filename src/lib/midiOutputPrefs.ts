// Preferencias de la salida MIDI, guardadas en ESTE equipo.
//
// No van a Firestore a propósito. El id de una salida MIDI se lo inventa el
// navegador y vale sólo en esta máquina y este navegador: sincronizarlo haría
// que el teléfono intentara mandarle a una interfaz que está enchufada a la
// notebook. El preset de cada canción sí se sincroniza —ese es del usuario, no
// del equipo— y vive en `UserSongSettings`.
//
// El canal también queda acá: es del aparato que está del otro lado del cable,
// no de la biblioteca de canciones.

import { DEFAULT_CHANNEL, isValidChannel } from './midiProgram';

const CLAVE = 'caninde-midi-out';

export interface MidiOutputPrefs {
  /** `null` = el usuario todavía no eligió salida. */
  outputId: string | null;
  /** 1..16, como lo ve el músico. */
  channel: number;
  /** Mandar o no al cambiar de canción. Apagado hasta que se elija salida. */
  autoSend: boolean;
}

export const DEFAULT_PREFS: MidiOutputPrefs = {
  outputId: null,
  channel: DEFAULT_CHANNEL,
  autoSend: false,
};

/**
 * Normaliza lo que haya guardado.
 *
 * Es una función pura y aparte porque lo que sale de `localStorage` es entrada
 * no confiable: lo pudo escribir una versión anterior de la app, o quedar a
 * medias. Un canal 0 o 17 guardado haría fallar cada envío sin que nada en la
 * pantalla explique por qué.
 */
export function sanitizePrefs(raw: unknown): MidiOutputPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;
  const outputId = typeof o.outputId === 'string' && o.outputId !== '' ? o.outputId : null;
  return {
    outputId,
    channel: isValidChannel(o.channel) ? o.channel : DEFAULT_CHANNEL,
    // Sin salida elegida no hay nada a donde mandar: dejarlo encendido sólo
    // produciría un error en cada cambio de canción.
    autoSend: o.autoSend === true && outputId !== null,
  };
}

export function readPrefs(): MidiOutputPrefs {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return sanitizePrefs(crudo ? JSON.parse(crudo) : null);
  } catch {
    // Ventana privada, almacenamiento bloqueado, JSON roto: valores por defecto.
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(prefs: MidiOutputPrefs): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(sanitizePrefs(prefs)));
  } catch {
    // Que no se pueda guardar la preferencia no puede romper la función.
  }
}
