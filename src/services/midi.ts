// MIDI: entrada y salida.
//
// **Entrada** (`inputs`): un pedal o controlador dispara pads del Soundpad.
// **Salida** (`outputs`): la app le manda Program Change a un pedal de efectos
// para que cada canción cargue su preset. El caso que lo motivó es un Hologram
// Microcosm por MIDI DIN de 5 pines, con una interfaz USB-MIDI en el medio: el
// pedal no es un dispositivo USB MIDI, su USB es sólo para firmware.
//
// La Web MIDI API pide permiso y no existe en todos los navegadores. En
// particular NO existe en iPhone ni iPad: todos los navegadores de iOS están
// obligados a usar WebKit, que no la implementa, así que instalar otro navegador
// ahí no cambia nada. Por eso el acceso no se pide al montar nada: hace falta
// que el usuario lo encienda, y si no está disponible el resto funciona igual y
// sólo se ocultan las secciones de MIDI.

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

import { programChangeBytes } from '../lib/midiProgram';

export function isMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

type NoteListener = (note: MidiNote) => void;
type DevicesListener = (names: string[]) => void;
type OutputsListener = (outputs: MidiOutputInfo[]) => void;

/** Una salida MIDI, para elegirla en la interfaz. */
export interface MidiOutputInfo {
  id: string;
  name: string;
}

/**
 * Por qué falló un envío. Se distingue para poder decirle al usuario qué
 * arreglar, en vez de un "no se pudo" que no lleva a ningún lado.
 */
export type SendFailure = 'sin-permiso' | 'sin-dispositivo' | 'rango' | 'error';
export type SendResult = { ok: true } | { ok: false; reason: SendFailure; detail?: string };

class MidiService {
  private access: MIDIAccess | null = null;
  private listeners = new Set<NoteListener>();
  private deviceListeners = new Set<DevicesListener>();
  private outputListeners = new Set<OutputsListener>();
  private enabling: Promise<boolean> | null = null;
  /** La salida elegida. El id lo asigna el navegador y es de ESTE equipo. */
  private outputId: string | null = null;

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
        access.onstatechange = () => { this.attachAll(); this.notifyDevices(); this.notifyOutputs(); };
        this.notifyDevices();
        this.notifyOutputs();
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

  // ── Salida ────────────────────────────────────────────────────────────────

  /** Las salidas disponibles. Vacío sin permiso o sin nada enchufado. */
  outputs(): MidiOutputInfo[] {
    // `access.outputs` siempre existe en un navegador de verdad, pero si
    // faltara —una implementación parcial, un polyfill— el `.values()` tiraba
    // dentro de `enable()` y se lo tragaba su `catch`: el permiso quedaba sin
    // conceder y moría también la ENTRADA, que no tiene nada que ver con esto.
    if (!this.access?.outputs) return [];
    return [...this.access.outputs.values()]
      .map(o => ({ id: o.id, name: o.name || 'MIDI' }));
  }

  /** Como `subscribeDevices`, entrega la lista actual al suscribirse. */
  subscribeOutputs(listener: OutputsListener): () => void {
    this.outputListeners.add(listener);
    try { listener(this.outputs()); } catch (e) { console.error('Listener de salidas MIDI falló', e); }
    return () => { this.outputListeners.delete(listener); };
  }

  private notifyOutputs() {
    const salidas = this.outputs();
    this.outputListeners.forEach(l => {
      try { l(salidas); } catch (e) { console.error('Listener de salidas MIDI falló', e); }
    });
  }

  /** Elige a qué salida se le manda. `null` deja de mandar. */
  selectOutput(id: string | null) { this.outputId = id; }
  get selectedOutputId(): string | null { return this.outputId; }

  /**
   * La salida elegida, resuelta contra lo que hay enchufado AHORA.
   *
   * Se resuelve en cada envío y no se guarda la referencia: desenchufar y
   * volver a enchufar la interfaz crea un objeto nuevo, y una referencia vieja
   * se queda muda sin avisar —que en el escenario se ve como "la app dejó de
   * cambiar los presets" sin ningún mensaje de error.
   */
  private resolveOutput(): MIDIOutput | null {
    if (!this.access || !this.outputId) return null;
    return this.access.outputs.get(this.outputId) ?? null;
  }

  /**
   * Manda un Program Change. No lanza: devuelve por qué falló, para que la
   * interfaz pueda decir qué arreglar.
   */
  sendProgramChange(program: number, channel: number): SendResult {
    if (!this.access) return { ok: false, reason: 'sin-permiso' };
    const salida = this.resolveOutput();
    if (!salida) return { ok: false, reason: 'sin-dispositivo' };
    let bytes: Uint8Array;
    try {
      bytes = programChangeBytes(program, channel);
    } catch (e) {
      return { ok: false, reason: 'rango', detail: e instanceof Error ? e.message : String(e) };
    }
    try {
      salida.send(bytes);
      return { ok: true };
    } catch (e) {
      // `send` tira si el dispositivo se desconectó entre la resolución y el
      // envío, y también si el navegador niega los mensajes.
      return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

export const midiService = new MidiService();
