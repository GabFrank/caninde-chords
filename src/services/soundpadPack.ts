// Pack de sonidos: exportar e importar la biblioteca como un único .zip.
//
// Existe porque los audios viven en el dispositivo. La ficha de cada pad se
// sincroniza por Firestore, pero el MP3 no viaja solo: sin esto, montar el
// tablero en la tablet de la ceremonia significaría volver a cargar archivo por
// archivo. Con el pack, se exporta desde donde se armó y se importa allá.
//
// Formato: un .zip con `soundpad.json` (el catálogo) y `audio/<fileKey>` (los
// archivos). Las claves se conservan, así que un pack importado encaja con las
// fichas que ya llegaron por Firestore desde el otro dispositivo — el pad deja
// de estar "sin audio" en vez de duplicarse.

import JSZip from 'jszip';
import { SoundCategory, SoundPad } from '../types';
import { getSound, putSound } from './soundLibrary';
import { MAX_FADE_MS } from './soundpadEngine';

const MANIFEST = 'soundpad.json';
const AUDIO_DIR = 'audio/';
const FORMAT = 1;

interface PackPad {
  name: string;
  categoryId: string;
  color?: string;
  icon?: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  durationMs?: number;
  volume: number;
  repeat: number;
  overlay: boolean;
  fadeOutMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  midiNote?: number;
  favorite: boolean;
  order: number;
}

interface PackManifest {
  format: number;
  app: 'caninde-chords-soundpad';
  exportedAt: string;
  categories: { id: string; name: string; color: string; order: number }[];
  pads: PackPad[];
}

export interface ImportResult {
  /** Audios que se escribieron en este dispositivo. */
  audios: number;
  /** Fichas del pack que no existían acá y hay que crear en Firestore. */
  newPads: PackPad[];
  newCategories: { id: string; name: string; color: string; order: number }[];
  /** Claves escritas en este dispositivo, para invalidar buffers y protegerlas. */
  importedKeys: string[];
}

/**
 * JSZip lee los Blob con FileReader, que no existe en Node. En el navegador se
 * le pasa el Blob para que lo lea cuando arma el zip; en las pruebas, el
 * ArrayBuffer. La diferencia importa: con el ArrayBuffer, exportar una
 * biblioteca grande obliga a tener todos los audios descomprimidos en memoria a
 * la vez, y una tablet se queda sin.
 */
async function zipPayload(blob: Blob): Promise<Blob | ArrayBuffer> {
  return typeof FileReader === 'undefined' ? blob.arrayBuffer() : blob;
}

/**
 * Arma el .zip con todo lo que hay. Los pads cuyo audio no esté en este
 * dispositivo se omiten: exportar una ficha sin su archivo sólo trasladaría el
 * problema.
 */
export async function exportPack(pads: SoundPad[], categories: SoundCategory[]): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder('audio')!;
  const included: PackPad[] = [];

  for (const pad of pads) {
    const blob = await getSound(pad.fileKey);
    if (!blob) continue;
    folder.file(pad.fileKey, await zipPayload(blob));
    // Se saneja al exportar con la misma función que al importar: así el
    // manifiesto nunca lleva claves con valor `undefined` ni valores fuera de
    // rango, y lo que se escribe es exactamente lo que se sabe leer.
    const limpio = sanitizePackPad({ ...pad, order: pad.order ?? 0 });
    if (limpio) included.push(limpio);
  }

  const manifest: PackManifest = {
    format: FORMAT,
    app: 'caninde-chords-soundpad',
    exportedAt: new Date().toISOString(),
    categories: categories.map(c => ({ id: c.id, name: c.name, color: c.color, order: c.order ?? 0 })),
    pads: included,
  };
  zip.file(MANIFEST, JSON.stringify(manifest, null, 2));

  // DEFLATE nivel bajo: los MP3 ya vienen comprimidos, apretar más sólo gasta
  // tiempo y batería en el móvil sin ganar tamaño.
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

/** Un id de documento de Firestore válido y sin sorpresas de ruta. */
function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length < 128
    && !id.includes('/') && id !== '.' && id !== '..';
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  (typeof v === 'number' && Number.isFinite(v)) ? Math.max(min, Math.min(max, v)) : fallback;

/** Como `num`, pero un campo ausente sigue ausente en vez de inventarse. */
const optNum = (v: unknown, min: number, max: number) =>
  (typeof v === 'number' && Number.isFinite(v)) ? Math.max(min, Math.min(max, v)) : undefined;

/**
 * Normaliza una ficha del manifiesto. El .zip lo trae el usuario, así que sus
 * campos son entrada no confiable: escribirlos tal cual en Firestore hace que
 * las reglas rechacen la creación entera por un `volume` que venía como texto, y
 * el usuario sólo vería un "importado" que no importó nada.
 *
 * Devuelve `null` si la ficha no es recuperable.
 */
function sanitizePackPad(raw: unknown): PackPad | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.fileKey !== 'string' || !p.fileKey) return null;
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 59) : 'Sin nombre';

  // Los campos opcionales se OMITEN cuando no vienen, en vez de quedar con
  // valor `undefined`. Firestore rechaza los `undefined` lanzando de forma
  // síncrona, así que una sola clave así cortaba la importación entera.
  const opcionales: Partial<PackPad> = {};
  const poner = <K extends keyof PackPad>(k: K, v: PackPad[K] | undefined) => {
    if (v !== undefined) opcionales[k] = v;
  };
  poner('color', typeof p.color === 'string' ? p.color.slice(0, 23) : undefined);
  poner('icon', typeof p.icon === 'string' ? p.icon.slice(0, 23) : undefined);
  poner('durationMs', optNum(p.durationMs, 0, Number.MAX_SAFE_INTEGER));
  poner('trimStartMs', optNum(p.trimStartMs, 0, 24 * 3600_000));
  poner('trimEndMs', optNum(p.trimEndMs, 0, 24 * 3600_000));
  poner('midiNote', optNum(p.midiNote, 0, 127));

  return {
    name,
    categoryId: isSafeId(p.categoryId) ? p.categoryId : 'uncategorized',
    fileKey: p.fileKey.slice(0, 199),
    fileName: typeof p.fileName === 'string' ? p.fileName.slice(0, 199) : name,
    fileSize: num(p.fileSize, 0, 0, Number.MAX_SAFE_INTEGER),
    volume: num(p.volume, 0.85, 0, 1),
    // Entero: `repeat: 0.5` daría un `stop()` en el mismo instante del `start()`
    // y el pad no sonaría nunca.
    repeat: Math.round(num(p.repeat, 1, 0, 50)),
    overlay: typeof p.overlay === 'boolean' ? p.overlay : true,
    fadeOutMs: num(p.fadeOutMs, 120, 0, MAX_FADE_MS),
    favorite: p.favorite === true,
    order: num(p.order, 0, 0, Number.MAX_SAFE_INTEGER),
    ...opcionales,
  };
}

/**
 * Lee un pack: escribe los audios en este dispositivo y devuelve qué fichas
 * faltan crear. No toca Firestore — de eso se ocupa quien llama, que es el que
 * conoce al usuario y ya sabe qué pads existen.
 */
export async function importPack(file: File | Blob, existing: { fileKeys: Set<string>; categoryIds: Set<string> }): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(await zipPayload(file));
  const manifestFile = zip.file(MANIFEST);
  if (!manifestFile) throw new Error('pack-invalido');

  let manifest: PackManifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error('pack-invalido');
  }
  if (manifest.app !== 'caninde-chords-soundpad' || !Array.isArray(manifest.pads)) {
    throw new Error('pack-invalido');
  }

  let audios = 0;
  const newPads: PackPad[] = [];
  const importedKeys: string[] = [];

  for (const raw of manifest.pads) {
    const pad = sanitizePackPad(raw);
    if (!pad) continue;
    const entry = zip.file(AUDIO_DIR + pad.fileKey);
    if (!entry) continue;
    // Se reescribe siempre: si la ficha ya llegó por Firestore pero sin audio,
    // esto es exactamente lo que la desbloquea.
    await putSound(pad.fileKey, new Blob([await entry.async('arraybuffer')]));
    audios++;
    importedKeys.push(pad.fileKey);
    if (!existing.fileKeys.has(pad.fileKey)) newPads.push(pad);
  }

  const newCategories = (manifest.categories ?? [])
    .filter(c => c && isSafeId(c.id) && typeof c.name === 'string' && c.name.trim())
    .filter(c => !existing.categoryIds.has(c.id))
    .map(c => ({
      id: c.id,
      name: c.name.trim().slice(0, 39),
      color: typeof c.color === 'string' ? c.color.slice(0, 23) : 'slate',
      order: num(c.order, 0, 0, Number.MAX_SAFE_INTEGER),
    }));

  return { audios, newPads, newCategories, importedKeys };
}

/** Nombre sugerido para el archivo exportado. */
export function packFileName(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `soundpad-caninde-${stamp}.zip`;
}
