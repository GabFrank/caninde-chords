// Alta y edición de un pad: archivo, identidad visual y comportamiento al sonar.

import React, { useEffect, useRef, useState } from 'react';
import { Upload, Play, Square, Trash2, Layers, Scissors, Infinity as InfinityIcon, Radio, X } from 'lucide-react';
import { Modal } from '../Modal';
import { SoundCategory, SoundPad } from '../../types';
import { Strings } from '../../translations';
import { ACCEPTED_AUDIO, formatBytes, formatDuration } from '../../services/soundLibrary';
import { MAX_REPEAT, MAX_FADE_MS, soundpadEngine } from '../../services/soundpadEngine';
import { TrimEditor } from './TrimEditor';
import { midiService, midiNoteName } from '../../services/midi';
import {
  DEFAULT_COLOR_ID, DEFAULT_ICON_ID, SOUNDPAD_COLORS, SOUNDPAD_ICONS, UNCATEGORIZED_ID, padIcon,
} from '../../lib/soundpadStyles';
import { PadDraft } from './useSoundpad';

interface SoundPadEditorProps {
  open: boolean;
  /** `null` = alta. */
  pad: SoundPad | null;
  categories: SoundCategory[];
  /** El pad existe pero su audio no está en este dispositivo. */
  missing: boolean;
  onClose: () => void;
  onCreate: (file: File, draft: Partial<PadDraft>) => Promise<void>;
  onUpdate: (pad: SoundPad, changes: Partial<PadDraft>, file?: File) => Promise<void>;
  onDelete: (pad: SoundPad) => Promise<void>;
  /** Prueba el sonido con los ajustes que se están editando, sin guardar. */
  onPreview: (pad: SoundPad) => void;
  onStopPreview: (pad: SoundPad) => void;
  previewing: boolean;
  t: Strings;
}

const emptyDraft = {
  name: '',
  categoryId: UNCATEGORIZED_ID,
  color: DEFAULT_COLOR_ID,
  icon: DEFAULT_ICON_ID,
  volume: 0.85,
  repeat: 1,
  overlay: true,
  fadeOutMs: 120,
  favorite: false,
  midiNote: undefined as number | undefined,
  trimStartMs: undefined as number | undefined,
  trimEndMs: undefined as number | undefined,
};

export const SoundPadEditor: React.FC<SoundPadEditorProps> = ({
  open, pad, categories, missing, onClose, onCreate, onUpdate, onDelete,
  onPreview, onStopPreview, previewing, t,
}) => {
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [learning, setLearning] = useState(false);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setConfirmDelete(false);
    setFormError(null);
    setDraft(pad ? {
      name: pad.name,
      categoryId: pad.categoryId || UNCATEGORIZED_ID,
      color: pad.color ?? DEFAULT_COLOR_ID,
      icon: pad.icon ?? DEFAULT_ICON_ID,
      volume: pad.volume,
      repeat: pad.repeat,
      overlay: pad.overlay,
      fadeOutMs: pad.fadeOutMs ?? 120,
      favorite: pad.favorite,
      midiNote: pad.midiNote,
      trimStartMs: pad.trimStartMs,
      trimEndMs: pad.trimEndMs,
    } : { ...emptyDraft });
    setLearning(false);
  }, [open, pad]);

  // "Aprender": la próxima nota que llegue del controlador queda asignada. Es la
  // única forma razonable de mapear un pedal o un pad físico sin pedirle al
  // usuario que sepa qué número de nota manda su aparato.
  useEffect(() => {
    if (!learning) return;
    const off = midiService.subscribe(({ note }) => {
      setDraft(d => ({ ...d, midiNote: note }));
      setLearning(false);
    });
    return off;
  }, [learning]);

  // El audio decodificado del pad, para dibujar la onda del recortador. Se pide
  // sólo al abrir: el motor lo tiene cacheado desde la precarga del tablero.
  useEffect(() => {
    if (!open || !pad || missing) { setBuffer(null); return; }
    let cancelado = false;
    soundpadEngine.ensureBuffer(pad.fileKey)
      .then(b => { if (!cancelado) setBuffer(b); })
      .catch(() => { if (!cancelado) setBuffer(null); });
    return () => { cancelado = true; };
  }, [open, pad, missing]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    // Al dar de alta, el nombre del archivo es un punto de partida razonable.
    setDraft(d => ({ ...d, name: d.name || f.name.replace(/\.[^.]+$/, '').slice(0, 59) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!pad && !file) { setFormError(t.soundpadFile); return; }
    if (!draft.name.trim()) { setFormError(t.soundpadName); return; }
    setSaving(true);
    try {
      if (pad) await onUpdate(pad, draft, file ?? undefined);
      else await onCreate(file!, draft);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // La prueba usa los ajustes en pantalla sobre el audio ya guardado, para poder
  // afinar volumen y repeticiones sin ciclos de guardar-probar-volver a abrir.
  const previewPad = pad ? { ...pad, ...draft } as SoundPad : null;

  return (
    <Modal isOpen={open} onClose={onClose} title={pad ? t.soundpadEdit : t.soundpadAdd}>
      <form onSubmit={submit} className="space-y-5">

        {/* Archivo */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadFile}</label>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_AUDIO}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={`w-full min-h-11 px-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-xs font-bold transition-colors ${missing && !file ? 'border-amber-400 text-amber-600' : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-blue-500 hover:text-blue-500'}`}
          >
            <Upload size={14} />
            {file ? file.name : (missing ? t.soundpadRelink : pad ? t.soundpadReplaceFile : t.soundpadPickFile)}
          </button>
          {file && (
            <p className="text-[10px] text-zinc-400">{formatBytes(file.size)}</p>
          )}
          {pad && !file && (
            <p className="text-[10px] text-zinc-400 truncate">
              {pad.fileName} · {formatBytes(pad.fileSize)} · {formatDuration(pad.durationMs)}
            </p>
          )}
          {missing && !file && (
            <p className="text-[10px] text-amber-600 leading-relaxed">{t.soundpadMissingHelp}</p>
          )}
        </div>

        {/* Nombre y categoría */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400" htmlFor="pad-name">{t.soundpadName}</label>
          <input
            id="pad-name"
            value={draft.name}
            maxLength={59}
            onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
            className="w-full min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm font-bold"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400" htmlFor="pad-category">{t.soundpadCategory}</label>
          <select
            id="pad-category"
            value={draft.categoryId}
            onChange={(e) => setDraft(d => ({ ...d, categoryId: e.target.value }))}
            className="w-full min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm"
          >
            <option value={UNCATEGORIZED_ID}>{t.soundpadUncategorized}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Identidad visual */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadColor}</label>
          <div className="flex flex-wrap gap-2">
            {SOUNDPAD_COLORS.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setDraft(d => ({ ...d, color: c.id }))}
                aria-label={c.label}
                aria-pressed={draft.color === c.id}
                className={`h-9 w-9 rounded-full ${c.dot} transition-all ${draft.color === c.id ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-zinc-900' : 'opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadIcon}</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(SOUNDPAD_ICONS).map(id => {
              const Icon = padIcon(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, icon: id }))}
                  aria-label={id}
                  aria-pressed={draft.icon === id}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${draft.icon === id ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-blue-600'}`}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Comportamiento */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400" htmlFor="pad-volume">
            {t.soundpadVolume} — {Math.round(draft.volume * 100)}%
          </label>
          <input
            id="pad-volume"
            type="range" min={0} max={1} step={0.01}
            value={draft.volume}
            onChange={(e) => setDraft(d => ({ ...d, volume: Number(e.target.value) }))}
            className="w-full h-11 accent-blue-600 cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadRepeat}</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={MAX_REPEAT}
              value={draft.repeat === 0 ? '' : draft.repeat}
              disabled={draft.repeat === 0}
              onChange={(e) => setDraft(d => ({ ...d, repeat: Math.max(1, Math.min(MAX_REPEAT, Number(e.target.value) || 1)) }))}
              className="w-24 min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm font-bold disabled:opacity-40"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{draft.repeat === 1 ? t.soundpadRepeatOnce : t.soundpadRepeatTimes}</span>
            <button
              type="button"
              onClick={() => setDraft(d => ({ ...d, repeat: d.repeat === 0 ? 1 : 0 }))}
              aria-pressed={draft.repeat === 0}
              className={`ml-auto min-h-11 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${draft.repeat === 0 ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}
            >
              <InfinityIcon size={14} />
              {t.soundpadRepeatLoop}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadOverlay}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDraft(d => ({ ...d, overlay: true }))}
              aria-pressed={draft.overlay}
              className={`min-h-[68px] p-2 rounded-xl border-2 text-left transition-colors ${draft.overlay ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-zinc-200 dark:border-zinc-800'}`}
            >
              <Layers size={16} className={draft.overlay ? 'text-blue-600' : 'text-zinc-400'} />
              <p className="text-[10px] font-bold mt-1 leading-tight">{t.soundpadOverlayOn}</p>
            </button>
            <button
              type="button"
              onClick={() => setDraft(d => ({ ...d, overlay: false }))}
              aria-pressed={!draft.overlay}
              className={`min-h-[68px] p-2 rounded-xl border-2 text-left transition-colors ${!draft.overlay ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-zinc-200 dark:border-zinc-800'}`}
            >
              <Scissors size={16} className={!draft.overlay ? 'text-blue-600' : 'text-zinc-400'} />
              <p className="text-[10px] font-bold mt-1 leading-tight">{t.soundpadOverlayOff}</p>
            </button>
          </div>
        </div>

        {/* El fundido se expresa en SEGUNDOS: es como se piensa un apagado de
            ambiente, y en milisegundos nadie sabe si 2500 es mucho o poco. */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 flex justify-between" htmlFor="pad-fade">
            <span>{t.soundpadFade}</span>
            <span className="font-mono tabular-nums">
              {(draft.fadeOutMs / 1000).toFixed(2)} {t.soundpadSeconds}
            </span>
          </label>
          <input
            id="pad-fade"
            type="range" min={0} max={MAX_FADE_MS / 1000} step={0.05}
            value={draft.fadeOutMs / 1000}
            onChange={(e) => setDraft(d => ({ ...d, fadeOutMs: Math.round(Number(e.target.value) * 1000) }))}
            className="w-full h-11 accent-blue-600 cursor-pointer"
          />
          <p className="text-[10px] text-zinc-500 leading-relaxed">{t.soundpadFadeHint}</p>
        </div>

        {/* Recorte: sólo con el audio disponible en este dispositivo. */}
        {pad && !missing && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadTrim}</label>
            <TrimEditor
              buffer={buffer}
              trimStartMs={draft.trimStartMs}
              trimEndMs={draft.trimEndMs}
              onChange={(trim) => setDraft(d => ({ ...d, ...trim }))}
              onPreview={() => previewPad && onPreview(previewPad)}
              onStopPreview={() => previewPad && onStopPreview(previewPad)}
              previewing={previewing}
              t={t}
            />
            <p className="text-[10px] text-zinc-500 leading-relaxed">{t.soundpadTrimNote}</p>
          </div>
        )}

        {/* MIDI: sólo si el usuario ya activó el acceso desde el tablero. */}
        {midiService.enabled && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t.soundpadMidiNote}</label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 min-w-[90px]">
                {draft.midiNote === undefined ? t.soundpadMidiNone : midiNoteName(draft.midiNote)}
              </span>
              <button
                type="button"
                onClick={() => setLearning(v => !v)}
                aria-pressed={learning}
                className={`min-h-11 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${learning ? 'bg-blue-600 text-white animate-pulse' : 'bg-zinc-100 dark:bg-zinc-800'}`}
              >
                <Radio size={14} />
                {learning ? t.soundpadMidiLearning : t.soundpadMidiLearn}
              </button>
              {draft.midiNote !== undefined && (
                <button
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, midiNote: undefined }))}
                  aria-label={t.soundpadMidiClear}
                  className="min-h-11 min-w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {formError && (
          <p className="text-xs text-red-600 font-bold" role="alert">{formError}</p>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 pt-1">
          {previewPad && !missing && (
            <button
              type="button"
              onClick={() => (previewing ? onStopPreview(previewPad) : onPreview(previewPad))}
              className="min-h-11 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-2"
            >
              {previewing ? <Square size={14} /> : <Play size={14} />}
              {t.soundpadTest}
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex-1 min-h-11 px-4 rounded-xl bg-blue-600 text-white text-xs font-black disabled:opacity-50"
          >
            {t.save}
          </button>
        </div>

        {pad && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">{t.soundpadDeletePad}</p>
                <button
                  type="button"
                  onClick={async () => { await onDelete(pad); onClose(); }}
                  className="min-h-11 px-4 rounded-xl bg-red-600 text-white text-xs font-black"
                >
                  {t.delete}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-11 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold"
                >
                  {t.cancel}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-11 px-2 text-xs font-bold text-red-600 flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                {t.delete}
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};

export default SoundPadEditor;
