// Estado del Soundpad: catálogo en Firestore, audio en el dispositivo y motor.
//
// El pad es la unión de dos cosas que viven en lugares distintos: la ficha
// (Firestore, sincronizada) y el archivo (IndexedDB, local). Por eso existe
// `missingIds`: una ficha puede llegar desde otro dispositivo sin su audio.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
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

export type PadDraft = Omit<SoundPad, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

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
    }, err => handleFirestoreError(err, OperationType.LIST, 'soundPads'));
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
    }, err => handleFirestoreError(err, OperationType.LIST, 'soundCategories'));
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
    pruneOrphans(pads.map(p => p.fileKey))
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

  const nextOrder = useCallback(() => (pads.reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1), [pads]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
    const durationMs = await readDurationMs(file);
    addDoc(collection(db, 'soundPads'), {
      name: (draft.name || file.name.replace(/\.[^.]+$/, '')).slice(0, 59),
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
      favorite: draft.favorite ?? false,
      order: nextOrder(),
      ownerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(e => {
      console.error('No se pudo guardar el pad', e);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [user, nextOrder]);

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
    const patch: Record<string, unknown> = { ...changes, updatedAt: serverTimestamp() };
    if (file) {
      try {
        const newKey = makeFileKey(file.name);
        await putSound(newKey, file);
        const durationMs = await readDurationMs(file);
        patch.fileKey = newKey;
        patch.fileName = file.name.slice(0, 199);
        patch.fileSize = file.size;
        if (durationMs) patch.durationMs = durationMs;
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
    updateDoc(doc(db, 'soundPads', pad.id), patch).catch(e => {
      console.error('No se pudo actualizar el pad', e);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [user]);

  const deletePad = useCallback(async (pad: SoundPad) => {
    if (!user) return;
    soundpadEngine.stopPad(pad.id, 0.05);
    soundpadEngine.forget(pad.fileKey);
    deleteDoc(doc(db, 'soundPads', pad.id)).catch(e => {
      console.error('No se pudo borrar el pad', e);
      setError(e instanceof Error ? e.message : String(e));
    });
    await deleteSound(pad.fileKey).catch(() => {});
  }, [user]);

  const toggleFavorite = useCallback(async (pad: SoundPad) => {
    updateDoc(doc(db, 'soundPads', pad.id), {
      favorite: !pad.favorite,
      updatedAt: serverTimestamp(),
    }).catch(e => console.error('No se pudo marcar el favorito', e));
  }, []);

  const createCategory = useCallback(async (name: string, color: string) => {
    if (!user) return;
    addDoc(collection(db, 'soundCategories'), {
      name: name.slice(0, 39),
      color,
      order: categories.reduce((m, c) => Math.max(m, c.order ?? 0), 0) + 1,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    }).catch(e => {
      console.error('No se pudo crear la categoría', e);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [user, categories]);

  const updateCategory = useCallback(async (category: SoundCategory, changes: Partial<SoundCategory>) => {
    updateDoc(doc(db, 'soundCategories', category.id), {
      ...changes,
      ...(changes.name ? { name: changes.name.slice(0, 39) } : {}),
    }).catch(e => console.error('No se pudo renombrar la categoría', e));
  }, []);

  /** Borra la categoría; sus pads pasan a "sin categoría" en vez de desaparecer. */
  const deleteCategory = useCallback(async (category: SoundCategory) => {
    const affected = pads.filter(p => p.categoryId === category.id);
    affected.forEach(p => updateDoc(doc(db, 'soundPads', p.id), {
      categoryId: UNCATEGORIZED_ID,
      updatedAt: serverTimestamp(),
    }).catch(e => console.error('No se pudo reasignar el pad', e)));
    deleteDoc(doc(db, 'soundCategories', category.id))
      .catch(e => console.error('No se pudo borrar la categoría', e));
  }, [pads]);

  // ── Acciones sobre el motor ────────────────────────────────────────────────

  const playPad = useCallback(async (pad: SoundPad) => {
    try {
      await soundpadEngine.play(pad);
      setError(null);
    } catch (e) {
      if (e instanceof MissingAudioError) {
        setMissingIds(prev => new Set(prev).add(pad.id));
      } else {
        console.error('No se pudo reproducir el pad', e);
        setError(e instanceof Error ? e.message : String(e));
      }
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

    result.newCategories.forEach(c => {
      setDoc(doc(db, 'soundCategories', c.id), {
        name: c.name.slice(0, 39),
        color: c.color,
        order: c.order ?? 0,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      }).catch(e => console.error('No se pudo crear la categoría del pack', e));
    });

    result.newPads.forEach(p => {
      addDoc(collection(db, 'soundPads'), {
        ...p,
        name: p.name.slice(0, 59),
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(e => console.error('No se pudo crear el pad del pack', e));
    });

    // Los pads que ya existían y estaban sin audio ahora sí lo tienen: forzar
    // que se vuelvan a decodificar en la próxima pasada.
    preloadedFor.current = '';
    setMissingIds(new Set());

    return { audios: result.audios, created: result.newPads.length };
  }, [user, pads, categories]);

  const refreshUsage = useCallback(() => {
    estimateUsage().then(setUsage).catch(() => {});
  }, []);

  const state: SoundpadState = useMemo(() => ({
    pads, categories, loading: loadingPads || loadingCats,
    missingIds, voices, masterVolume, usage, error,
  }), [pads, categories, loadingPads, loadingCats, missingIds, voices, masterVolume, usage, error]);

  return {
    ...state,
    createPad, updatePad, deletePad, toggleFavorite,
    createCategory, updateCategory, deleteCategory,
    playPad,
    stopPad: (padId: string) => soundpadEngine.stopPad(padId),
    stopVoice: (voiceId: string) => soundpadEngine.stopVoice(voiceId),
    stopAll: () => soundpadEngine.stopAll(0.06),
    /** Reloj del AudioContext, para calcular el progreso de las voces. */
    clock: () => soundpadEngine.now(),
    setMasterVolume, refreshUsage, setError,
    downloadPack, loadPack,
  };
}
