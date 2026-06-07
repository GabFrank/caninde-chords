// Utilities Modules (Módulos de Utilitarios) Main Hub Wrapper
// Integrates Module A (Tuner), Module B (Composition workshop) and Module C (Companion Manual)
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sliders, Activity, BookOpen, Music, Settings, Compass } from 'lucide-react';
import { GuitarTuner } from './GuitarTuner';
import { HarmonyComposer } from './HarmonyComposer';
import { HarmonyManual } from './HarmonyManual';

interface UtilitariosHubProps {
  onExportToSong?: (songTitle: string, songContent: string) => void;
  lang?: 'es' | 'en';
}

export const UtilitariosHub: React.FC<UtilitariosHubProps> = ({ onExportToSong, lang = 'es' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'tuner' | 'composer' | 'manual'>('composer'); // default composer as requested
  const [composerSeed, setComposerSeed] = useState<{ title: string; chords: string[] } | null>(null);

  const tr = (es: string, en: string) => (lang === 'en' ? en : es);

  // REQ-MAN-04: abrir una progresión del Manual en el Compositor
  const handleOpenInComposer = (chords: string[], title: string) => {
    setComposerSeed({ chords, title });
    setActiveSubTab('composer');
  };

  return (
    <div id="utilitarios-hub-root" className="w-full flex flex-col space-y-6">
      
      {/* Visual Navigation Subheader */}
      <div className="flex justify-center items-center py-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="inline-flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
          
          <button
            onClick={() => setActiveSubTab('composer')}
            className={`px-4 py-2 rounded-xl text-xs font-black font-sans flex items-center gap-2 transition-all ${activeSubTab === 'composer' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <Compass size={14} className={activeSubTab === 'composer' ? 'text-blue-600' : ''} />
            {tr('Yggdrasil Armónico (Taller)', 'Harmonic Workshop (Yggdrasil)')}
          </button>

          <button
            onClick={() => setActiveSubTab('tuner')}
            className={`px-4 py-2 rounded-xl text-xs font-black font-sans flex items-center gap-2 transition-all ${activeSubTab === 'tuner' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <Activity size={14} className={activeSubTab === 'tuner' ? 'text-blue-600 animate-pulse' : ''} />
            {tr('Afinador Interactivo', 'Interactive Tuner')}
          </button>

          <button
            onClick={() => setActiveSubTab('manual')}
            className={`px-4 py-2 rounded-xl text-xs font-black font-sans flex items-center gap-2 transition-all ${activeSubTab === 'manual' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <BookOpen size={14} className={activeSubTab === 'manual' ? 'text-blue-600' : ''} />
            {tr('Manual de Conexiones', 'Connections Manual')}
          </button>

        </div>
      </div>

      {/* Embedded Animation Shell of ACTIVE TAB */}
      <div className="w-full min-h-[480px]">
        <AnimatePresence mode="wait">
          {activeSubTab === 'composer' && (
            <motion.div
              key="composer-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.18 }}
            >
              <HarmonyComposer
                onExportToSong={onExportToSong}
                seed={composerSeed}
                onSeedConsumed={() => setComposerSeed(null)}
                lang={lang}
              />
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

          {activeSubTab === 'manual' && (
            <motion.div
              key="manual-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.18 }}
            >
              <HarmonyManual onOpenInComposer={handleOpenInComposer} lang={lang} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};
export default UtilitariosHub;
