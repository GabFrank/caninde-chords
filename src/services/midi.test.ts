import { describe, it, expect } from 'vitest';
import { parseMidiMessage, midiNoteName, isMidiSupported } from './midi';

describe('parseMidiMessage', () => {
  it('reconoce un noteon', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({
      kind: 'noteon', note: 60, velocity: 100, channel: 0,
    });
  });

  it('un noteon con velocidad 0 es un noteoff', () => {
    // Así lo mandan muchos controladores y pedales. Tomarlo por un disparo haría
    // sonar el pad también al SOLTAR el pedal.
    expect(parseMidiMessage([0x90, 60, 0]).kind).toBe('noteoff');
  });

  it('reconoce un noteoff explícito', () => {
    expect(parseMidiMessage([0x80, 60, 64]).kind).toBe('noteoff');
  });

  it('lee el canal del byte de estado', () => {
    expect(parseMidiMessage([0x95, 60, 100]).channel).toBe(5);
  });

  it('lo que no es una nota se ignora', () => {
    expect(parseMidiMessage([0xb0, 7, 127]).kind).toBe('other');  // control change
    expect(parseMidiMessage([0xf8]).kind).toBe('other');          // reloj
  });

  it('tolera mensajes truncados', () => {
    expect(parseMidiMessage([]).kind).toBe('other');
    expect(parseMidiMessage([0x90]).kind).toBe('noteoff');
  });

  it('acepta el Uint8Array que entrega el navegador', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 36, 127])).note).toBe(36);
  });
});

describe('midiNoteName', () => {
  it('nombra las notas como las muestran los controladores', () => {
    expect(midiNoteName(60)).toBe('C4 (60)');
    expect(midiNoteName(36)).toBe('C2 (36)');
    expect(midiNoteName(61)).toBe('C#4 (61)');
  });
});

describe('isMidiSupported', () => {
  it('en Node no hay Web MIDI', () => {
    expect(isMidiSupported()).toBe(false);
  });
});
