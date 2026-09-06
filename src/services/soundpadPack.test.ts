import { describe, it, expect, beforeEach, vi } from 'vitest';

// IndexedDB no existe en Node: la biblioteca de audio se reemplaza por un mapa.
const store = new Map<string, Blob>();
vi.mock('./soundLibrary', () => ({
  getSound: vi.fn(async (key: string) => store.get(key)),
  putSound: vi.fn(async (key: string, blob: Blob) => { store.set(key, blob); }),
}));

import { exportPack, importPack, packFileName } from './soundpadPack';
import { SoundCategory, SoundPad } from '../types';

function pad(over: Partial<SoundPad> = {}): SoundPad {
  return {
    id: 'p1', ownerId: 'u1', name: 'Trueno', categoryId: 'cat-naturaleza',
    fileKey: 'k1', fileName: 'trueno.mp3', fileSize: 3,
    volume: 0.7, repeat: 2, overlay: false, fadeOutMs: 200, favorite: true, order: 1,
    createdAt: null, updatedAt: null, ...over,
  };
}

const categoria: SoundCategory = {
  id: 'cat-naturaleza', ownerId: 'u1', name: 'Naturaleza', color: 'green', order: 1, createdAt: null,
};

const vacio = { fileKeys: new Set<string>(), categoryIds: new Set<string>() };

beforeEach(() => {
  store.clear();
  store.set('k1', new Blob([new Uint8Array([1, 2, 3])]));
});

describe('pack de sonidos', () => {
  it('lleva los ajustes de cada pad de ida y vuelta', async () => {
    const original = pad();
    const zip = await exportPack([original], [categoria]);
    store.clear();

    const { audios, newPads, newCategories } = await importPack(zip, vacio);

    expect(audios).toBe(1);
    expect(store.has('k1')).toBe(true);
    expect(newCategories).toEqual([{ id: 'cat-naturaleza', name: 'Naturaleza', color: 'green', order: 1 }]);
    expect(newPads[0]).toMatchObject({
      name: 'Trueno', categoryId: 'cat-naturaleza', fileKey: 'k1',
      volume: 0.7, repeat: 2, overlay: false, fadeOutMs: 200, favorite: true,
    });
  });

  it('no exporta un pad cuyo audio no está en este dispositivo', async () => {
    // Exportar la ficha sin su archivo sólo trasladaría el problema.
    const zip = await exportPack([pad(), pad({ id: 'p2', fileKey: 'ausente' })], []);
    const { newPads } = await importPack(zip, vacio);
    expect(newPads.map(p => p.fileKey)).toEqual(['k1']);
  });

  it('un pad que ya existe recupera su audio sin duplicar la ficha', async () => {
    // El caso real: la ficha llegó por Firestore desde la otra tablet, pero el
    // audio no. Importar el pack tiene que desbloquearla, no crear un pad más.
    const zip = await exportPack([pad()], [categoria]);
    store.clear();

    const { audios, newPads, newCategories } = await importPack(zip, {
      fileKeys: new Set(['k1']),
      categoryIds: new Set(['cat-naturaleza']),
    });

    expect(audios).toBe(1);
    expect(store.has('k1')).toBe(true);
    expect(newPads).toEqual([]);
    expect(newCategories).toEqual([]);
  });

  it('las fichas del pack no llevan ninguna clave con valor undefined', async () => {
    // Firestore rechaza los `undefined` LANZANDO de forma síncrona, así que un
    // solo campo opcional ausente cortaba la importación entera: cero fichas
    // creadas, y al recargar `pruneOrphans` borraba los audios recién escritos.
    // Un pad sin recorte y sin nota MIDI —o sea, casi cualquiera— los traía.
    const zip = await exportPack([pad({ durationMs: undefined })], []);
    const { newPads } = await importPack(zip, vacio);

    const conUndefined = Object.entries(newPads[0])
      .filter(([, v]) => v === undefined)
      .map(([k]) => k);
    expect(conUndefined).toEqual([]);
  });

  it('el recorte y la nota MIDI viajan en el pack', async () => {
    const zip = await exportPack([pad({ trimStartMs: 250, trimEndMs: 900, midiNote: 36 })], []);
    const { newPads } = await importPack(zip, vacio);
    expect(newPads[0]).toMatchObject({ trimStartMs: 250, trimEndMs: 900, midiNote: 36 });
  });

  it('acota el fundido al techo que aceptan las reglas', async () => {
    // Un pack con un fundido disparatado daba permission-denied en producción.
    const zip = await exportPack([pad({ fadeOutMs: 999999 })], []);
    const { newPads } = await importPack(zip, vacio);
    expect(newPads[0].fadeOutMs).toBe(15000);
  });

  it('rechaza un zip que no sea un pack', async () => {
    const { default: JSZip } = await import('jszip');
    const otro = new JSZip();
    otro.file('README.txt', 'nada que ver');
    const blob = await otro.generateAsync({ type: 'blob' });

    await expect(importPack(blob, vacio)).rejects.toThrow('pack-invalido');
  });

  it('el nombre del archivo lleva la fecha', () => {
    expect(packFileName()).toMatch(/^soundpad-caninde-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});
