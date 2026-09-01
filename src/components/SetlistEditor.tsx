import React, { useState } from 'react';
import { Song, Setlist } from '../types';
import { X, GripVertical, Plus, Search } from 'lucide-react';
import { motion, Reorder, AnimatePresence, useDragControls } from 'motion/react';
import { translations } from '../translations';
import { useAuth } from './AuthProvider';

interface SetlistEditorProps {
  initialSetlist?: Partial<Setlist>;
  availableSongs: Song[];
  onSave: (setlist: Partial<Setlist>) => void;
  onCancel: () => void;
}

const SetlistItem: React.FC<{ 
  id: string; 
  song: Song; 
  onRemove: (id: string) => void;
  t: any;
}> = ({ id, song, onRemove, t }) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item 
      value={id}
      dragListener={false}
      dragControls={dragControls}
      className="p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl flex items-center gap-4 shadow-sm group relative"
    >
      <div 
        onPointerDown={(e) => dragControls.start(e)}
        className="flex items-center justify-center w-12 h-12 bg-zinc-100 dark:bg-zinc-700 rounded-xl text-zinc-400 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={24} />
      </div>
      
      <div className="flex-1 truncate">
        <p className="font-bold truncate text-sm md:text-base">{song.title}</p>
        <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
      </div>

      <button 
        onClick={() => onRemove(id)} 
        className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
        title={t.delete}
      >
        <X size={20} />
      </button>
    </Reorder.Item>
  );
};

export const SetlistEditor: React.FC<SetlistEditorProps> = ({ initialSetlist, availableSongs, onSave, onCancel }) => {
  const { profile } = useAuth();
  const t = translations[profile?.language || 'en'];
  const [name, setName] = useState(initialSetlist?.name || '');
  const [songIds, setSongIds] = useState<string[]>(initialSetlist?.songIds || []);
  const [isAddingSongs, setIsAddingSongs] = useState(false);
  const [songSearch, setSongSearch] = useState('');

  const addSong = (id: string) => {
    if (!songIds.includes(id)) {
      setSongIds([...songIds, id]);
    }
  };

  const removeSong = (id: string) => {
    setSongIds(songIds.filter(sid => sid !== id));
  };

  const filteredAvailableSongs = availableSongs
    .filter(s => !songIds.includes(s.id))
    .filter(s => 
      s.title.toLowerCase().includes(songSearch.toLowerCase()) || 
      s.artist?.toLowerCase().includes(songSearch.toLowerCase())
    );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
        <h2 className="text-xl font-bold">{initialSetlist?.id ? t.edit : t.newSetlist}</h2>
        <div className="flex gap-2">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {t.cancel}
          </button>
          <button 
            onClick={() => onSave({ name, songIds })}
            disabled={!name || songIds.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {t.save}
          </button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-auto p-4 max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-500 mb-2">{t.name}</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            placeholder={t.name}
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium text-zinc-500">{t.songs} ({songIds.length})</label>
          <button 
            onClick={() => setIsAddingSongs(true)}
            className="flex items-center gap-2 text-sm font-bold text-blue-500 hover:text-blue-600 transition-colors"
          >
            <Plus size={18} />
            {t.addSongs}
          </button>
        </div>

        <Reorder.Group axis="y" values={songIds} onReorder={setSongIds} className="space-y-8 pb-24">
          {songIds.map((id) => {
            const song = availableSongs.find(s => s.id === id);
            if (!song) return null;
            return (
              <SetlistItem 
                key={id} 
                id={id} 
                song={song} 
                onRemove={removeSong} 
                t={t} 
              />
            );
          })}
        </Reorder.Group>

        {songIds.length === 0 && (
          <button 
            onClick={() => setIsAddingSongs(true)}
            className="w-full py-12 text-zinc-500 italic border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500 hover:text-blue-500 transition-all flex flex-col items-center gap-2"
          >
            <Plus size={32} className="opacity-20" />
            {t.noSongs}
          </button>
        )}
      </div>

      {/* Add Songs Modal */}
      <AnimatePresence>
        {isAddingSongs && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingSongs(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80dvh]"
            >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-lg">{t.addSongs}</h3>
                <button 
                  onClick={() => setIsAddingSongs(false)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input 
                    type="text" 
                    placeholder={t.search}
                    value={songSearch}
                    onChange={(e) => setSongSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto p-2 space-y-1">
                {filteredAvailableSongs.length > 0 ? (
                  filteredAvailableSongs.map(song => (
                    <button
                      key={song.id}
                      onClick={() => addSong(song.id)}
                      className="w-full p-3 rounded-xl text-left flex items-center justify-between group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                    >
                      <div className="flex-1 truncate">
                        <p className="font-bold truncate">{song.title}</p>
                        <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus size={18} />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-zinc-500 italic">
                    {songSearch ? t.noResults : t.noSongs}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};


