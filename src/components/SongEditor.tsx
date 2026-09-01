import React, { useState, useRef } from 'react';
import { Song } from '../types';
import { translations } from '../translations';
import { useAuth } from './AuthProvider';
import { Hash, Music, Plus, X } from 'lucide-react';

interface SongEditorProps {
  initialSong?: Partial<Song>;
  onSave: (song: Partial<Song>) => void;
  onCancel: () => void;
}

const scientificNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const solfegeNotes = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const chordVariants = ['', 'm', '7', 'maj7', 'm7', 'sus4', 'add9', 'dim', 'aug'];

export const SongEditor: React.FC<SongEditorProps> = ({ initialSong, onSave, onCancel }) => {
  const { profile } = useAuth();
  const t = translations[profile?.language || 'en'];
  const [title, setTitle] = useState(initialSong?.title || '');
  const [artist, setArtist] = useState(initialSong?.artist || '');
  const [key, setKey] = useState(initialSong?.key || '');
  const [tempo, setTempo] = useState(initialSong?.tempo || '');
  const [content, setContent] = useState(initialSong?.content || '');
  const [showCapoDialog, setShowCapoDialog] = useState(false);
  const [showChordDialog, setShowChordDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [selectedBaseNote, setSelectedBaseNote] = useState<string | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (text: string) => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    const newContent = content.substring(0, selectionStart) + text + content.substring(selectionEnd);
    setContent(newContent);
    
    // Focus back and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = selectionStart + text.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const notes = profile?.chordNotation === 'solfege' ? solfegeNotes : scientificNotes;
  const tags = [
    { label: t.intro, value: '[Intro]' },
    { label: t.chorus, value: '[Coro]' },
    { label: t.bridge, value: '[Puente]' },
    { label: t.solo, value: '[Solo]' },
    { label: t.outro, value: '[Final]' },
    { label: 'x2', value: '[x2]' },
    { label: 'x3', value: '[x3]' },
    { label: 'x4', value: '[x4]' },
    { label: t.columnBreak, value: '[Break]' },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
        <h2 className="text-xl font-bold">{initialSong?.id ? t.edit : t.newSong}</h2>
        <div className="flex gap-2">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {t.cancel}
          </button>
          <button 
            onClick={() => onSave({ title, artist, key, tempo, content })}
            disabled={!title || !content}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {t.save}
          </button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-500 mb-1">{t.title}</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder={t.title}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-zinc-500 mb-1">{t.artist}</label>
            <input 
              type="text" 
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder={t.artist}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-500 mb-1">Key</label>
              <input 
                type="text" 
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="e.g. G"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-500 mb-1">Tempo (BPM)</label>
              <input 
                type="text" 
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="e.g. 120"
              />
            </div>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-[12rem] relative">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-zinc-500">{t.content}</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowCapoDialog(true)}
                className="flex items-center gap-1 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all"
                title={t.capo}
              >
                <Hash size={14} />
                <span>{t.capo}</span>
              </button>
              <button 
                onClick={() => setShowChordDialog(true)}
                className="flex items-center gap-1 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all"
                title={t.chord}
              >
                <Music size={14} />
                <span>{t.chord}</span>
              </button>
              <button 
                onClick={() => setShowTagsDialog(true)}
                className="flex items-center gap-1 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-all"
                title={t.repeat}
              >
                <Plus size={14} />
                <span>Tags</span>
              </button>
            </div>
          </div>
          
          <textarea 
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono resize-none min-h-[14rem]"
            placeholder="[G] Amazing grace, how [C] sweet the [G] sound..."
          />

          {/* Tags Dialog */}
          {showTagsDialog && (
            <div className="fixed inset-0 z-50 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-xl">
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-2xl w-full max-w-xs border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">Tags</h3>
                  <button onClick={() => setShowTagsDialog(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {tags.map(tag => (
                    <button
                      key={tag.value}
                      onClick={() => {
                        insertAtCursor(tag.value);
                        setShowTagsDialog(false);
                      }}
                      className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white rounded-xl font-bold transition-all text-sm"
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Capo Dialog */}
          {showCapoDialog && (
            <div className="fixed inset-0 z-50 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-xl">
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-2xl w-full max-w-xs border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">{t.selectFret}</h3>
                  <button onClick={() => setShowCapoDialog(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(fret => (
                    <button
                      key={fret}
                      onClick={() => {
                        insertAtCursor(`[Capo ${fret}]`);
                        setShowCapoDialog(false);
                      }}
                      className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white rounded-xl font-bold transition-all"
                    >
                      {fret}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chord Dialog */}
          {showChordDialog && (
            <div className="fixed inset-0 z-50 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-xl">
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-2xl w-full max-w-md border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">{t.selectChord}</h3>
                  <button onClick={() => { setShowChordDialog(false); setSelectedBaseNote(null); }} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                    <X size={20} />
                  </button>
                </div>
                
                {!selectedBaseNote ? (
                  <div className="grid grid-cols-4 gap-2">
                    {notes.map(note => (
                      <button
                        key={note}
                        onClick={() => setSelectedBaseNote(note)}
                        className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white rounded-xl font-bold transition-all"
                      >
                        {note}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <button 
                        onClick={() => setSelectedBaseNote(null)}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-blue-600 font-bold text-sm"
                      >
                        ← {selectedBaseNote}
                      </button>
                      <span className="text-zinc-500 text-sm">{t.variants}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {chordVariants.map(variant => (
                        <button
                          key={variant}
                          onClick={() => {
                            insertAtCursor(`[${selectedBaseNote}${variant}]`);
                            setShowChordDialog(false);
                            setSelectedBaseNote(null);
                          }}
                          className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-600 hover:text-white rounded-xl font-bold transition-all"
                        >
                          {selectedBaseNote}{variant}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
