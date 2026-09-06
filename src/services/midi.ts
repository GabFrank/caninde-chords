// Disparo por MIDI: pedal, pad físico o controlador.
//
// La Web MIDI API pide permiso y no existe en todos los navegadores (Safari no
// la implementa), así que el acceso NO se solicita al montar el tablero: hace
// falta que el usuario lo encienda. Si no está disponible, el resto del Soundpad
// funciona igual y sólo se oculta la sección.

/** Un mensaje de MIDI ya interpretado. */
export interface MidiNote {
  /** Sólo nos interesan las notas: `noteon` con velocidad > 0 dispara. */
  kind: 'noteon' | 'noteoff' | 'other';
  note: number;
  velocity: number;
  channel: number;
}

/**
 * Interpreta un mensaje MIDI crudo.
 *
 * Un `noteon` con velocidad 0 es un `noteoff`: así lo mandan muchos
 * controladores, y tomarlo por un disparo haría sonar el pad al SOLTAR el pedal
 * además de al pisarlo.
 */
export function parseMidiMessage(data: Uint8Array | number[]): MidiNote {
  const [status = 0, note = 0, velocity = 0] = Array.from(data);
  const kind = status & 0xf0;
  const channel = status & 0x0f;
  if (kind === 0x90) {
    return { kind: velocity > 0 ? 'noteon' : 'noteoff', note, velocity, channel };
  }
  if (kind === 0x80) return { kind: 'noteoff', note, velocity, channel };
  return { kind: 'other', note, velocity, channel };
}

/** Nombre legible de una nota MIDI, para mostrar qué tecla quedó asignada. */
export function midiNoteName(note: number): string {
  const nombres = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${nombres[note % 12]}${Math.floor(note / 12) - 1} (${note})`;
}

export function isMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

type NoteListener = (note: MidiNote) => void;
type DevicesListener = (names: string[]) => void;

class MidiService {
  private access: MIDIAccess | null = null;
  private listeners = new Set<NoteListener>();
  private deviceListeners = new Set<DevicesListener>();
  private enabling: Promise<boolean> | null = null;

  /** Pide el permiso y engancha las entradas. Idempotente. */
  enable(): Promise<boolean> {
    if (this.access) return Promise.resolve(true);
    if (this.enabling) return this.enabling;
    if (!isMidiSupported()) return Promise.resolve(false);

    this.enabling = navigator.requestMIDIAccess({ sysex: false })
      .then(access => {
        this.access = access;
        this.attachAll();
        // Enchufar el controlador con la app abierta tiene que funcionar.
        access.onstatechange = () => { this.attachAll(); this.notifyDevices(); };
        this.notifyDevices();
        return true;
      })
      .catch(e => {
        console.warn('No se pudo acceder a MIDI', e);
        return false;
      })
      .finally(() => { this.enabling = null; });

    return this.enabling;
  }

  private attachAll() {
    if (!this.access) return;
    this.access.inputs.forEach(input => {
      // Reasignar el manejador es idempotente: no acumula suscripciones si la
      // entrada ya estaba enganchada.
      input.onmidimessage = (event) => {
        const parsed = parseMidiMessage(event.data ?? []);
        if (parsed.kind !== 'noteon') return;
        this.listeners.forEach(l => {
          try { l(parsed); } catch (e) { console.error('Listener MIDI falló', e); }
        });
      };
    });
  }

  get enabled(): boolean {
    return this.access !== null;
  }

  /** Nombres de los controladores conectados. */
  deviceNames(): string[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map(i => i.name || 'MIDI');
  }

  private notifyDevices() {
    const nombres = this.deviceNames();
    this.deviceListeners.forEach(l => {
      try { l(nombres); } catch (e) { console.error('Listener de dispositivos MIDI falló', e); }
    });
  }

  /**
   * Escucha los cambios en los controladores conectados, y recibe la lista
   * ACTUAL al suscribirse.
   *
   * Sin la entrega inicial, volver de otra pestaña dejaba la interfaz diciendo
   * "no se detectó ningún controlador" con el pedal enchufado y funcionando.
   */
  subscribeDevices(listener: DevicesListener): () => void {
    this.deviceListeners.add(listener);
    try { listener(this.deviceNames()); } catch (e) { console.error('Listener de dispositivos MIDI falló', e); }
    return () => { this.deviceListeners.delete(listener); };
  }

  /** Escucha las notas. Devuelve la función para dejar de escuchar. */
  subscribe(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

export const midiService = new MidiService();
