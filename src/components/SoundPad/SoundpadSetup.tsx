// Preparación del Soundpad: crear, editar, ordenar, categorías, pack y MIDI.
//
// Todo esto vivía en el tablero y lo dejaba inservible en vivo: en un teléfono
// quedaba un pad visible y el resto era configuración. Acá el operador prepara
// con calma antes del show; el tablero queda dedicado a disparar.
//
// Es una pantalla completa y no un panel encima: mientras se prepara no hace
// falta ver los pads, y un toque desviado sobre la grilla en medio de una
// ceremonia es justamente lo que se quiere evitar.

import React, { useRef, useState } from 'react';
import {
  Plus, Tags, ArrowUpDown, Download, Upload, Radio, HardDrive, Keyboard,
  ChevronLeft, Star, AlertTriangle, Settings2,
} from 'lucide-react';
import { SoundPad } from '../../types';
import { Strings } from '../../translations';
import { formatBytes, formatDuration } from '../../services/soundLibrary';
import { midiService, isMidiSupported } from '../../services/midi';
import { padColor, padIcon } from '../../lib/soundpadStyles';
import { useSoundpad } from './useSoundpad';
import { SoundPadEditor } from './SoundPadEditor';
import { CategoryManager } from './CategoryManager';
import { PadArranger } from './PadArranger';

interface SoundpadSetupProps {
  sp: ReturnType<typeof useSoundpad>;
  onClose: () => void;
  midiOn: boolean;
  onMidiOn: (on: boolean) => void;
  midiDevices: string[];
  t: Strings;
  lang: 'es' | 'en';
}

export const SoundpadSetup: React.FC<SoundpadSetupProps> = ({
  sp, onClose, midiOn, onMidiOn, midiDevices, t, lang,
}) => {
  const [editing, setEditing] = useState<{ open: boolean; pad: SoundPad | null }>({ open: false, pad: null });
  const [showCategories, setShowCategories] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [packBusy, setPackBusy] = useState<'export' | 'import' | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const packInput = useRef<HTMLInputElement>(null);

  const countByCategory: Record<string, number> = {};
  for (const pad of sp.pads) countByCategory[pad.categoryId] = (countByCategory[pad.categoryId] ?? 0) + 1;

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

  const enableMidi = async () => {
    setMidiError(null);
    const ok = await midiService.enable();
    if (!ok) { setMidiError(t.soundpadMidiDenied); return; }
    onMidiOn(true);
  };

  if (arranging) {
    return (
      <PadArranger
        pads={sp.pads}
        onSave={sp.reorderPads}
        onCancel={() => setArranging(false)}
        t={t}
      />
    );
  }

  return (
    <div className="w-full space-y-4">

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 pl-2 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-black flex items-center gap-1"
        >
          <ChevronLeft size={16} />
          {t.soundpadBackToBoard}
        </button>
        <h3 className="text-sm font-black text-zinc-500 truncate">{t.soundpadSetup}</h3>
      </div>

      {/* Los sonidos, uno por fila: acá el nombre completo se lee y el toque cae
          donde tiene que caer, en vez de pelearse con una grilla de disparo. */}
      <div className="space-y-1.5">
        {sp.pads.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center">{t.soundpadEmpty}</p>
        ) : sp.pads.map(pad => {
          const color = padColor(pad.color);
          const Icon = padIcon(pad.icon);
          const falta = sp.missingIds.has(pad.id);
          return (
            <div key={pad.id} data-setup-id={pad.id} className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50">
              <button
                type="button"
                onClick={() => sp.toggleFavorite(pad)}
                aria-label={`${t.soundpadFavorite}: ${pad.name}`}
                aria-pressed={pad.favorite}
                className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"
              >
                <Star size={16} className={pad.favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'} />
              </button>

              <span className={`h-9 w-9 shrink-0 rounded-xl border-2 flex items-center justify-center ${color.surface}`}>
                <Icon size={16} />
              </span>

              <button
                type="button"
                onClick={() => setEditing({ open: true, pad })}
                aria-label={`${t.edit}: ${pad.name}`}
                className="flex-1 min-w-0 text-left min-h-11 px-1"
              >
                <p className="font-bold truncate text-sm">{pad.name}</p>
                <p className="text-[10px] text-zinc-500 truncate flex items-center gap-1">
                  {falta && <AlertTriangle size={10} className="text-amber-500 shrink-0" />}
                  {falta ? t.soundpadMissing : formatDuration(pad.durationMs)}
                </p>
              </button>

              <span className="h-11 w-11 shrink-0 flex items-center justify-center text-zinc-400" aria-hidden="true">
                <Settings2 size={16} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setEditing({ open: true, pad: null })}
          className="min-h-11 px-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-1.5"
        >
          <Plus size={14} />
          {t.soundpadAdd}
        </button>
        <button
          type="button"
          onClick={() => setShowCategories(true)}
          className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1.5"
        >
          <Tags size={14} />
          {t.soundpadCategories}
        </button>
        <button
          type="button"
          onClick={() => setArranging(true)}
          disabled={sp.pads.length < 2}
          className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
        >
          <ArrowUpDown size={14} />
          {t.soundpadArrange}
        </button>
      </div>

      {sp.pads.length === 1 && (
        <p className="text-[10px] text-zinc-500">{t.soundpadArrangeEmpty}</p>
      )}

      {sp.error && (
        <p className="text-xs text-red-600 font-bold flex items-start gap-1.5" role="alert">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{sp.error}</span>
        </p>
      )}

      {/* Pack, MIDI y espacio: lo que se toca una vez cada tanto. */}
      <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
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
            className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download size={13} />
            {packBusy === 'export' ? t.soundpadExporting : t.soundpadExport}
          </button>
          <button
            type="button"
            onClick={() => packInput.current?.click()}
            disabled={packBusy !== null}
            className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload size={13} />
            {packBusy === 'import' ? t.soundpadImporting : t.soundpadImport}
          </button>
          {packNote && <span className="text-[10px] text-zinc-500">{packNote}</span>}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
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
                className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center gap-1.5"
              >
                <Radio size={13} />
                {t.soundpadMidiEnable}
              </button>
            )
          ) : (
            <span className="text-[10px] text-zinc-400">{t.soundpadMidiUnsupported}</span>
          )}
          {midiError && <span className="text-[10px] text-amber-600">{midiError}</span>}
        </div>

        <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
          <Keyboard size={11} />
          {t.soundpadShortcutsHint}
        </p>

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
        previewing={editing.pad ? sp.voices.some(v => v.padId === editing.pad!.id) : false}
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

export default SoundpadSetup;
