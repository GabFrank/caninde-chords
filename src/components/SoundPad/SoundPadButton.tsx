// El pad: el botón que se toca en vivo.
//
// Todo lo que se ve acá está pensado para un operador de pie, con poca luz y sin
// tiempo de leer: color e ícono para reconocerlo de un vistazo, insignias para
// saber si se superpone y cuántas veces suena, y un anillo de progreso para ver
// cuánto le queda sin tener que contar.

import React from 'react';
import { Star, Layers, Scissors, Repeat, Infinity as InfinityIcon, AlertTriangle, Settings2 } from 'lucide-react';
import { SoundPad } from '../../types';
import { padColor, padIcon } from '../../lib/soundpadStyles';
import { formatDuration } from '../../services/soundLibrary';

interface SoundPadButtonProps {
  pad: SoundPad;
  playing: boolean;
  /** 0 a 1; `null` cuando está en bucle indefinido o en reposo. */
  progress: number | null;
  missing: boolean;
  onTrigger: (pad: SoundPad) => void;
  onStop: (pad: SoundPad) => void;
  onEdit: (pad: SoundPad) => void;
  onToggleFavorite: (pad: SoundPad) => void;
  labels: {
    favorite: string;
    edit: string;
    missing: string;
    overlayOn: string;
    overlayOff: string;
    loop: string;
  };
}

export const SoundPadButton: React.FC<SoundPadButtonProps> = ({
  pad, playing, progress, missing, onTrigger, onStop, onEdit, onToggleFavorite, labels,
}) => {
  const color = padColor(pad.color);
  const Icon = padIcon(pad.icon);
  const loop = pad.repeat === 0;

  // Se dispara en pointerdown, no en click: en táctil el click llega recién al
  // levantar el dedo y ese retraso se nota cuando el sonido tiene que caer justo.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (playing && loop) onStop(pad);
    else onTrigger(pad);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onContextMenu={(e) => { e.preventDefault(); onEdit(pad); }}
        data-pad-id={pad.id}
        data-playing={playing ? 'true' : 'false'}
        aria-label={`${pad.name}${missing ? ` — ${labels.missing}` : ''}`}
        aria-pressed={playing}
        className={`w-full min-h-[88px] p-2.5 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 text-center transition-colors select-none touch-manipulation active:scale-[0.97] ${playing ? color.active : color.surface} ${missing ? 'opacity-60 border-dashed' : ''}`}
        style={{ touchAction: 'manipulation' }}
      >
        <Icon size={22} className="shrink-0" />
        <span className="text-[11px] font-black leading-tight line-clamp-2 break-words w-full">
          {pad.name}
        </span>

        <div className="flex items-center gap-1 text-[9px] font-bold opacity-70">
          {missing ? (
            <AlertTriangle size={10} />
          ) : (
            <>
              {pad.overlay
                ? <Layers size={10} aria-label={labels.overlayOn} />
                : <Scissors size={10} aria-label={labels.overlayOff} />}
              {loop
                ? <InfinityIcon size={10} aria-label={labels.loop} />
                : pad.repeat > 1 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Repeat size={10} />{pad.repeat}
                    </span>
                  )}
              <span>{formatDuration(pad.durationMs)}</span>
            </>
          )}
        </div>

        {/* Progreso: barra al pie del pad, visible desde lejos. */}
        {playing && (
          <div className="absolute left-2 right-2 bottom-1.5 h-1 rounded-full bg-black/20 overflow-hidden">
            <div
              className={`h-full bg-white/90 ${progress === null ? 'animate-pulse w-full' : 'transition-[width] duration-200 ease-linear'}`}
              style={progress === null ? undefined : { width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </button>

      {/* Favorito y ajustes, fuera del área de disparo para no dispararlo sin querer. */}
      <button
        type="button"
        onClick={() => onToggleFavorite(pad)}
        aria-label={labels.favorite}
        aria-pressed={pad.favorite}
        className="absolute -top-1.5 -left-1.5 h-7 w-7 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-center justify-center"
      >
        <Star size={12} className={pad.favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'} />
      </button>
      <button
        type="button"
        onClick={() => onEdit(pad)}
        aria-label={labels.edit}
        className="absolute -top-1.5 -right-1.5 h-7 w-7 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-center justify-center text-zinc-400 hover:text-blue-600"
      >
        <Settings2 size={12} />
      </button>
    </div>
  );
};

export default SoundPadButton;
