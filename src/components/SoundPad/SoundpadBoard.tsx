// El tablero: lo único que el operador toca durante la ceremonia.
//
// Esta pantalla se dedica ENTERA a disparar. Nada de crear, editar, categorías,
// orden, pack ni MIDI: todo eso vive en `SoundpadSetup`, detrás de un botón.
// Antes convivían acá y en un teléfono quedaba un solo pad visible con el resto
// de la pantalla ocupado por configuración que en vivo no se usa —y que un
// toque desviado podía activar en medio de una ceremonia.
//
// Lo que se queda, y por qué: cortar todo, el volumen general, qué está sonando,
// el filtro por categoría y el buscador (plegado). Todo eso es tocar, no
// configurar.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Square, Star, Volume2, AlertTriangle, X, SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useViewport } from '../../lib/useViewport';
import { SoundPad } from '../../types';
import { translations, Strings } from '../../translations';
import { padColor, UNCATEGORIZED_ID } from '../../lib/soundpadStyles';
import { resolveShortcut, shortcutKeyFor } from '../../lib/padShortcuts';
import { midiService, isMidiSupported } from '../../services/midi';
import { useSoundpad } from './useSoundpad';
import { SoundPadButton } from './SoundPadButton';
import { SoundpadSetup } from './SoundpadSetup';

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
  const [setupOpen, setSetupOpen] = useState(false);
  const [midiOn, setMidiOn] = useState(midiService.enabled);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [clock, setClock] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

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
  const liveRef = useRef({ pads: visiblePads, todos: sp.pads, play: sp.playPad, panic: sp.stopAll, arranging: setupOpen });
  useEffect(() => {
    liveRef.current = { pads: visiblePads, todos: sp.pads, play: sp.playPad, panic: sp.stopAll, arranging: setupOpen };
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
      // Sobre TODOS los pads, no sólo los visibles: la nota es una asignación
      // absoluta del pad, no una posición en pantalla como las teclas 1-0.
      // Filtrar por Favoritos dejaba el pedal mudo sin ninguna señal.
      const pad = liveRef.current.todos.find(p => p.midiNote === note);
      if (pad) liveRef.current.play(pad);
    });
  }, [midiOn]);

  // La lista de controladores se mantiene al día sola: enchufar el pedal con la
  // app abierta, o volver de otra pestaña, tienen que reflejarse.
  useEffect(() => {
    if (!midiOn) return;
    return midiService.subscribeDevices(setMidiDevices);
  }, [midiOn]);

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

  // La preparación reemplaza al tablero entero, no se superpone: mientras se
  // prepara no hace falta ver los pads, y no poder tocarlos sin querer es parte
  // del punto.
  if (setupOpen) {
    return (
      <SoundpadSetup
        sp={sp}
        onClose={() => setSetupOpen(false)}
        midiOn={midiOn}
        onMidiOn={setMidiOn}
        midiDevices={midiDevices}
        t={t}
        lang={lang}
      />
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
    <div className="w-full flex flex-col gap-3">

      {/* Barra de transporte. Sólo lo que se usa TOCANDO: cortar todo, el
          volumen general, buscar y la puerta a la preparación. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={sp.stopAll}
          disabled={sp.voices.length === 0}
          className="min-h-12 px-4 rounded-xl bg-red-600 text-white text-xs font-black flex items-center gap-2 shrink-0 disabled:opacity-40 transition-opacity"
        >
          <Square size={14} className="fill-current" />
          {t.soundpadPanic}
        </button>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Volume2 size={16} className="text-zinc-400 shrink-0" />
          <input
            type="range" min={0} max={1} step={0.01}
            value={sp.masterVolume}
            aria-label={t.soundpadMaster}
            onChange={(e) => sp.setMasterVolume(Number(e.target.value))}
            className="w-full h-11 accent-blue-600 cursor-pointer"
          />
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(v => !v)}
          aria-label={t.soundpadSearch}
          aria-pressed={searchOpen}
          className={`min-h-11 min-w-11 rounded-xl flex items-center justify-center shrink-0 ${searchOpen || search ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          aria-label={t.soundpadSetup}
          className="min-h-11 min-w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center shrink-0"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {(searchOpen || search) && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.soundpadSearch}
            aria-label={t.soundpadSearch}
            className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm"
          />
        </div>
      )}

      {/* Qué está sonando. El alto es fijo aunque no haya nada: insertarlo al
          disparar empujaba la grilla 70px y el segundo toque caía en otro pad. */}
      <div className="h-12 flex items-center shrink-0">
        {sp.voices.length > 0 ? (
          <div className="w-full h-full flex items-center gap-1.5 px-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 overflow-x-auto touch-scrolling">
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
          <p className="text-[10px] text-zinc-500 px-1">{t.soundpadIdle}</p>
        )}
      </div>

      {/* Filtros: es navegación para tocar, no configuración. */}
      {chips.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto touch-scrolling pb-1 shrink-0">
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
      )}

      {/* La grilla, que es para lo que existe esta pantalla. */}
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
              onClick={() => setSetupOpen(true)}
              className="min-h-11 px-4 rounded-xl bg-blue-600 text-white text-xs font-black inline-flex items-center gap-2"
            >
              <Plus size={14} />
              {t.soundpadAdd}
            </button>
          )}
        </div>
      ) : (
        <div className={`grid gap-2.5 ${isShort ? 'grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'}`}>
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
              labels={{
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

      {/* Los avisos van DEBAJO de la grilla: arriba la empujarían. */}
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
    </div>
  );
};

export default SoundpadBoard;
