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
}

export const UtilitariosHub: React.FC<UtilitariosHubProps> = ({ onExportToSong }) => {
  const [activeSubTab, setActiveSubTab] = useState<'tuner' | 'composer' | 'manual'>('composer'); // default composer as requested

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
            Yggdrasil Armónico (Taller)
          </button>

          <button
            onClick={() => setActiveSubTab('tuner')}
            className={`px-4 py-2 rounded-xl text-xs font-black font-sans flex items-center gap-2 transition-all ${activeSubTab === 'tuner' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <Activity size={14} className={activeSubTab === 'tuner' ? 'text-blue-600 animate-pulse' : ''} />
            Afinador Interactivo
          </button>

          <button
            onClick={() => setActiveSubTab('manual')}
            className={`px-4 py-2 rounded-xl text-xs font-black font-sans flex items-center gap-2 transition-all ${activeSubTab === 'manual' ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
          >
            <BookOpen size={14} className={activeSubTab === 'manual' ? 'text-blue-600' : ''} />
            Manual de Conexiones
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
              <HarmonyComposer onExportToSong={onExportToSong} />
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
              <HarmonyManual />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};
export default UtilitariosHub;
