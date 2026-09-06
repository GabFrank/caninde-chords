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
    // Se pasa el ArrayBuffer y no el Blob: JSZip lee los Blob con FileReader,
    // que no existe fuera del navegador, y eso dejaría este servicio sin poder
    // probarse. `arrayBuffer()` funciona en los dos lados.
    folder.file(pad.fileKey, await blob.arrayBuffer());
    included.push({
      name: pad.name,
      categoryId: pad.categoryId,
      color: pad.color,
      icon: pad.icon,
      fileKey: pad.fileKey,
      fileName: pad.fileName,
      fileSize: pad.fileSize,
      durationMs: pad.durationMs,
      volume: pad.volume,
      repeat: pad.repeat,
      overlay: pad.overlay,
      fadeOutMs: pad.fadeOutMs,
      favorite: pad.favorite,
      order: pad.order ?? 0,
    });
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

/**
 * Lee un pack: escribe los audios en este dispositivo y devuelve qué fichas
 * faltan crear. No toca Firestore — de eso se ocupa quien llama, que es el que
 * conoce al usuario y ya sabe qué pads existen.
 */
export async function importPack(file: File | Blob, existing: { fileKeys: Set<string>; categoryIds: Set<string> }): Promise<ImportResult> {
  // Igual que al exportar: ArrayBuffer, no Blob (ver exportPack).
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
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

  for (const pad of manifest.pads) {
    const entry = zip.file(AUDIO_DIR + pad.fileKey);
    if (!entry) continue;
    // Se reescribe siempre: si la ficha ya llegó por Firestore pero sin audio,
    // esto es exactamente lo que la desbloquea.
    await putSound(pad.fileKey, new Blob([await entry.async('arraybuffer')]));
    audios++;
    if (!existing.fileKeys.has(pad.fileKey)) newPads.push(pad);
  }

  const newCategories = (manifest.categories ?? []).filter(c => !existing.categoryIds.has(c.id));

  return { audios, newPads, newCategories };
}

/** Nombre sugerido para el archivo exportado. */
export function packFileName(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `soundpad-caninde-${stamp}.zip`;
}
