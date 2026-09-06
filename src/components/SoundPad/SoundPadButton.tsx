// El pad: el botón que se toca en vivo.
//
// Todo lo que se ve acá está pensado para un operador de pie, con poca luz y sin
// tiempo de leer: color e ícono para reconocerlo de un vistazo, insignias para
// saber si se superpone y cuántas veces suena, y un anillo de progreso para ver
// cuánto le queda sin tener que contar.

import React, { useRef } from 'react';
import { Star, Layers, Scissors, Repeat, Infinity as InfinityIcon, AlertTriangle, Settings2, Square } from 'lucide-react';
import { SoundPad } from '../../types';
import { padColor, padIcon } from '../../lib/soundpadStyles';
import { formatDuration } from '../../services/soundLibrary';

interface SoundPadButtonProps {
  pad: SoundPad;
  playing: boolean;
  /** 0 a 1; `null` cuando está en bucle indefinido o en reposo. */
  progress: number | null;
  missing: boolean;
  /** Devuelve el id de la voz, para poder retirarla si el gesto era un scroll. */
  onTrigger: (pad: SoundPad) => Promise<string | null> | void;
  onStop: (pad: SoundPad) => void;
  /** Corta un disparo accidental sin que llegue a oírse. */
  onRetract: (voiceId: string) => void;
  onEdit: (pad: SoundPad) => void;
  onToggleFavorite: (pad: SoundPad) => void;
  /** Pantalla de poco alto (teléfono apaisado): pad más bajo, sin insignias. */
  dense?: boolean;
  /** Tecla que lo dispara, si le tocó una de las diez primeras posiciones. */
  shortcut?: string | null;
  labels: {
    favorite: string;
    edit: string;
    missing: string;
    overlayOn: string;
    overlayOff: string;
    loop: string;
    stop: string;
  };
}

/** Cuánto puede moverse el dedo antes de que el gesto deje de ser un toque. */
const DRAG_PX = 10;

export const SoundPadButton: React.FC<SoundPadButtonProps> = ({
  pad, playing, progress, missing, onTrigger, onStop, onRetract, onEdit, onToggleFavorite, labels,
  dense = false, shortcut = null,
}) => {
  const color = padColor(pad.color);
  const Icon = padIcon(pad.icon);
  const loop = pad.repeat === 0;

  /** Disparo en curso: dónde empezó el dedo y qué voz nació de él. */
  const gesture = useRef<{ x: number; y: number; voiceId: string | null; retracted: boolean } | null>(null);

  /**
   * Se dispara en `pointerdown`, no en `click`: en táctil el click llega recién
   * al levantar el dedo y ese retraso se nota cuando el sonido tiene que caer
   * justo.
   *
   * El precio de eso es que un desplazamiento por la grilla empieza igual que un
   * toque, y disparaba un trueno cada vez que el operador buscaba un sonido. Por
   * eso el disparo se RETIRA en cuanto el gesto se revela como arrastre: si el
   * dedo se mueve más de DRAG_PX, o el navegador se queda con el gesto para
   * desplazar (`pointercancel`), la voz se corta de inmediato y no llega a oírse.
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (playing && loop) { onStop(pad); return; }

    gesture.current = { x: e.clientX, y: e.clientY, voiceId: null, retracted: false };
    const started = gesture.current;
    Promise.resolve(onTrigger(pad)).then(voiceId => {
      if (!voiceId) return;
      // El gesto pudo revelarse como arrastre mientras se decodificaba.
      if (started.retracted) onRetract(voiceId);
      else started.voiceId = voiceId;
    });
  };

  const cancelIfDragging = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.retracted) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_PX) return;
    g.retracted = true;
    if (g.voiceId) onRetract(g.voiceId);
  };

  const handlePointerCancel = () => {
    const g = gesture.current;
    if (!g || g.retracted) return;
    g.retracted = true;
    if (g.voiceId) onRetract(g.voiceId);
  };

  const endGesture = () => { gesture.current = null; };

  /**
   * Enter y Espacio producen un `click` sintético, nunca un `pointerdown`: sin
   * esto los pads eran inalcanzables con teclado, pedal Bluetooth o lector de
   * pantalla. `detail === 0` distingue ese click del que acompaña a un toque ya
   * atendido más arriba.
   */
  const handleClick = (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    if (playing && loop) onStop(pad);
    else onTrigger(pad);
  };

  return (
    <div className="relative">
      {/* `touchAction: 'pan-y'` deja que el navegador se quede con el
          desplazamiento vertical, que es justo lo que emite el `pointercancel`
          con el que se retira el sonido. Con `none` la grilla no se podría
          desplazar; con `manipulation` el navegador no avisaría del arrastre. */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={cancelIfDragging}
        onPointerCancel={handlePointerCancel}
        onPointerUp={endGesture}
        onPointerLeave={handlePointerCancel}
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); onEdit(pad); }}
        data-pad-id={pad.id}
        data-playing={playing ? 'true' : 'false'}
        aria-label={[
          pad.name,
          missing ? labels.missing : null,
          pad.overlay ? labels.overlayOn : labels.overlayOff,
          loop ? labels.loop : pad.repeat > 1 ? `${pad.repeat}×` : null,
        ].filter(Boolean).join(' — ')}
        aria-pressed={playing}
        className={`w-full ${dense ? 'min-h-[62px] pt-5 px-1.5 pb-1.5' : 'min-h-[88px] pt-6 px-2 pb-2.5'} rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-center transition-colors select-none active:scale-[0.97] ${playing ? color.active : color.surface} ${missing ? 'opacity-60 border-dashed' : ''}`}
        style={{ touchAction: 'pan-y' }}
      >
        <Icon size={dense ? 16 : 22} className="shrink-0" />
        {/* La tecla que lo dispara, abajo a la izquierda: en un tablero de
            veinte sonidos es la diferencia entre buscar y disparar. */}
        {shortcut && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-1.5 text-[9px] font-mono font-black opacity-40 tabular-nums"
          >
            {shortcut}
          </span>
        )}
        <span className="text-[11px] font-black leading-tight line-clamp-2 break-words w-full">
          {pad.name}
        </span>

        <div className={`items-center gap-1 text-[9px] font-bold opacity-70 ${dense ? 'hidden' : 'flex'}`}>
          {missing ? (
            <AlertTriangle size={10} />
          ) : (
            <>
              {/* Sin `aria-label`: el botón ya lleva el suyo y su subárbol no se
                  expone, así que estas etiquetas eran inertes. Lo que cuentan
                  estos íconos va en el nombre accesible del botón. */}
              {pad.overlay ? <Layers size={10} /> : <Scissors size={10} />}
              {loop
                ? <InfinityIcon size={10} />
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

      {/* Favorito y ajustes van DENTRO de las esquinas del pad, no sobresaliendo:
          con 10px de canalón, dos controles que sobresalen 8px se solapan con los
          del pad vecino y el operador marca un favorito cuando quería disparar.
          Miden 36px, que es el área táctil mínima razonable. */}
      <button
        type="button"
        onClick={() => onToggleFavorite(pad)}
        aria-label={labels.favorite}
        aria-pressed={pad.favorite}
        className="absolute top-0.5 left-0.5 h-9 w-9 rounded-full flex items-center justify-center"
      >
        <Star size={13} className={pad.favorite ? 'fill-amber-400 text-amber-400' : 'text-current opacity-45'} />
      </button>
      {/* Mientras suena, el mismo sitio es "parar este sonido": un ambiente largo
          de una sola pasada no se puede cortar volviendo a tocar el pad (se
          superpondría consigo mismo si es de overlay), y buscar su ficha en la
          franja de arriba es demasiado lento en vivo. Editar puede esperar. */}
      <button
        type="button"
        onClick={() => (playing ? onStop(pad) : onEdit(pad))}
        aria-label={playing ? labels.stop : labels.edit}
        className={`absolute top-0.5 right-0.5 h-9 w-9 rounded-full flex items-center justify-center ${playing ? 'text-red-100' : 'text-current opacity-45 hover:opacity-100'}`}
      >
        {playing ? <Square size={13} className="fill-current" /> : <Settings2 size={13} />}
      </button>
    </div>
  );
};

export default SoundPadButton;
