import { describe, it, expect } from 'vitest';
import { sanitizePrefs, DEFAULT_PREFS } from './midiOutputPrefs';
import { DEFAULT_CHANNEL } from './midiProgram';

describe('sanitizePrefs', () => {
  it('acepta lo que está bien', () => {
    expect(sanitizePrefs({ outputId: 'out-1', channel: 5, autoSend: true }))
      .toEqual({ outputId: 'out-1', channel: 5, autoSend: true });
  });

  it('cae en los valores por defecto ante basura', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('{}')).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs(42)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs([])).toEqual(DEFAULT_PREFS);
  });

  it('arregla un canal guardado fuera de rango en vez de arrastrarlo', () => {
    // Un canal 0 o 17 haría fallar CADA envío sin que nada lo explique.
    expect(sanitizePrefs({ outputId: 'o', channel: 0, autoSend: false }).channel).toBe(DEFAULT_CHANNEL);
    expect(sanitizePrefs({ outputId: 'o', channel: 17, autoSend: false }).channel).toBe(DEFAULT_CHANNEL);
    expect(sanitizePrefs({ outputId: 'o', channel: 1.5, autoSend: false }).channel).toBe(DEFAULT_CHANNEL);
    expect(sanitizePrefs({ outputId: 'o', channel: '3', autoSend: false }).channel).toBe(DEFAULT_CHANNEL);
  });

  it('no deja el envío automático encendido sin salida elegida', () => {
    expect(sanitizePrefs({ outputId: null, channel: 1, autoSend: true }).autoSend).toBe(false);
    expect(sanitizePrefs({ outputId: '', channel: 1, autoSend: true }).autoSend).toBe(false);
  });

  it('trata la cadena vacía como "sin salida"', () => {
    expect(sanitizePrefs({ outputId: '', channel: 1, autoSend: false }).outputId).toBeNull();
  });

  it('sólo acepta true para el envío automático, no cualquier valor verdadero', () => {
    expect(sanitizePrefs({ outputId: 'o', channel: 1, autoSend: 'si' }).autoSend).toBe(false);
    expect(sanitizePrefs({ outputId: 'o', channel: 1, autoSend: 1 }).autoSend).toBe(false);
  });
});
