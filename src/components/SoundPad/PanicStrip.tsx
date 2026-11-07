// La franja de pánico: la salida de emergencia de las pantallas que no son el
// tablero.
//
// Por qué existe: al mover la configuración a su propia pantalla, el operador se
// quedó sin forma de cortar un sonido CON EL DEDO. La tecla Escape sigue
// funcionando, pero el aparato de esta app es un teléfono o una tablet, donde no
// hay Escape; y el MIDI queda inerte a propósito mientras se prepara. En una
// auditoría se midió el camino real de pánico desde el editor abierto: tres
// toques (Cerrar → Tablero → PARAR TODO), y ni una señal en pantalla de que
// había un ambiente en bucle sonando.
//
// Va pegajosa arriba y con alto fijo. Pegajosa porque con la lista desplazada el
// botón de volver se iba de pantalla —la misma lección que `PadArranger` ya
// había aprendido—; de alto fijo porque si apareciera al empezar a sonar
// correría la lista justo debajo del dedo (gotcha 6).

import React from 'react';
import { ChevronLeft, Square, X } from 'lucide-react';
import { ActiveVoice } from '../../services/soundpadEngine';
import { Strings } from '../../translations';

interface PanicStripProps {
  voices: ActiveVoice[];
  onStopAll: () => void;
  onStopVoice: (voiceId: string) => void;
  /** Vuelta al tablero. Se omite donde la pantalla tiene su propia salida. */
  onBack?: () => void;
  t: Strings;
}

export const PanicStrip: React.FC<PanicStripProps> = ({
  voices, onStopAll, onStopVoice, onBack, t,
}) => (
  <div className="h-12 flex items-center gap-1.5 shrink-0">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 pl-2 pr-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-black flex items-center gap-1 shrink-0"
      >
        <ChevronLeft size={16} />
        {t.soundpadBackToBoard}
      </button>
    )}

    {/* Mismo color, mismo texto y misma posición relativa que en el tablero: es
        el reflejo entrenado del operador y no puede cambiar de pantalla a
        pantalla. Deshabilitado en silencio, como allá. */}
    <button
      type="button"
      onClick={onStopAll}
      disabled={voices.length === 0}
      className="min-h-11 px-3 rounded-xl bg-red-600 text-white text-[11px] font-black flex items-center gap-1.5 shrink-0 disabled:opacity-40 transition-opacity"
    >
      <Square size={13} className="fill-current" />
      {t.soundpadPanic}
    </button>

    {/* Qué está sonando. Sin esto la pantalla no admitía que hubiera algo
        sonando: el "Probar" del editor dejaba un bucle suelto y mudo. */}
    <div className="flex-1 min-w-0 h-full flex items-center gap-1.5 overflow-x-auto touch-scrolling">
      {voices.map(voice => (
        <button
          key={voice.voiceId}
          type="button"
          onClick={() => onStopVoice(voice.voiceId)}
          data-voice-id={voice.voiceId}
          aria-label={`${t.soundpadStopVoice}: ${voice.padName}`}
          className="shrink-0 min-h-11 pl-2.5 pr-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-[11px] font-bold flex items-center gap-1.5"
        >
          {voice.padName}
          <X size={12} className="text-zinc-400" />
        </button>
      ))}
    </div>
  </div>
);

export default PanicStrip;
