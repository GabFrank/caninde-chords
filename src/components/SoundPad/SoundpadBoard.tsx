// El tablero: lo que ve y toca el operador durante la ceremonia.
//
// Prioridades de esta pantalla, en este orden: que el pad correcto se encuentre
// rápido, que se vea qué está sonando, y que haya una forma de cortar todo de
// un toque. Todo lo demás (alta, categorías, pack) queda detrás de un botón.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Square, Star, Tags, Volume2, HardDrive, AlertTriangle, X,
  Download, Upload, ArrowUpDown, Keyboard, Radio,
} from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useViewport } from '../../lib/useViewport';
import { SoundPad } from '../../types';
import { translations, Strings } from '../../translations';
import { formatBytes } from '../../services/soundLibrary';
import { padColor, UNCATEGORIZED_ID } from '../../lib/soundpadStyles';
import { resolveShortcut, shortcutKeyFor } from '../../lib/padShortcuts';
import { midiService, isMidiSupported } from '../../services/midi';
import { useSoundpad } from './useSoundpad';
import { SoundPadButton } from './SoundPadButton';
import { SoundPadEditor } from './SoundPadEditor';
import { CategoryManager } from './CategoryManager';
import { PadArranger } from './PadArranger';

interface SoundpadBoardProps {
  lang?: 'es' | 'en';
}

const FAVORITES = '__favorites__';
const ALL = '__all__';

export const SoundpadBoard: React.FC<SoundpadBoardProps> = ({ lang = 'es' }) => {
  const { user } = useAuth();
  const t = translations[lang];
  const sp = useSoundpad();
  // En teléfono apaisado la cabecera de la app, las dos barras, los chips y el
  // buscador se comían los 390px de alto y no quedaba ni una fila de pads
  // legible. Con poco alto la pantalla se compacta y el buscador se despliega.
  const { isShort } = useViewport();

  const [filter, setFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ open: boolean; pad: SoundPad | null }>({ open: false, pad: null });
  const [showCategories, setShowCategories] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [midiOn, setMidiOn] = useState(midiService.enabled);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [packBusy, setPackBusy] = useState<'export' | 'import' | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const packInput = useRef<HTMLInputElement>(null);

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
      if (!nav.wakeLock || wakeLockRef.current) return;
      try {
        const lock = await nav.wakeLock.request('screen');
        if (cancelled) { lock.release?.(); return; }
        wakeLockRef.current = lock;
        // El navegador suelta el bloqueo por su cuenta al ocultarse la pestaña.
        // Sin enterarnos, la referencia quedaba apuntando a un centinela muerto
        // y el guardián de más abajo impedía volver a pedirlo: la pantalla se
        // apagaba sola a partir de la primera vez que el operador salía.
        lock.addEventListener?.('release', () => { wakeLockRef.current = null; });
      } catch {
        // El navegador puede negarlo (batería baja, pestaña oculta): no es grave.
      }
    };
    request();
    // El bloqueo se pierde al ocultar la pestaña; hay que volver a pedirlo.
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
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

  /** Tecla de cada pad. Con `indexOf` dentro del render esto era O(n²). */
  const teclaDe = useMemo(() => {
    const m = new Map<string, string>();
    visiblePads.forEach((p, i) => {
      const k = shortcutKeyFor(i);
      if (k) m.set(p.id, k);
    });
    return m;
  }, [visiblePads]);

  // Lo que se dispara por atajo o por MIDI se lee de una referencia y no de una
  // dependencia del efecto: si no, cada cambio en la lista de pads —o cada
  // cuadro del progreso— desmontaría y volvería a montar el listener global.
  const liveRef = useRef({ pads: visiblePads, play: sp.playPad, panic: sp.stopAll, arranging });
  useEffect(() => {
    liveRef.current = { pads: visiblePads, play: sp.playPad, panic: sp.stopAll, arranging };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { pads, play, panic, arranging: organizando } = liveRef.current;
      // Con un modal abierto, Escape le pertenece al modal. El pánico sí
      // funciona mientras se organiza: es el reflejo entrenado del operador.
      const modalOpen = Boolean(document.querySelector('[data-overlay]'));
      const action = resolveShortcut(e, { modalOpen, arranging: organizando });
      if (!action) return;
      e.preventDefault();
      if (action.kind === 'panic') { panic(); return; }
      const pad = pads[action.index];
      if (pad) play(pad);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // MIDI: cada pad con `midiNote` asignada responde a esa nota, venga de donde
  // venga. No se filtra por canal a propósito: un pedal barato manda por el que
  // se le antoja y hacer que el usuario lo averigüe no aporta nada.
  useEffect(() => {
    if (!midiOn) return;
    return midiService.subscribe(({ note }) => {
      if (liveRef.current.arranging) return;
      // Con un modal abierto tampoco: enseñarle una nota al pad con "Aprender"
      // hacía sonar a todo volumen el pad que ya la tenía asignada.
      if (document.querySelector('[data-overlay]')) return;
      const pad = liveRef.current.pads.find(p => p.midiNote === note);
      if (pad) liveRef.current.play(pad);
    });
  }, [midiOn]);

  // La lista de controladores se mantiene al día sola: enchufar el pedal con la
  // app abierta, o volver de otra pestaña, tienen que reflejarse.
  useEffect(() => {
    if (!midiOn) return;
    return midiService.subscribeDevices(setMidiDevices);
  }, [midiOn]);

  const enableMidi = async () => {
    setMidiError(null);
    const ok = await midiService.enable();
    if (!ok) { setMidiError(t.soundpadMidiDenied); return; }
    setMidiOn(true);
  };

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

  const doExport = async () => {
    if (sp.pads.length === 0) { setPackNote(t.soundpadPackEmpty); return; }
    setPackBusy('export');
    setPackNote(null);
    try {
      await sp.downloadPack();
      setPackNote(t.soundpadExported);
    } catch (e) {
      setPackNote(e instanceof Error ? e.message : String(e));
    } finally {
      setPackBusy(null);
    }
  };

  const doImport = async (file: File | null) => {
    if (!file) return;
    setPackBusy('import');
    setPackNote(null);
    try {
      const { audios, created } = await sp.loadPack(file);
      setPackNote(`${t.soundpadImported}: ${audios} · +${created}`);
    } catch (e) {
      setPackNote(e instanceof Error && e.message === 'pack-invalido'
        ? t.soundpadPackInvalid
        : (e instanceof Error ? e.message : String(e)));
    } finally {
      setPackBusy(null);
      if (packInput.current) packInput.current.value = '';
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">{t.soundpadSignIn}</div>
    );
  }

  const chips: { id: string; label: string; dot?: string; count: number }[] = [
    { id: ALL, label: t.soundpadAll, count: sp.pads.length },
    { id: FAVORITES, label: t.soundpadFavorites, count: sp.pads.filter(p => p.favorite).length },
    ...sp.categories.filter(c => c.id !== UNCATEGORIZED_ID)
      .map(c => ({ id: c.id, label: c.name, dot: padColor(c.color).dot, count: countByCategory[c.id] ?? 0 })),
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
            className="w-full h-11 accent-blue-600 cursor-pointer"
          />
          <span className="text-[10px] font-bold text-zinc-400 w-8 text-right tabular-nums">
            {Math.round(sp.masterVolume * 100)}
          </span>
        </div>

        <div className={`flex items-center gap-1.5 ml-auto ${arranging ? 'hidden' : ''}`}>
          <button
            type="button"
            onClick={() => setArranging(true)}
            disabled={visiblePads.length < 2}
            aria-label={t.soundpadArrange}
            className="min-h-11 min-w-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <ArrowUpDown size={14} />
            <span className="hidden sm:inline">{t.soundpadArrange}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCategories(true)}
            aria-label={t.soundpadCategories}
            className="min-h-11 min-w-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Tags size={14} />
            <span className="hidden sm:inline">{t.soundpadCategories}</span>
          </button>
          <button
            type="button"
            onClick={() => setEditing({ open: true, pad: null })}
            aria-label={t.soundpadAdd}
            className="min-h-11 min-w-11 px-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t.soundpadAdd}</span>
          </button>
        </div>
      </div>

      {/* Qué está sonando ahora.
          El contenedor está SIEMPRE presente y con alto fijo. Insertarlo sólo
          cuando algo suena empujaba la grilla 70px hacia abajo justo al disparar
          el primer pad: el operador apuntaba a la segunda fila y, para cuando
          bajaba el dedo, ese punto ya lo ocupaba la primera. */}
      <div className="h-14 flex items-center shrink-0">
        {sp.voices.length > 0 ? (
          <div className="w-full h-full flex items-center gap-1.5 px-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 overflow-x-auto touch-scrolling">
            <span className="text-[10px] font-black text-blue-600 uppercase px-1 shrink-0">
              {t.soundpadPlaying}
            </span>
            {sp.voices.map(voice => (
              <button
                key={voice.voiceId}
                type="button"
                onClick={() => sp.stopVoice(voice.voiceId)}
                data-voice-id={voice.voiceId}
                aria-label={`${t.soundpadStopVoice}: ${voice.padName}`}
                className="shrink-0 min-h-9 pl-2.5 pr-2 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900 text-[11px] font-bold flex items-center gap-1.5"
              >
                {voice.padName}
                <X size={12} className="text-zinc-400" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-zinc-400 px-1">{t.soundpadIdle}</p>
        )}
      </div>

      {/* Filtros y búsqueda. Se ocultan mientras se organiza: cambiar el filtro
          a mitad de un reordenamiento cambia el conjunto bajo los pies. */}
      <div className={`space-y-2 ${arranging ? 'hidden' : ''}`}>
        <div className="flex gap-1.5 overflow-x-auto touch-scrolling pb-1">
          {chips.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              aria-pressed={filter === chip.id}
              className={`shrink-0 min-h-9 px-3 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-colors ${filter === chip.id ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}
            >
              {chip.id === FAVORITES
                ? <Star size={11} className={filter === chip.id ? 'fill-current' : ''} />
                : chip.dot && <span className={`h-2 w-2 rounded-full ${chip.dot}`} />}
              {chip.label}
              <span className="opacity-60">{chip.count}</span>
            </button>
          ))}
        </div>

        {(!isShort || searchOpen || search) ? (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              autoFocus={searchOpen}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.soundpadSearch}
              aria-label={t.soundpadSearch}
              className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t.soundpadSearch}
            className="min-h-9 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-500 flex items-center gap-1.5"
          >
            <Search size={12} />
            {t.soundpadSearch}
          </button>
        )}
      </div>

      {!arranging && sp.pads.length === 1 && (
        <p className="text-[10px] text-zinc-500">{t.soundpadArrangeEmpty}</p>
      )}

      {/* El tablero, o el organizador mientras se acomoda el orden. */}
      {arranging ? (
        <PadArranger
          pads={visiblePads}
          onSave={sp.reorderPads}
          onCancel={() => setArranging(false)}
          t={t}
        />
      ) : sp.loading ? (
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
        <div className={`grid gap-2.5 pt-1.5 ${isShort ? 'grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'}`}>
          {visiblePads.map(pad => (
            <SoundPadButton
              key={pad.id}
              pad={pad}
              playing={playingPadIds.has(pad.id)}
              progress={progressOf(pad.id)}
              missing={sp.missingIds.has(pad.id)}
              onTrigger={sp.playPad}
              onStop={(p) => sp.stopPad(p.id)}
              onRetract={sp.retract}
              dense={isShort}
              shortcut={teclaDe.get(pad.id) ?? null}
              onEdit={(p) => setEditing({ open: true, pad: p })}
              onToggleFavorite={sp.toggleFavorite}
              labels={{
                favorite: t.soundpadFavorite,
                edit: t.edit,
                missing: t.soundpadMissing,
                overlayOn: t.soundpadOverlayOn,
                overlayOff: t.soundpadOverlayOff,
                loop: t.soundpadRepeatLoop,
                stop: t.soundpadStop,
                shortcut: t.soundpadShortcuts,
              }}
            />
          ))}
        </div>
      )}

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

      {/* Pie: pack y espacio ocupado. Los audios viven en este dispositivo, así
          que llevarlos a otro y saber cuánto ocupan son parte del trabajo. */}
      <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            ref={packInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => doImport(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={doExport}
            disabled={packBusy !== null}
            className="min-h-9 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download size={12} />
            {packBusy === 'export' ? t.soundpadExporting : t.soundpadExport}
          </button>
          <button
            type="button"
            onClick={() => packInput.current?.click()}
            disabled={packBusy !== null}
            className="min-h-9 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload size={12} />
            {packBusy === 'import' ? t.soundpadImporting : t.soundpadImport}
          </button>
          {packNote && <span className="text-[10px] text-zinc-500">{packNote}</span>}
        </div>

        {/* Atajos y MIDI: disparar sin tocar la pantalla. El acceso a MIDI se pide
            sólo cuando el usuario lo enciende — pedirlo al abrir el tablero sería
            una ventana de permiso que la mayoría no necesita. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            <Keyboard size={11} />
            {t.soundpadShortcutsHint}
          </span>
          {isMidiSupported() ? (
            midiOn ? (
              <span className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                <Radio size={11} className="text-emerald-500" />
                {t.soundpadMidi}: {midiDevices.length > 0 ? midiDevices.join(', ') : t.soundpadMidiNoDevices}
              </span>
            ) : (
              <button
                type="button"
                onClick={enableMidi}
                className="min-h-9 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center gap-1.5"
              >
                <Radio size={12} />
                {t.soundpadMidiEnable}
              </button>
            )
          ) : (
            <span className="text-[10px] text-zinc-400">{t.soundpadMidiUnsupported}</span>
          )}
          {midiError && <span className="text-[10px] text-amber-600">{midiError}</span>}
        </div>

        {sp.usage && sp.usage.usedBytes > 0 && (
          <p className="text-[10px] text-zinc-400 flex items-center gap-1.5 flex-wrap">
            <HardDrive size={11} />
            {t.soundpadStorage}: {formatBytes(sp.usage.usedBytes)}
            {sp.usage.quotaBytes > 0 && ` / ${formatBytes(sp.usage.quotaBytes)}`}
            {!sp.usage.persistent && <span className="text-amber-600">· {t.soundpadNotPersistent}</span>}
          </p>
        )}
      </div>

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
        lang={lang}
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
