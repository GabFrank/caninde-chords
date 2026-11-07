// Contenedor de los Utilitarios: Soundpad (sonidos de la ceremonia) y Afinador.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, LayoutGrid } from 'lucide-react';
import { useViewport } from '../lib/useViewport';
import { GuitarTuner } from './GuitarTuner';
import { translations } from '../translations';
import { SoundpadBoard } from './SoundPad/SoundpadBoard';

interface UtilitariosHubProps {
  lang?: 'es' | 'en';
}

type SubTab = 'soundpad' | 'tuner';

export const UtilitariosHub: React.FC<UtilitariosHubProps> = ({ lang = 'es' }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('soundpad');
  // En teléfono apaisado el alto es el recurso escaso: el selector de
  // herramientas se comía 71px de los 390, y con eso no entraba ni una fila de
  // pads arriba de la barra de navegación.
  const { isShort } = useViewport();

  const t = translations[lang];

  const tabs: { id: SubTab; label: string; Icon: typeof Activity }[] = [
    { id: 'soundpad', label: t.soundpad, Icon: LayoutGrid },
    { id: 'tuner', label: t.tuner, Icon: Activity },
  ];

  return (
    <div id="utilitarios-hub-root" className={`w-full flex flex-col ${isShort ? 'space-y-1.5' : 'space-y-4'}`}>

      {/* Navegación entre herramientas */}
      <div className={`flex justify-center items-center ${isShort ? '' : 'py-2 border-b border-zinc-200 dark:border-zinc-800'}`}>
        <div className={`inline-flex max-w-full overflow-x-auto touch-scrolling items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 ${isShort ? 'p-0.5' : 'p-1'}`}>
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSubTab(id)}
              aria-current={activeSubTab === id ? 'page' : undefined}
              className={`px-4 ${isShort ? 'min-h-9' : 'min-h-11'} rounded-xl text-xs font-black font-sans flex items-center gap-2 transition-all ${activeSubTab === id ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
            >
              <Icon size={14} className={activeSubTab === id ? 'text-blue-600' : ''} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`w-full ${isShort ? '' : 'min-h-[480px]'}`}>
        <AnimatePresence mode="wait">
          {activeSubTab === 'soundpad' && (
            <motion.div
              key="soundpad-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.18 }}
            >
              <SoundpadBoard lang={lang} />
            </motion.div>
          )}

          {activeSubTab === 'tuner' && (
            <motion.div
              key="tuner-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.18 }}
            >
              <GuitarTuner />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};
export default UtilitariosHub;
