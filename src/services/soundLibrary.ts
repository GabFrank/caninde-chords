// Biblioteca de audio del Soundpad: los archivos MP3 en IndexedDB.
//
// Por qué acá y no en la nube: Cloud Storage for Firebase pasó a exigir el plan
// de pago Blaze, y para un soundpad de escenario lo que importa es que el sonido
// salga al instante y sin depender de la conexión del lugar. Guardados en el
// dispositivo, el disparo no toca la red nunca.
//
// El reparto es: acá el audio (por dispositivo), en Firestore el catálogo
// (nombre, categoría, volumen, repeticiones, overlay, favorito), que sí se
// sincroniza. Para llevar los audios a otro dispositivo está el pack .zip.
//
// Se usa la API nativa de IndexedDB en vez de sumar una dependencia: son cuatro
// operaciones sobre un único almacén de clave/valor.

const DB_NAME = 'caninde-sounds';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no soporta IndexedDB.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB.'));
    // Otra pestaña bloquea una migración: no dejar la promesa colgada.
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña de la app.'));
  });
  // Un fallo no debe dejar la promesa cacheada para siempre.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/**
 * Ejecuta una operación sobre el almacén.
 *
 * En escritura se espera al `complete` de la transacción, no al `success` de la
 * petición: una petición puede tener éxito y la transacción abortar después (por
 * cuota agotada al confirmar, por ejemplo). Dar el archivo por guardado antes
 * de tiempo haría que se creara la ficha de un pad cuyo audio no llegó al disco.
 *
 * Y `onabort` se escucha siempre: sin él, un aborto que no pasa por `onerror`
 * dejaba la promesa sin asentarse nunca y el formulario colgado en "guardando".
 */
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const fail = (e: unknown) => reject(e instanceof Error ? e : new Error('Falló la operación en IndexedDB.'));
    let result: T;
    const req = run(transaction.objectStore(STORE));
    req.onsuccess = () => {
      result = req.result;
      if (mode === 'readonly') resolve(result);
    };
    req.onerror = () => fail(req.error);
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => fail(transaction.error ?? new Error('La transacción de IndexedDB se abortó.'));
    transaction.onerror = () => fail(transaction.error);
  }));
}

/** Clave única y estable para un archivo nuevo. */
export function makeFileKey(fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}-${safe}`;
}

export function putSound(fileKey: string, blob: Blob): Promise<void> {
  return tx('readwrite', store => store.put(blob, fileKey)).then(() => undefined);
}

export function getSound(fileKey: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', store => store.get(fileKey));
}

export function deleteSound(fileKey: string): Promise<void> {
  return tx('readwrite', store => store.delete(fileKey)).then(() => undefined);
}

export function listKeys(): Promise<string[]> {
  return tx<IDBValidKey[]>('readonly', store => store.getAllKeys())
    .then(keys => keys.map(String));
}

/**
 * Borra los audios que ya no referencia ningún pad: si un pad se borró desde
 * otro dispositivo, su archivo queda acá ocupando cuota sin que nada lo apunte.
 *
 * `protectedKeys` es imprescindible, no un adorno. El audio se guarda ANTES de
 * que exista la ficha del pad, así que durante esa ventana el archivo recién
 * escrito parece huérfano; sin protegerlo, un snapshot de Firestore que llegue
 * en ese instante (por ejemplo un pad creado en otro dispositivo) haría que se
 * borre el archivo que el usuario acaba de elegir.
 */
export async function pruneOrphans(usedKeys: string[], protectedKeys: Iterable<string> = []): Promise<number> {
  const orphans = selectOrphans(await listKeys(), usedKeys, protectedKeys);
  await Promise.all(orphans.map(k => deleteSound(k)));
  return orphans.length;
}

/** La decisión de qué borrar, separada para poder probarla. */
export function selectOrphans(allKeys: string[], usedKeys: string[], protectedKeys: Iterable<string> = []): string[] {
  const keep = new Set(usedKeys);
  for (const k of protectedKeys) keep.add(k);
  return allKeys.filter(k => !keep.has(k));
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  /** true si el navegador se comprometió a no evacuar estos datos. */
  persistent: boolean;
}

/**
 * Cuánto espacio ocupan los audios y si el almacenamiento es persistente.
 *
 * Pide `navigator.storage.persist()`: sin eso el navegador puede liberar
 * IndexedDB cuando le falta espacio, y la biblioteca de sonidos desaparecería
 * en medio de una ceremonia. Con permiso concedido, sólo se borra si el usuario
 * lo borra.
 */
export async function estimateUsage(): Promise<StorageUsage> {
  const empty: StorageUsage = { usedBytes: 0, quotaBytes: 0, persistent: false };
  if (typeof navigator === 'undefined' || !navigator.storage) return empty;
  let persistent = false;
  try {
    persistent = await navigator.storage.persisted?.() ?? false;
    if (!persistent) persistent = await navigator.storage.persist?.() ?? false;
  } catch {
    // Firefox puede pedir confirmación al usuario y rechazar: no es un error.
  }
  try {
    const est = await navigator.storage.estimate();
    return { usedBytes: est.usage ?? 0, quotaBytes: est.quota ?? 0, persistent };
  } catch {
    return { ...empty, persistent };
  }
}

/** Tipos de archivo que aceptamos en el selector y al importar un pack. */
export const ACCEPTED_AUDIO = 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/mp4,.mp3,.wav,.ogg,.m4a';

/** Lee la duración de un archivo de audio sin decodificarlo entero. */
export function readDurationMs(blob: Blob): Promise<number | undefined> {
  return new Promise(resolve => {
    if (typeof Audio === 'undefined') { resolve(undefined); return; }
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    const done = (ms?: number) => { URL.revokeObjectURL(url); resolve(ms); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined);
    el.onerror = () => done(undefined);
    el.src = url;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '--:--';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
