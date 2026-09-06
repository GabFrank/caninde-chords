// El tablero: lo que ve y toca el operador durante la ceremonia.
//
// Prioridades de esta pantalla, en este orden: que el pad correcto se encuentre
// rápido, que se vea qué está sonando, y que haya una forma de cortar todo de
// un toque. Todo lo demás (alta, categorías, pack) queda detrás de un botón.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Square, Star, Tags, Volume2, HardDrive, AlertTriangle, X,
} from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { SoundPad } from '../../types';
import { translations } from '../../translations';
import { formatBytes } from '../../services/soundLibrary';
import { padColor, UNCATEGORIZED_ID } from '../../lib/soundpadStyles';
import { useSoundpad } from './useSoundpad';
import { SoundPadButton } from './SoundPadButton';
import { SoundPadEditor } from './SoundPadEditor';
import { CategoryManager } from './CategoryManager';

interface SoundpadBoardProps {
  lang?: 'es' | 'en';
}

const FAVORITES = '__favorites__';
const ALL = '__all__';

export const SoundpadBoard: React.FC<SoundpadBoardProps> = ({ lang = 'es' }) => {
  const { user } = useAuth();
  const t = translations[lang] as unknown as Record<string, string>;
  const sp = useSoundpad();

  const [filter, setFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ open: boolean; pad: SoundPad | null }>({ open: false, pad: null });
  const [showCategories, setShowCategories] = useState(false);
  const [clock, setClock] = useState(0);

  // El progreso se refresca sólo mientras hay algo sonando: un intervalo
  // permanente mantendría la pantalla despierta y el móvil caliente sin motivo.
  const readClock = sp.clock;
  useEffect(() => {
    if (sp.voices.length === 0) return;
    setClock(readClock());
    const id = window.setInterval(() => setClock(readClock()), 100);
    return () => window.clearInterval(id);
  }, [sp.voices.length, readClock]);

  // Mientras el tablero está abierto la pantalla no se apaga: en iOS bloquear la
  // pantalla suspende el audio, y el operador necesita ver los pads igual.
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const request = async () => {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<any> } };
      if (!nav.wakeLock) return;
      try {
        const lock = await nav.wakeLock.request('screen');
        if (cancelled) { lock.release?.(); return; }
        wakeLockRef.current = lock;
      } catch {
        // El navegador puede negarlo (batería baja, pestaña oculta): no es grave.
      }
    };
    request();
    // El bloqueo se pierde al ocultar la pestaña; hay que volver a pedirlo.
    const onVisible = () => { if (document.visibilityState === 'visible' && !wakeLockRef.current) request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  const playingPadIds = useMemo(() => new Set(sp.voices.map(v => v.padId)), [sp.voices]);

  const countByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pad of sp.pads) counts[pad.categoryId] = (counts[pad.categoryId] ?? 0) + 1;
    return counts;
  }, [sp.pads]);

  const visiblePads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sp.pads.filter(pad => {
      if (term && !pad.name.toLowerCase().includes(term)) return false;
      if (filter === ALL) return true;
      if (filter === FAVORITES) return pad.favorite;
      return pad.categoryId === filter;
    });
  }, [sp.pads, filter, search]);

  /**
   * Progreso de un pad, de 0 a 1. `null` si está en bucle indefinido (no hay
   * final que mostrar) o si no suena.
   *
   * Se mide con el reloj del AudioContext, no con `Date.now()`: es el mismo que
   * programó el `stop()`, así que la barra llega al final justo cuando calla.
   */
  const progressOf = (padId: string): number | null => {
    const voice = sp.voices.find(v => v.padId === padId);
    if (!voice || voice.endsAt === null) return null;
    const total = voice.endsAt - voice.startedAt;
    if (total <= 0) return null;
    return Math.max(0, Math.min(1, (clock - voice.startedAt) / total));
  };

  if (!user) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">{t.soundpadSignIn}</div>
    );
  }

  const chips: { id: string; label: string; dot?: string; count: number }[] = [
    { id: ALL, label: t.soundpadAll, count: sp.pads.length },
    { id: FAVORITES, label: t.soundpadFavorites, count: sp.pads.filter(p => p.favorite).length },
    ...sp.categories.map(c => ({ id: c.id, label: c.name, dot: padColor(c.color).dot, count: countByCategory[c.id] ?? 0 })),
    { id: UNCATEGORIZED_ID, label: t.soundpadUncategorized, count: countByCategory[UNCATEGORIZED_ID] ?? 0 },
  ].filter(chip => chip.id === ALL || chip.count > 0 || chip.id === FAVORITES);

  return (
    <div className="w-full space-y-4">

      {/* Barra de control: pánico y volumen general siempre visibles. */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={sp.stopAll}
          disabled={sp.voices.length === 0}
          className="min-h-11 px-4 rounded-xl bg-red-600 text-white text-xs font-black flex items-center gap-2 disabled:opacity-40 transition-opacity"
        >
          <Square size={14} className="fill-current" />
          {t.soundpadPanic}
        </button>

        <div className="flex items-center gap-2 min-w-[160px] flex-1 max-w-xs">
          <Volume2 size={16} className="text-zinc-400 shrink-0" />
          <input
            type="range" min={0} max={1} step={0.01}
            value={sp.masterVolume}
            aria-label={t.soundpadMaster}
            onChange={(e) => sp.setMasterVolume(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <span className="text-[10px] font-bold text-zinc-400 w-8 text-right tabular-nums">
            {Math.round(sp.masterVolume * 100)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setShowCategories(true)}
            className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1.5"
          >
            <Tags size={14} />
            <span className="hidden sm:inline">{t.soundpadCategories}</span>
          </button>
          <button
            type="button"
            onClick={() => setEditing({ open: true, pad: null })}
            className="min-h-11 px-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-1.5"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t.soundpadAdd}</span>
          </button>
        </div>
      </div>

      {/* Qué está sonando ahora. */}
      {sp.voices.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
          <span className="text-[10px] font-black text-blue-600 uppercase self-center px-1">
            {t.soundpadPlaying}
          </span>
          {sp.voices.map(voice => (
            <button
              key={voice.voiceId}
              type="button"
              onClick={() => sp.stopVoice(voice.voiceId)}
              className="min-h-9 pl-2.5 pr-2 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900 text-[11px] font-bold flex items-center gap-1.5"
            >
              {voice.padName}
              <X size={12} className="text-zinc-400" />
            </button>
          ))}
        </div>
      )}

      {/* Filtros y búsqueda. */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto touch-scrolling pb-1">
          {chips.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              aria-pressed={filter === chip.id}
              className={`shrink-0 min-h-9 px-3 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-colors ${filter === chip.id ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
            >
              {chip.id === FAVORITES
                ? <Star size={11} className={filter === chip.id ? 'fill-current' : ''} />
                : chip.dot && <span className={`h-2 w-2 rounded-full ${chip.dot}`} />}
              {chip.label}
              <span className="opacity-60">{chip.count}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.soundpadSearch}
            aria-label={t.soundpadSearch}
            className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm"
          />
        </div>
      </div>

      {sp.error && (
        <p className="text-xs text-red-600 font-bold flex items-start gap-1.5" role="alert">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{sp.error}</span>
        </p>
      )}

      {sp.missingIds.size > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-relaxed flex items-start gap-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{t.soundpadMissingHelp}</span>
        </p>
      )}

      {/* El tablero. */}
      {sp.loading ? (
        <div className="py-12 text-center text-xs text-zinc-400">…</div>
      ) : visiblePads.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-zinc-500">
            {sp.pads.length === 0 ? t.soundpadEmpty : t.soundpadEmptyCategory}
          </p>
          {sp.pads.length === 0 && (
            <button
              type="button"
              onClick={() => setEditing({ open: true, pad: null })}
              className="min-h-11 px-4 rounded-xl bg-blue-600 text-white text-xs font-black inline-flex items-center gap-2"
            >
              <Plus size={14} />
              {t.soundpadAdd}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 pt-1.5">
          {visiblePads.map(pad => (
            <SoundPadButton
              key={pad.id}
              pad={pad}
              playing={playingPadIds.has(pad.id)}
              progress={progressOf(pad.id)}
              missing={sp.missingIds.has(pad.id)}
              onTrigger={sp.playPad}
              onStop={(p) => sp.stopPad(p.id)}
              onEdit={(p) => setEditing({ open: true, pad: p })}
              onToggleFavorite={sp.toggleFavorite}
              labels={{
                favorite: t.soundpadFavorite,
                edit: t.edit,
                missing: t.soundpadMissing,
                overlayOn: t.soundpadOverlayOn,
                overlayOff: t.soundpadOverlayOff,
                loop: t.soundpadRepeatLoop,
              }}
            />
          ))}
        </div>
      )}

      {/* Espacio ocupado: importa saberlo antes de que el navegador lo decida. */}
      {sp.usage && sp.usage.usedBytes > 0 && (
        <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 pt-2">
          <HardDrive size={11} />
          {t.soundpadStorage}: {formatBytes(sp.usage.usedBytes)}
          {sp.usage.quotaBytes > 0 && ` / ${formatBytes(sp.usage.quotaBytes)}`}
          {!sp.usage.persistent && <span className="text-amber-600">· {t.soundpadNotPersistent}</span>}
        </p>
      )}

      <SoundPadEditor
        open={editing.open}
        pad={editing.pad}
        categories={sp.categories}
        missing={editing.pad ? sp.missingIds.has(editing.pad.id) : false}
        onClose={() => setEditing({ open: false, pad: null })}
        onCreate={sp.createPad}
        onUpdate={sp.updatePad}
        onDelete={sp.deletePad}
        onPreview={sp.playPad}
        onStopPreview={(p) => sp.stopPad(p.id)}
        previewing={editing.pad ? playingPadIds.has(editing.pad.id) : false}
        t={t}
      />

      <CategoryManager
        open={showCategories}
        categories={sp.categories}
        countByCategory={countByCategory}
        onClose={() => setShowCategories(false)}
        onCreate={sp.createCategory}
        onUpdate={sp.updateCategory}
        onDelete={sp.deleteCategory}
        t={t}
      />
    </div>
  );
};

export default SoundpadBoard;
