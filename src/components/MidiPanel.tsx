// El panel del pedal: elegir la salida MIDI, el canal, y probar un preset.
//
// Vive en Utilitarios junto al Soundpad y el Afinador porque es configuración de
// equipo, no de la biblioteca: qué hay enchufado a ESTA máquina.
//
// El probador no es un adorno. Las tablas de Program Change de los fabricantes
// suelen estar corridas en uno respecto de lo que el aparato espera —en el
// Hologram Microcosm hay reportes de que hay que mandar 22 para cargar lo que el
// manual llama 23—, así que el número correcto se averigua de pie frente al
// pedal, una vez, y no se adivina.

import React, { useEffect, useState } from 'react';
import { Radio, Send, AlertTriangle, Check, Cable } from 'lucide-react';
import { Strings } from '../translations';
import { midiService, isMidiSupported, MidiOutputInfo, SendResult } from '../services/midi';
import {
  MIN_CHANNEL, MAX_CHANNEL, MIN_PROGRAM, MAX_PROGRAM, parseProgramInput,
} from '../lib/midiProgram';
import { readPrefs, writePrefs, MidiOutputPrefs } from '../lib/midiOutputPrefs';

interface MidiPanelProps {
  t: Strings;
}

export const MidiPanel: React.FC<MidiPanelProps> = ({ t }) => {
  const [prefs, setPrefs] = useState<MidiOutputPrefs>(() => readPrefs());
  const [enabled, setEnabled] = useState(midiService.enabled);
  const [outputs, setOutputs] = useState<MidiOutputInfo[]>([]);
  const [denied, setDenied] = useState(false);
  const [testText, setTestText] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // El servicio es un singleton: puede estar ya habilitado por el Soundpad.
  useEffect(() => {
    if (!enabled) return;
    midiService.selectOutput(prefs.outputId);
    return midiService.subscribeOutputs(setOutputs);
  }, [enabled, prefs.outputId]);

  const guardar = (cambios: Partial<MidiOutputPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...cambios };
      writePrefs(next);
      midiService.selectOutput(next.outputId);
      return next;
    });
  };

  const habilitar = async () => {
    setDenied(false);
    const ok = await midiService.enable();
    if (!ok) { setDenied(true); return; }
    setEnabled(true);
  };

  const explicar = (r: SendResult): { ok: boolean; text: string } => {
    if (r.ok === true) return { ok: true, text: t.midiOutSent };
    switch (r.reason) {
      case 'sin-permiso': return { ok: false, text: t.midiOutFailNoPermission };
      case 'sin-dispositivo': return { ok: false, text: t.midiOutFailNoDevice };
      case 'rango': return { ok: false, text: t.midiOutFailRange };
      default: return { ok: false, text: `${t.midiOutFailError} ${r.detail ?? ''}`.trim() };
    }
  };

  const probar = () => {
    const programa = parseProgramInput(testText);
    if (programa === null || programa === undefined) {
      setNote({ ok: false, text: t.midiOutFailRange });
      return;
    }
    setNote(explicar(midiService.sendProgramChange(programa, prefs.channel)));
  };

  if (!isMidiSupported()) {
    return (
      <div className="w-full max-w-xl mx-auto space-y-2">
        <h3 className="text-sm font-black flex items-center gap-2"><Cable size={16} />{t.midiOut}</h3>
        <p className="text-xs text-zinc-500">{t.soundpadMidiUnsupported}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-black flex items-center gap-2"><Cable size={16} />{t.midiOut}</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">{t.midiOutIntro}</p>
      </div>

      {!enabled ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={habilitar}
            className="min-h-11 px-4 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center gap-2"
          >
            <Radio size={14} />
            {t.soundpadMidiEnable}
          </button>
          {denied && <p className="text-[11px] text-amber-600">{t.soundpadMidiDenied}</p>}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400" htmlFor="midi-out-device">
              {t.midiOutDevice}
            </label>
            {outputs.length === 0 ? (
              <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                <AlertTriangle size={12} />{t.midiOutNoDevice}
              </p>
            ) : (
              <select
                id="midi-out-device"
                value={prefs.outputId ?? ''}
                onChange={(e) => guardar({ outputId: e.target.value || null, autoSend: e.target.value ? prefs.autoSend : false })}
                className="w-full min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm"
              >
                <option value="">{t.midiOutPick}</option>
                {outputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400" htmlFor="midi-out-channel">
              {t.midiOutChannel}
            </label>
            <select
              id="midi-out-channel"
              value={prefs.channel}
              onChange={(e) => guardar({ channel: Number(e.target.value) })}
              className="w-full min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm"
            >
              {Array.from({ length: MAX_CHANNEL - MIN_CHANNEL + 1 }, (_, i) => i + MIN_CHANNEL)
                .map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2.5 min-h-11 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.autoSend}
              disabled={prefs.outputId === null}
              onChange={(e) => guardar({ autoSend: e.target.checked })}
              className="h-5 w-5 accent-blue-600 disabled:opacity-40"
            />
            <span className="text-xs font-bold">{t.midiOutAuto}</span>
          </label>

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400" htmlFor="midi-out-test">
              {t.midiOutTestLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="midi-out-test"
                type="number"
                inputMode="numeric"
                min={MIN_PROGRAM}
                max={MAX_PROGRAM}
                value={testText}
                onChange={(e) => { setTestText(e.target.value); setNote(null); }}
                placeholder={`${MIN_PROGRAM}–${MAX_PROGRAM}`}
                className="w-28 min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm font-mono"
              />
              <button
                type="button"
                onClick={probar}
                className="min-h-11 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-black flex items-center gap-2"
              >
                <Send size={14} />
                {t.midiOutTest}
              </button>
              {note && (
                <span className={`text-[11px] font-bold flex items-center gap-1 ${note.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {note.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                  {note.text}
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">{t.midiOutHint}</p>
          </div>
        </>
      )}
    </div>
  );
};

export default MidiPanel;
