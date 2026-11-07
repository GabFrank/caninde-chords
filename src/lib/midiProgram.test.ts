import { describe, it, expect } from 'vitest';
import {
  programChangeBytes, isValidProgram, isValidChannel, parseProgramInput,
  shouldSendProgram, MIN_PROGRAM, MAX_PROGRAM, MIN_CHANNEL, MAX_CHANNEL, DEFAULT_CHANNEL,
} from './midiProgram';

describe('programChangeBytes', () => {
  it('pone el canal 1 en el byte como 0, que es el error clásico', () => {
    expect([...programChangeBytes(0, 1)]).toEqual([0xC0, 0]);
  });

  it('cubre los dieciséis canales sin desbordar al byte siguiente', () => {
    for (let canal = MIN_CHANNEL; canal <= MAX_CHANNEL; canal++) {
      const [estado] = programChangeBytes(7, canal);
      expect(estado).toBe(0xC0 + (canal - 1));
      // El nibble alto tiene que seguir siendo 0xC: si el canal se filtrara
      // ahí, el mensaje dejaría de ser un Program Change.
      expect(estado & 0xF0).toBe(0xC0);
    }
  });

  it('manda el programa tal cual, sin corregir la numeración del fabricante', () => {
    // El manual del Microcosm llama "23" a lo que hay que pedir como 22. La app
    // no adivina: guarda y manda lo que el usuario verificó contra su pedal.
    expect([...programChangeBytes(22, 1)]).toEqual([0xC0, 22]);
  });

  it('acepta los extremos del rango', () => {
    expect([...programChangeBytes(MIN_PROGRAM, MIN_CHANNEL)]).toEqual([0xC0, 0]);
    expect([...programChangeBytes(MAX_PROGRAM, MAX_CHANNEL)]).toEqual([0xCF, 127]);
  });

  it('rechaza lo que está fuera de rango en vez de mandarlo truncado', () => {
    expect(() => programChangeBytes(128, 1)).toThrow(RangeError);
    expect(() => programChangeBytes(-1, 1)).toThrow(RangeError);
    expect(() => programChangeBytes(0, 0)).toThrow(RangeError);
    expect(() => programChangeBytes(0, 17)).toThrow(RangeError);
    expect(() => programChangeBytes(1.5, 1)).toThrow(RangeError);
  });
});

describe('isValidProgram / isValidChannel', () => {
  it('exige enteros', () => {
    expect(isValidProgram(3.5)).toBe(false);
    expect(isValidChannel(2.1)).toBe(false);
    expect(isValidProgram(NaN)).toBe(false);
  });
  it('rechaza lo que no es número', () => {
    expect(isValidProgram('7')).toBe(false);
    expect(isValidProgram(null)).toBe(false);
    expect(isValidProgram(undefined)).toBe(false);
    expect(isValidChannel('1')).toBe(false);
  });
  it('el canal por defecto es válido', () => {
    expect(isValidChannel(DEFAULT_CHANNEL)).toBe(true);
  });
});

describe('parseProgramInput', () => {
  it('el campo vacío significa "no tocar el pedal", no cero', () => {
    expect(parseProgramInput('')).toBeNull();
    expect(parseProgramInput('   ')).toBeNull();
    // Distinto de cero, que es un preset de verdad.
    expect(parseProgramInput('0')).toBe(0);
  });

  it('lee un número válido ignorando espacios', () => {
    expect(parseProgramInput(' 22 ')).toBe(22);
    expect(parseProgramInput('127')).toBe(127);
  });

  it('devuelve undefined para lo que no sirve, distinto de null', () => {
    expect(parseProgramInput('128')).toBeUndefined();
    expect(parseProgramInput('-1')).toBeUndefined();
    expect(parseProgramInput('7.5')).toBeUndefined();
    expect(parseProgramInput('mosaic')).toBeUndefined();
    expect(parseProgramInput('1e2')).toBeUndefined();
  });
});

describe('shouldSendProgram', () => {
  it('manda cuando el preset cambia', () => {
    expect(shouldSendProgram(3, 7)).toBe(true);
    expect(shouldSendProgram(null, 7)).toBe(true);
    expect(shouldSendProgram(undefined, 0)).toBe(true);
  });

  it('no repite el mismo preset: cambiarlo corta la cola del efecto', () => {
    expect(shouldSendProgram(7, 7)).toBe(false);
    expect(shouldSendProgram(0, 0)).toBe(false);
  });

  it('una canción sin preset deja el pedal como está', () => {
    expect(shouldSendProgram(7, null)).toBe(false);
    expect(shouldSendProgram(7, undefined)).toBe(false);
    expect(shouldSendProgram(null, null)).toBe(false);
  });

  it('no manda un preset inválido aunque haya cambiado', () => {
    expect(shouldSendProgram(1, 200)).toBe(false);
    expect(shouldSendProgram(1, 1.5)).toBe(false);
  });
});
