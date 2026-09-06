// Recortador no destructivo: elegir qué parte del archivo suena.
//
// El archivo NO se toca. Se marcan dos puntos y el motor arranca en el primero y
// corta en el segundo; se puede mover el recorte cuantas veces haga falta, o
// quitarlo, sin haber perdido nada del original — que además es el mismo archivo
// que viaja en el pack.
//
// La forma de onda es sólo para ver dónde está el sonido. Las marcas se mueven
// con dos deslizadores y no arrastrando sobre el dibujo: en una tablet, de pie,
// un deslizador se acierta y un asa de cuatro píxeles no.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Scissors } from 'lucide-react';
import { Strings } from '../../translations';
import { computePeaks } from '../../lib/waveform';
import { resolveTrim, hasTrim, MIN_TRIM_SEC } from '../../lib/padTrim';

interface TrimEditorProps {
  /** El audio ya decodificado; `null` mientras se decodifica o si falta. */
  buffer: AudioBuffer | null;
  trimStartMs?: number;
  trimEndMs?: number;
  onChange: (trim: { trimStartMs?: number; trimEndMs?: number }) => void;
  /** Reproduce la ventana marcada, para oír el recorte antes de guardarlo. */
  onPreview: () => void;
  onStopPreview: () => void;
  previewing: boolean;
  t: Strings;
}

const BINS = 220;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export const TrimEditor: React.FC<TrimEditorProps> = ({
  buffer, trimStartMs, trimEndMs, onChange, onPreview, onStopPreview, previewing, t,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  const total = buffer?.duration ?? 0;
  const startSec = Math.min(total, Math.max(0, (trimStartMs ?? 0) / 1000));
  const endSec = Math.min(total, Math.max(0, (trimEndMs ?? total * 1000) / 1000));
  const recortado = hasTrim(total, trimStartMs, trimEndMs);
  const ventana = resolveTrim(total, trimStartMs, trimEndMs);

  const peaks = useMemo(
    () => (buffer ? computePeaks(buffer.getChannelData(0), BINS) : []),
    [buffer],
  );

  // El canvas se redibuja al cambiar el ancho disponible: sin esto, girar la
  // tablet deja la onda estirada.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const medir = () => setWidth(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [buffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0 || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const h = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, h);

    const mid = h / 2;
    const desde = total > 0 ? (startSec / total) * width : 0;
    const hasta = total > 0 ? (endSec / total) * width : width;

    peaks.forEach((p, i) => {
      const x = (i / peaks.length) * width;
      const alto = Math.max(1, p * (h - 4));
      // Lo que queda fuera del recorte se ve, apagado: hay que poder ver qué se
      // está dejando afuera para saber si la marca está bien puesta.
      const dentro = x >= desde && x <= hasta;
      g.fillStyle = dentro ? '#2563eb' : 'rgba(113,113,122,0.35)';
      g.fillRect(x, mid - alto / 2, Math.max(1, width / peaks.length - 0.5), alto);
    });
  }, [peaks, width, startSec, endSec, total]);

  if (!buffer) {
    return (
      <p className="text-[10px] text-zinc-500" role="status">{t.soundpadLoadingAudio}</p>
    );
  }

  const setStart = (sec: number) => {
    const s = Math.min(sec, endSec - MIN_TRIM_SEC);
    onChange({ trimStartMs: Math.max(0, s) * 1000, trimEndMs: trimEndMs });
  };
  const setEnd = (sec: number) => {
    const e = Math.max(sec, startSec + MIN_TRIM_SEC);
    onChange({ trimStartMs: trimStartMs, trimEndMs: Math.min(total, e) * 1000 });
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800"
        aria-label={t.soundpadTrimWave}
        role="img"
      />

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 flex justify-between" htmlFor="trim-start">
          <span>{t.soundpadTrimStart}</span>
          <span className="font-mono tabular-nums">{fmt(startSec)}</span>
        </label>
        <input
          id="trim-start"
          type="range" min={0} max={total} step={0.01}
          value={startSec}
          onChange={(e) => setStart(Number(e.target.value))}
          className="w-full h-11 accent-blue-600 cursor-pointer"
        />

        <label className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 flex justify-between" htmlFor="trim-end">
          <span>{t.soundpadTrimEnd}</span>
          <span className="font-mono tabular-nums">{fmt(endSec)}</span>
        </label>
        <input
          id="trim-end"
          type="range" min={0} max={total} step={0.01}
          value={endSec}
          onChange={(e) => setEnd(Number(e.target.value))}
          className="w-full h-11 accent-blue-600 cursor-pointer"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => (previewing ? onStopPreview() : onPreview())}
          className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1.5"
        >
          {previewing ? <Square size={14} /> : <Play size={14} />}
          {t.soundpadTrimPreview}
        </button>

        {recortado && (
          <button
            type="button"
            onClick={() => onChange({ trimStartMs: undefined, trimEndMs: undefined })}
            className="min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"
          >
            <RotateCcw size={14} />
            {t.soundpadTrimReset}
          </button>
        )}

        <span className="text-[10px] text-zinc-500 flex items-center gap-1 ml-auto">
          <Scissors size={11} />
          {fmt(ventana.durationSec)} / {fmt(total)}
        </span>
      </div>
    </div>
  );
};

export default TrimEditor;
