// Estado del Soundpad: catálogo en Firestore, audio en el dispositivo y motor.
//
// El pad es la unión de dos cosas que viven en lugares distintos: la ficha
// (Firestore, sincronizada) y el archivo (IndexedDB, local). Por eso existe
// `missingIds`: una ficha puede llegar desde otro dispositivo sin su audio.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, query, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../AuthProvider';
import { SoundCategory, SoundPad } from '../../types';
import {
  deleteSound, estimateUsage, makeFileKey, pruneOrphans, putSound, readDurationMs, StorageUsage,
} from '../../services/soundLibrary';
import { ActiveVoice, MissingAudioError, soundpadEngine } from '../../services/soundpadEngine';
import { exportPack, importPack, packFileName } from '../../services/soundpadPack';
import { DEFAULT_COLOR_ID, DEFAULT_ICON_ID, UNCATEGORIZED_ID } from '../../lib/soundpadStyles';
import { reassignOrder } from '../../lib/padOrder';

export type PadDraft = Omit<SoundPad, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

/**
 * Quita las claves cuyo valor es `undefined`.
 *
 * Firestore las rechaza, y lo hace LANZANDO DE FORMA SÍNCRONA: un `.catch()` en
 * la promesa no las atrapa, así que un solo campo opcional ausente cortaba el
 * bucle entero de la importación y no se creaba ninguna ficha.
 */
function sinUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Deja el fallo de Firestore diagnosticado como manda AGENTS.md y además lo pone
 * en pantalla.
 *
 * `handleFirestoreError` registra el diagnóstico completo (identidad, operación,
 * ruta) y después LANZA. Llamarlo suelto dentro de un callback del SDK propaga
 * la excepción a un sitio donde nadie la atrapa y deja el estado a medias: un
 * `permission-denied` en el listener dejaba el tablero cargando para siempre,
 * mudo. Acá se atrapa esa excepción para quedarse con el diagnóstico y seguir.
 */
function reportFirestore(
  err: unknown,
  op: OperationType,
  path: string,
  setError: (m: string) => void,
  cleanup?: () => void,
) {
  try {
    handleFirestoreError(err, op, path);
  } catch (diagnosed) {
    setError(diagnosed instanceof Error ? diagnosed.message : String(diagnosed));
  }
  cleanup?.();
}

export interface SoundpadState {
  pads: SoundPad[];
  categories: SoundCategory[];
  loading: boolean;
  /** Ids de pads cuya ficha llegó pero cuyo audio no está en este dispositivo. */
  missingIds: Set<string>;
  voices: ActiveVoice[];
  masterVolume: number;
  usage: StorageUsage | null;
  error: string | null;
}

export function useSoundpad() {
  const { user } = useAuth();
  const [pads, setPads] = useState<SoundPad[]>([]);
  const [categories, setCategories] = useState<SoundCategory[]>([]);
  const [loadingPads, setLoadingPads] = useState(true);
  const [loadingCats, setLoadingCats] = useState(true);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [voices, setVoices] = useState<ActiveVoice[]>([]);
  const [masterVolume, setMasterVolumeState] = useState(soundpadEngine.getMasterVolume());
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Firmas de catálogo ya precargadas, para no volver a decodificar en cada snapshot. */
  const preloadedFor = useRef('');
  /**
   * Claves de audio escritas en esta sesión. Existe para que `pruneOrphans` no
   * borre un archivo recién guardado: el blob se escribe ANTES de que su ficha
   * exista en `pads`, y en esa ventana cualquier snapshot que llegue (un pad
   * creado en otro dispositivo, por ejemplo) lo vería como huérfano.
   */
  const ownKeys = useRef<Set<string>>(new Set());

  // ── Catálogo ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) { setPads([]); setLoadingPads(false); return; }
    setLoadingPads(true);
    const q = query(collection(db, 'soundPads'), where('ownerId', '==', user.uid));
    return onSnapshot(q, snap => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() }) as SoundPad);
      next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
      setPads(next);
      setLoadingPads(false);
    }, err => reportFirestore(err, OperationType.LIST, 'soundPads', setError, () => setLoadingPads(false)));
  }, [user]);

  useEffect(() => {
    if (!user) { setCategories([]); setLoadingCats(false); return; }
    setLoadingCats(true);
    const q = query(collection(db, 'soundCategories'), where('ownerId', '==', user.uid));
    return onSnapshot(q, snap => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() }) as SoundCategory);
      next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
      setCategories(next);
      setLoadingCats(false);
    }, err => reportFirestore(err, OperationType.LIST, 'soundCategories', setError, () => setLoadingCats(false)));
  }, [user]);

  // ── Motor ──────────────────────────────────────────────────────────────────

  useEffect(() => soundpadEngine.subscribe(setVoices), []);

  // Decodifica los audios en segundo plano para que el primer toque de cada pad
  // salga sin latencia, y detecta los que no están en este dispositivo.
  useEffect(() => {
    if (loadingPads) return;
    const signature = pads.map(p => `${p.id}:${p.fileKey}`).join('|');
    if (signature === preloadedFor.current) return;
    preloadedFor.current = signature;

    let cancelled = false;
    soundpadEngine.preload(pads).then(({ missing }) => {
      if (!cancelled) setMissingIds(new Set(missing));
    });
    // Los audios que ya no referencia ningún pad (borrado desde otro
    // dispositivo) ocupan cuota para nada.
    pruneOrphans(pads.map(p => p.fileKey), ownKeys.current)
      .then(() => estimateUsage())
      .then(u => { if (!cancelled) setUsage(u); })
      .catch(e => console.warn('No se pudo revisar el almacenamiento', e));

    return () => { cancelled = true; };
  }, [pads, loadingPads]);

  // iOS suspende el contexto al bloquear la pantalla o pasar a segundo plano;
  // al volver hay que reanimarlo o los pads quedan mudos sin avisar.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') soundpadEngine.unlock(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── Acciones sobre el catálogo ─────────────────────────────────────────────

  /**
   * Los pads nuevos van al final. Se usa el reloj y no `max(order)+1` porque dos
   * altas seguidas, antes de que llegue el snapshot de la primera, recibían el
   * mismo número.
   */
  const nextOrder = () => Date.now();

  /** Firestore rechaza los textos largos; el recorte vive en un solo sitio. */
  const padName = (v: string) => v.slice(0, 59);
  const categoryName = (v: string) => v.slice(0, 39);

  /**
   * Crea un pad: primero el archivo en el dispositivo, después la ficha.
   *
   * La escritura en Firestore NO se espera. Con persistencia offline, el SDK
   * aplica el cambio al instante en la caché local —`onSnapshot` ya lo emite— y
   * lo sincroniza cuando haya red; la promesa, en cambio, sólo resuelve cuando
   * el servidor confirma. Esperarla dejaría el formulario colgado justo donde
   * más falta hace que no lo haga: cargando sonidos en el lugar de la ceremonia,
   * con mala conexión. Si al final la escritura falla, el archivo queda como
   * huérfano y lo limpia `pruneOrphans` en la siguiente pasada.
   */
  const createPad = useCallback(async (file: File, draft: Partial<PadDraft>) => {
    if (!user) return;
    setError(null);
    const fileKey = makeFileKey(file.name);
    try {
      await putSound(fileKey, file);
      ownKeys.current.add(fileKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
    const durationMs = await readDurationMs(file);
    addDoc(collection(db, 'soundPads'), sinUndefined({
      name: padName(draft.name || file.name.replace(/\.[^.]+$/, '')),
      categoryId: draft.categoryId || UNCATEGORIZED_ID,
      color: draft.color ?? DEFAULT_COLOR_ID,
      icon: draft.icon ?? DEFAULT_ICON_ID,
      fileKey,
      fileName: file.name.slice(0, 199),
      fileSize: file.size,
      ...(durationMs ? { durationMs } : {}),
      volume: draft.volume ?? 0.85,
      repeat: draft.repeat ?? 1,
      overlay: draft.overlay ?? true,
      fadeOutMs: draft.fadeOutMs ?? 120,
      // Estos tres se estaban perdiendo: el operador aprendía la nota del pedal
      // al dar de alta, guardaba, y el pad nacía sin ella y sin ningún aviso.
      midiNote: draft.midiNote,
      trimStartMs: draft.trimStartMs,
      trimEndMs: draft.trimEndMs,
      favorite: draft.favorite ?? false,
      order: nextOrder(),
      ownerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })).catch(e => reportFirestore(e, OperationType.CREATE, 'soundPads', setError));
  }, [user]);

  /**
   * Cambia la ficha de un pad. Con `file`, reemplaza además su audio.
   *
   * El audio viejo no se borra acá: si el servidor terminara rechazando la
   * escritura, Firestore revierte la ficha y el pad volvería a apuntar a un
   * archivo que ya no existe. Se lo deja para `pruneOrphans`, que borra lo que
   * ningún pad referencia una vez que el catálogo se asentó.
   */
  const updatePad = useCallback(async (pad: SoundPad, changes: Partial<PadDraft>, file?: File) => {
    if (!user) return;
    setError(null);
    // Firestore rechaza los `undefined`: un campo opcional que se vacía —quitarle
    // la nota MIDI a un pad, por ejemplo— se BORRA, no se manda como undefined.
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(changes)) {
      patch[k] = v === undefined ? deleteField() : v;
    }
    if (file) {
      try {
        const newKey = makeFileKey(file.name);
        await putSound(newKey, file);
        ownKeys.current.add(newKey);
        const durationMs = await readDurationMs(file);
        patch.fileKey = newKey;
        patch.fileName = file.name.slice(0, 199);
        patch.fileSize = file.size;
        // Las marcas del recorte apuntaban al archivo VIEJO: conservarlas
        // recortaría el nuevo por donde no corresponde, o lo dejaría mudo.
        patch.trimStartMs = deleteField();
        patch.trimEndMs = deleteField();
        // Si la duración del archivo nuevo no se puede leer, se BORRA el campo:
        // dejarlo mostraría la duración del archivo anterior.
        patch.durationMs = durationMs ?? deleteField();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
      soundpadEngine.forget(pad.fileKey);
      setMissingIds(prev => {
        if (!prev.has(pad.id)) return prev;
        const next = new Set(prev);
        next.delete(pad.id);
        return next;
      });
    }
    updateDoc(doc(db, 'soundPads', pad.id), patch)
      .catch(e => reportFirestore(e, OperationType.UPDATE, `soundPads/${pad.id}`, setError));
  }, [user]);

  /**
   * Borra un pad. El audio NO se borra acá: si el servidor rechazara la baja,
   * Firestore restituye la ficha y el pad quedaría apuntando a un archivo que ya
   * no existe. Lo limpia `pruneOrphans` cuando el catálogo se asienta sin él —
   * que es también lo que hace la clave dejar de estar protegida.
   */
  const deletePad = useCallback(async (pad: SoundPad) => {
    if (!user) return;
    soundpadEngine.stopPad(pad.id, 0.05);
    soundpadEngine.forget(pad.fileKey);
    ownKeys.current.delete(pad.fileKey);
    deleteDoc(doc(db, 'soundPads', pad.id))
      .catch(e => reportFirestore(e, OperationType.DELETE, `soundPads/${pad.id}`, setError));
  }, [user]);

  const toggleFavorite = useCallback(async (pad: SoundPad) => {
    updateDoc(doc(db, 'soundPads', pad.id), {
      favorite: !pad.favorite,
      updatedAt: serverTimestamp(),
    }).catch(e => reportFirestore(e, OperationType.UPDATE, `soundPads/${pad.id}`, setError));
  }, []);

  const createCategory = useCallback(async (name: string, color: string) => {
    if (!user) return;
    addDoc(collection(db, 'soundCategories'), {
      name: categoryName(name),
      color,
      order: categories.reduce((m, c) => Math.max(m, c.order ?? 0), 0) + 1,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    }).catch(e => reportFirestore(e, OperationType.CREATE, 'soundCategories', setError));
  }, [user, categories]);

  const updateCategory = useCallback(async (category: SoundCategory, changes: Partial<SoundCategory>) => {
    updateDoc(doc(db, 'soundCategories', category.id), {
      ...changes,
      ...(changes.name ? { name: categoryName(changes.name) } : {}),
    }).catch(e => reportFirestore(e, OperationType.UPDATE, `soundCategories/${category.id}`, setError));
  }, []);

  /** Borra la categoría; sus pads pasan a "sin categoría" en vez de desaparecer. */
  const deleteCategory = useCallback(async (category: SoundCategory) => {
    const affected = pads.filter(p => p.categoryId === category.id);
    affected.forEach(p => updateDoc(doc(db, 'soundPads', p.id), {
      categoryId: UNCATEGORIZED_ID,
      updatedAt: serverTimestamp(),
    }).catch(e => reportFirestore(e, OperationType.UPDATE, `soundPads/${p.id}`, setError)));
    deleteDoc(doc(db, 'soundCategories', category.id))
      .catch(e => reportFirestore(e, OperationType.DELETE, `soundCategories/${category.id}`, setError));
  }, [pads]);

  /** Guarda un orden nuevo para los pads que se estaban organizando. */
  const reorderPads = useCallback(async (orderedIds: string[]) => {
    if (!user) return;
    const cambios = reassignOrder(pads, orderedIds);
    if (cambios.length === 0) return;

    // Un `writeBatch` para que sea una sola ida al servidor y para que no pueda
    // quedar la mitad del tablero reordenado.
    const batch = writeBatch(db);
    cambios.forEach(({ id, order }) => {
      batch.update(doc(db, 'soundPads', id), { order, updatedAt: serverTimestamp() });
    });
    // El lote se aplica a la caché local al instante; la promesa espera al
    // servidor, así que no se espera, igual que el resto de las escrituras.
    batch.commit().catch(e => reportFirestore(e, OperationType.WRITE, 'soundPads', setError));
  }, [user, pads]);

  // ── Acciones sobre el motor ────────────────────────────────────────────────

  /** Dispara un pad. Devuelve el id de la voz, o `null` si no llegó a sonar. */
  const playPad = useCallback(async (pad: SoundPad): Promise<string | null> => {
    try {
      const voiceId = await soundpadEngine.play(pad);
      setError(null);
      return voiceId;
    } catch (e) {
      if (e instanceof MissingAudioError) {
        setMissingIds(prev => new Set(prev).add(pad.id));
      } else {
        console.error('No se pudo reproducir el pad', e);
        setError(e instanceof Error ? e.message : String(e));
      }
      return null;
    }
  }, []);

  const setMasterVolume = useCallback((v: number) => {
    soundpadEngine.setMasterVolume(v);
    setMasterVolumeState(soundpadEngine.getMasterVolume());
  }, []);

  // ── Pack .zip ──────────────────────────────────────────────────────────────

  /** Arma el pack y lo entrega al navegador como descarga. */
  const downloadPack = useCallback(async () => {
    const blob = await exportPack(pads, categories);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = packFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Liberar enseguida cancelaría la descarga en algunos navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [pads, categories]);

  /**
   * Importa un pack: los audios van al dispositivo y las fichas que falten se
   * crean en Firestore conservando sus ids, para que un pad que ya llegó desde
   * otro dispositivo recupere su audio en vez de duplicarse.
   */
  const loadPack = useCallback(async (file: File) => {
    if (!user) return { audios: 0, created: 0 };
    const result = await importPack(file, {
      fileKeys: new Set(pads.map(p => p.fileKey)),
      categoryIds: new Set(categories.map(c => c.id)),
    });

    // Protegerlas de `pruneOrphans` hasta que sus fichas lleguen, e invalidar el
    // buffer de las que ya estaban decodificadas: el pack pudo traer otro audio
    // bajo la misma clave y si no, el pad seguiría sonando con el viejo.
    result.importedKeys.forEach(k => {
      ownKeys.current.add(k);
      soundpadEngine.forget(k);
    });

    // Cada ficha va en su propio try: Firestore valida de forma síncrona, así
    // que un solo documento mal formado abortaba el bucle y dejaba los audios
    // escritos sin ninguna ficha que los referenciara — y al recargar,
    // `pruneOrphans` los borraba a todos.
    result.newCategories.forEach(c => {
      try {
        setDoc(doc(db, 'soundCategories', c.id), sinUndefined({
          name: c.name,
          color: c.color,
          order: c.order,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        })).catch(e => reportFirestore(e, OperationType.CREATE, `soundCategories/${c.id}`, setError));
      } catch (e) {
        reportFirestore(e, OperationType.CREATE, `soundCategories/${c.id}`, setError);
      }
    });

    let creados = 0;
    result.newPads.forEach(p => {
      try {
        addDoc(collection(db, 'soundPads'), sinUndefined({
          ...p,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })).catch(e => reportFirestore(e, OperationType.CREATE, 'soundPads', setError));
        creados++;
      } catch (e) {
        reportFirestore(e, OperationType.CREATE, 'soundPads', setError);
      }
    });

    // El estado de "falta el audio" se RECALCULA contra lo que hay realmente en
    // el dispositivo. Limpiarlo sin más mentía: importar un pack incompleto
    // dejaba el tablero con pinta de sano y el fallo aparecía recién al tocar el
    // pad, en plena ceremonia.
    preloadedFor.current = '';
    const { missing } = await soundpadEngine.preload(pads);
    setMissingIds(new Set(missing));

    return { audios: result.audios, created: creados };
  }, [user, pads, categories]);

  const refreshUsage = useCallback(() => {
    estimateUsage().then(setUsage).catch(() => {});
  }, []);

  // Estos cierres van envueltos porque el tablero los usa como dependencias de
  // efectos: recrearlos en cada render hacía que el intervalo del progreso se
  // destruyera y se volviera a crear unas doce veces por segundo.
  const stopPad = useCallback((padId: string) => soundpadEngine.stopPad(padId), []);
  const stopVoice = useCallback((voiceId: string) => soundpadEngine.stopVoice(voiceId), []);
  /** Pánico: cada voz se apaga con su propio fundido. */
  const stopAll = useCallback(() => soundpadEngine.stopAll(), []);
  /** Retira un disparo que resultó ser el comienzo de un desplazamiento. */
  const retract = useCallback((voiceId: string) => soundpadEngine.retract(voiceId), []);
  /** Reloj del AudioContext, para calcular el progreso de las voces. */
  const clock = useCallback(() => soundpadEngine.now(), []);

  const state: SoundpadState = useMemo(() => ({
    pads, categories, loading: loadingPads || loadingCats,
    missingIds, voices, masterVolume, usage, error,
  }), [pads, categories, loadingPads, loadingCats, missingIds, voices, masterVolume, usage, error]);

  return {
    ...state,
    createPad, updatePad, deletePad, toggleFavorite,
    createCategory, updateCategory, deleteCategory, reorderPads,
    playPad,
    stopPad, stopVoice, stopAll, retract, clock,
    setMasterVolume, refreshUsage, setError,
    downloadPack, loadPack,
  };
}
