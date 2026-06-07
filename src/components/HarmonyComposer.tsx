// Harmonic Composition Workshop - Módulo B
// REQ-CMP-01 to REQ-CMP-09: Composition timeline, step-by-step assistant, phases and emotions.

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, Plus, Trash2, Copy, Sparkles, AlertCircle, Compass, HelpCircle, ArrowUpRight, ArrowDownRight, RefreshCw, Save, FileSpreadsheet, Eye, Music, Edit2, Volume2, ArrowLeft, ArrowRight, ChevronDown, Check } from 'lucide-react';
import { PitchClass, Quality, Chord, Tool, Slot, Composition, getCandidates, computePhase, analyzeGesture, getChordString, getPitchClassName, SongExportAdapter, mod12, parsePitchClass } from '../lib/harmonyEngine';
import { audioEngine, getVoicingForChord } from '../services/audioEngine';
import { db, auth } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from 'firebase/firestore';

// Appendix D - Emotion colors and symbols mapping
export interface EmotionSchema {
  id: string;
  name: string;
  color: string;
  emoji: string;
}

export const EMOTIONS: Record<string, EmotionSchema> = {
  luminoso: { id: 'luminoso', name: 'Luminoso / Alegre', color: 'from-amber-400 to-yellow-500 text-amber-950', emoji: '☀️' },
  melancolico: { id: 'melancolico', name: 'Melancólico', color: 'from-blue-400 to-indigo-500 text-blue-950', emoji: '🌙' },
  ingravidez: { id: 'ingravidez', name: 'Ingravidez / Flotar', color: 'from-green-400 to-emerald-500 text-green-950', emoji: '🎈' },
  tension: { id: 'tension', name: 'Tensión / Suspenso', color: 'from-purple-500 to-violet-600 text-purple-950', emoji: '⚡' },
  aire: { id: 'aire', name: 'Apertura / Aire', color: 'from-sky-400 to-teal-500 text-sky-950', emoji: '💨' },
  empuje: { id: 'empuje', name: 'Empuje / Dominante', color: 'from-orange-500 to-amber-600 text-orange-950', emoji: '🚀' },
  nostalgia: { id: 'nostalgia', name: 'Nostalgioso / Suspiro', color: 'from-pink-400 to-rose-500 text-pink-950', emoji: '🌸' },
  asombro: { id: 'asombro', name: 'Asombro / Revelación', color: 'from-fuchsia-400 to-purple-600 text-fuchsia-950', emoji: '✨' },
  profundidad: { id: 'profundidad', name: 'Profundidad / Mágico', color: 'from-indigo-500 to-violet-700 text-indigo-950', emoji: '🌊' },
  suspenso: { id: 'suspenso', name: 'Suspenso / Pregunta', color: 'from-slate-400 to-zinc-600 text-slate-950', emoji: '❓' },
  serenidad: { id: 'serenidad', name: 'Serenidad / Calma', color: 'from-teal-400 to-emerald-500 text-teal-950', emoji: '🍃' },
  hipnotico: { id: 'hipnotico', name: 'Hipnótico / Drone', color: 'from-cyan-400 to-blue-500 text-cyan-950', emoji: '🌀' },
  misterio: { id: 'misterio', name: 'Misterio / Sombra', color: 'from-violet-500 to-purple-700 text-violet-950', emoji: '🔮' }
};

interface ToolInfo {
  id: Tool;
  name: string;
  desc: string;
  emotions: string[];
  astralRange: string;
}

const TOOLS_INFO: ToolInfo[] = [
  { id: 'diatonic', name: 'Escalera Diatónica', desc: 'Acordes naturales de la tonalidad actual.', emotions: ['luminoso', 'serenidad'], astralRange: '1' },
  { id: 'augmentedPortal', name: 'Portal Aumentado', desc: 'La simetría del acorde aumentado abre puertas a mundos de ensueño.', emotions: ['ingravidez', 'asombro'], astralRange: '3-4' },
  { id: 'diminishedBridge', name: 'Puente Disminuido', desc: 'Tensión cromática pasajera para resolver con fuerza.', emotions: ['tension', 'suspenso'], astralRange: '3' },
  { id: 'chromaticMediant', name: 'Mediantes Cromáticas', desc: 'Movimientos a terceras que cambian el color de golpe.', emotions: ['asombro', 'profundidad', 'nostalgia'], astralRange: '3' },
  { id: 'modalColor', name: 'Color Modal', desc: 'Notas flotantes y drones vamps para un viaje místico.', emotions: ['hipnotico', 'aire'], astralRange: '0-1' },
  { id: 'free', name: 'Libre (Cualquiera)', desc: 'Exploración abierta sin reglas asignadas.', emotions: ['libre'], astralRange: '0-4' }
];

interface HarmonyComposerProps {
  onExportToSong?: (songTitle: string, songContent: string) => void;
}

export const HarmonyComposer: React.FC<HarmonyComposerProps> = ({ onExportToSong }) => {
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [activePlaySlotIdx, setActivePlaySlotIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Editor states
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [selectedTool, setSelectedTool] = useState<Tool>('diatonic');
  
  // Custom dialog flags
  const [editSlotIdx, setEditSlotIdx] = useState<number | null>(null);
  const [tempLyric, setTempLyric] = useState('');
  const [editKeyModal, setEditKeyModal] = useState(false);

  const playTimerRef = useRef<number | null>(null);
  const playIdxRef = useRef<number>(0);

  // Synced User ID
  const userId = auth.currentUser?.uid || 'anonymous';

  // Derived current composition
  const currentComp = compositions.find(c => c.id === selectedCompId) || null;

  useEffect(() => {
    // Sync with Firestore Compositions store
    const qComps = query(collection(db, 'compositions'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(qComps, (snap) => {
      const fetched: Composition[] = [];
      snap.forEach(d => {
        fetched.push({ id: d.id, ...d.data() } as any);
      });
      setCompositions(fetched);
      
      // Select first composition if none chosen yet or previous selected was deleted
      setSelectedCompId(prevId => {
        if (!prevId && fetched.length > 0) {
          return fetched[0].id;
        }
        if (prevId && !fetched.some(c => c.id === prevId) && fetched.length > 0) {
          return fetched[0].id;
        }
        return prevId;
      });
    });

    return () => {
      unsubscribe();
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [userId]);

  // Create empty default composition
  const handleAddNewComposition = async () => {
    const defaultComp: Omit<Composition, 'id'> = {
      title: 'Composición Astral #' + (compositions.length + 1),
      key: { tonic: 4, mode: 'major' }, // E Major standard
      tempo: { bpm: 80, timeSignature: [4, 4] },
      defaultArticulation: 'strum',
      rhythmPatternId: 'balada',
      instrument: 'guitar',
      slots: [],
      meta: {
        createdWith: 'CanindeSong/Utilitarios',
        specVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    try {
      const docRef = await addDoc(collection(db, 'compositions'), {
        ...defaultComp,
        userId
      });
      setSelectedCompId(docRef.id);
    } catch (e) {
      console.error('Error saving new composition', e);
    }
  };

  const handleSaveComposition = async (compToSave: Composition) => {
    if (!compToSave.id) return;
    try {
      const { id, ...data } = compToSave;
      // Send `meta` as a single object: updating both `meta` and `meta.updatedAt`
      // in the same call is a Firestore field-path conflict and throws.
      await updateDoc(doc(db, 'compositions', id), {
        ...data,
        meta: { ...data.meta, updatedAt: new Date().toISOString() }
      });
    } catch (e) {
      console.error('Error saving composition', e);
    }
  };

  const updateCurrentComp = (updates: Partial<Composition>) => {
    if (!currentComp) return;
    const updated = { ...currentComp, ...updates };
    setCompositions(prev => prev.map(c => c.id === currentComp.id ? { ...c, ...updates } : c));
    handleSaveComposition(updated);
  };

  // 10. Compute phase and coverage indicators
  const phaseInfo = currentComp ? computePhase(currentComp.slots) : null;

  // Wizard flow: ADD chord
  const openAddChordFlow = () => {
    if (currentComp && currentComp.slots.length === 0) {
      // First chord is freely chosen from Diatonic ladder as defaults
      const firstChord: Chord = { root: currentComp.key.tonic, quality: currentComp.key.mode === 'minor' ? 'minor' : 'major' };
      const newSlot: Slot = {
        id: 'slot_' + Date.now(),
        chord: firstChord,
        durationBeats: 4,
        toolUsed: 'free',
        gesture: 'Punto de partida',
        emotion: 'libre',
        astralLevel: 1,
        voicing: getVoicingForChord(firstChord)
      };
      updateCurrentComp({ slots: [newSlot] });
      // Play note
      audioEngine.init();
      audioEngine.pluckNote(40 + firstChord.root, 0, 0.9);
    } else {
      setSelectedTool('diatonic');
      setWizardStep(1);
      setIsWizardOpen(true);
    }
  };

  const handleSelectTool = (tool: Tool) => {
    setSelectedTool(tool);
    setWizardStep(2);
  };

  // Fetch candidate options corresponding to selected tool & current tail chord
  const getWizardCandidates = () => {
    if (!currentComp || currentComp.slots.length === 0) return [];
    const lastSlot = currentComp.slots[currentComp.slots.length - 1];
    return getCandidates(selectedTool, lastSlot.chord, currentComp.key);
  };

  // Append slot dynamically on candidate pick
  const handleSelectCandidate = (cand: any) => {
    if (!currentComp) return;
    const newSlot: Slot = {
      id: 'slot_' + Date.now() + '_' + currentComp.slots.length,
      chord: cand.chord,
      durationBeats: 4,
      toolUsed: cand.tool,
      gesture: cand.gesture,
      emotion: cand.emotion,
      astralLevel: cand.astralLevel,
      voicing: getVoicingForChord(cand.chord)
    };

    const nextSlots = [...currentComp.slots, newSlot];
    updateCurrentComp({ slots: nextSlots });
    setIsWizardOpen(false);

    // Play physical transition swipe
    audioEngine.init();
    audioEngine.scheduleChord(newSlot.voicing || getVoicingForChord(newSlot.chord), 0, {
      articulation: currentComp.defaultArticulation
    });
  };

  // Preview candidate note directly in the wizard (REQ-CMP-04)
  const handlePreviewCandidate = (cand: any, e: React.MouseEvent) => {
    e.stopPropagation();
    audioEngine.init();
    audioEngine.scheduleChord(getVoicingForChord(cand.chord), 0, {
      articulation: currentComp?.defaultArticulation || 'strum'
    });
  };

  // Slot manipulations inside the timeline (REQ-CMP-06)
  const handleDeleteSlot = (idx: number) => {
    if (!currentComp) return;
    const nextSlots = currentComp.slots.filter((_, i) => i !== idx);
    // Recalculate emotional gestures starting from the deleted index
    recalculateAllSlotsGestures(nextSlots);
  };

  const handleDuplicateSlot = (idx: number) => {
    if (!currentComp) return;
    const target = currentComp.slots[idx];
    const dupe: Slot = {
      ...target,
      id: 'slot_dupe_' + Date.now() + '_' + idx
    };
    const nextSlots = [...currentComp.slots];
    nextSlots.splice(idx + 1, 0, dupe);
    recalculateAllSlotsGestures(nextSlots);
  };

  const moveSlot = (idx: number, dir: 'left' | 'right') => {
    if (!currentComp) return;
    const nextSlots = [...currentComp.slots];
    const targetIdx = dir === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= nextSlots.length) return;
    
    // Swap positions
    const temp = nextSlots[idx];
    nextSlots[idx] = nextSlots[targetIdx];
    nextSlots[targetIdx] = temp;

    recalculateAllSlotsGestures(nextSlots);
  };

  const recalculateAllSlotsGestures = (slotsList: Slot[]) => {
    if (!currentComp) return;
    let prev: Chord | null = null;
    const recalculated = slotsList.map((slot, i) => {
      if (i === 0) {
        slot.gesture = 'Punto de partida';
        slot.emotion = 'libre';
        slot.astralLevel = 1;
      } else if (prev) {
        const gestureResult = analyzeGesture(prev, slot.chord, currentComp.key);
        slot.gesture = gestureResult.gesture;
        slot.emotion = gestureResult.emotion;
        slot.astralLevel = gestureResult.astral;
      }
      prev = slot.chord;
      return slot;
    });

    updateCurrentComp({ slots: recalculated });
  };

  const handleSaveLyrics = () => {
    if (editSlotIdx === null || !currentComp) return;
    const nextSlots = [...currentComp.slots];
    nextSlots[editSlotIdx].lyric = tempLyric;
    updateCurrentComp({ slots: nextSlots });
    setEditSlotIdx(null);
  };

  // Timeline playback scheduler (REQ-CMP-07)
  const handlePlayComposition = () => {
    if (!currentComp || currentComp.slots.length === 0) return;
    audioEngine.init();
    audioEngine.stopAll();

    if (isPlaying) {
      handleStopComposition();
      return;
    }

    setIsPlaying(true);
    playIdxRef.current = 0;
    setActivePlaySlotIdx(0);
    
    // Beat timings calculations
    const bpm = currentComp.tempo.bpm;
    const msPerBeat = (60 / bpm) * 1000;

    const playNext = () => {
      const idx = playIdxRef.current;
      if (!currentComp || idx >= currentComp.slots.length) {
        // Complete or Loop
        handleStopComposition();
        return;
      }

      const slot = currentComp.slots[idx];
      setActivePlaySlotIdx(idx);

      // Trigger chord pluck
      const voicing = slot.voicing || getVoicingForChord(slot.chord);
      audioEngine.scheduleChord(voicing, 0, {
        articulation: slot.articulation || currentComp.defaultArticulation
      });

      // Optionally lock low drone base pitch if drone, or play drone
      if (currentComp.rhythmPatternId === 'drone_lento') {
        audioEngine.triggerDrone(40 + currentComp.key.tonic, true); // root pedal
      }

      // Progress index
      playIdxRef.current = idx + 1;
      const durationMs = slot.durationBeats * msPerBeat;
      
      playTimerRef.current = window.setTimeout(playNext, durationMs);
    };

    playNext();
  };

  const handleStopComposition = () => {
    setIsPlaying(false);
    setActivePlaySlotIdx(null);
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    audioEngine.stopAll();
  };

  // Convert and export composition into Host Lyrics sheet (REQ-INT-03)
  const triggerExport = () => {
    if (!currentComp || !onExportToSong) return;
    const content = SongExportAdapter.toHostSongContent(currentComp);
    onExportToSong(currentComp.title, content);
  };

  const currentTonicLabel = currentComp ? getPitchClassName(currentComp.key.tonic) : 'C';

  return (
    <div className="flex flex-col space-y-6 w-full max-w-5xl mx-auto p-4 md:p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
      
      {/* Workshop Header & Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Sparkles className="text-blue-600 w-6 h-6 animate-pulse" />
          <div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">Taller de Composición</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={currentComp?.title || ''}
                onChange={(e) => updateCurrentComp({ title: e.target.value })}
                className="text-xl font-extrabold bg-transparent border-none p-0 focus:ring-0 outline-none w-56 font-sans text-zinc-900 dark:text-zinc-100"
                placeholder="Nombre de la composición"
              />
              <button onClick={() => setEditKeyModal(true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-bold flex items-center gap-1 text-zinc-500">
                <Music size={12} /> {currentTonicLabel} {currentComp?.key.mode === 'minor' ? 'Menor' : 'Mayor'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {compositions.length > 0 && (
            <select
              value={currentComp?.id || ''}
              onChange={(e) => {
                setSelectedCompId(e.target.value);
              }}
              className="py-1.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-bold bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
            >
              {compositions.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleAddNewComposition}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} /> Nueva Maqueta
          </button>
        </div>
      </div>

      {currentComp ? (
        <div className="space-y-6">
          
          {/* Controls Belt - articulation, tempo etc */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayComposition}
                className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all text-white ${isPlaying ? 'bg-amber-600 shadow-md shadow-amber-500/20' : 'bg-green-600 shadow-md shadow-green-500/20'}`}
              >
                {isPlaying ? <Square size={14} /> : <Play size={14} />}
                {isPlaying ? 'Detener' : 'Reproducir'}
              </button>
            </div>

            {/* Tempo */}
            <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <span className="text-[10px] font-bold text-zinc-500 uppercase px-2 font-mono">Tempo</span>
              <input
                type="number"
                min="50"
                max="200"
                value={currentComp.tempo.bpm}
                onChange={(e) => updateCurrentComp({ tempo: { ...currentComp.tempo, bpm: parseInt(e.target.value) || 80 } })}
                className="w-12 bg-transparent border-none p-1 font-mono text-center text-xs font-bold font-sans text-blue-600 focus:ring-0 outline-none"
              />
              <span className="text-[10px] font-bold text-zinc-400 font-mono pr-2">BPM</span>
            </div>

            {/* Articulation */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button
                onClick={() => updateCurrentComp({ defaultArticulation: 'strum' })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${currentComp.defaultArticulation === 'strum' ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm' : 'text-zinc-500'}`}
              >
                Rasgueo
              </button>
              <button
                onClick={() => updateCurrentComp({ defaultArticulation: 'arpeggio' })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${currentComp.defaultArticulation === 'arpeggio' ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm' : 'text-zinc-500'}`}
              >
                Arpegio
              </button>
            </div>

            {/* Rhythm */}
            <select
              value={currentComp.rhythmPatternId}
              onChange={(e) => updateCurrentComp({ rhythmPatternId: e.target.value })}
              className="py-1.5 px-3 rounded-xl border-none outline-none text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            >
              <option value="balada">Rhythm: Balada (Pop)</option>
              <option value="vals">Rhythm: Vals (3/4)</option>
              <option value="rasgueado">Rhythm: Rasgueado Folclórico</option>
              <option value="drone_lento">Rhythm: Drone Pedal (Ceremonial)</option>
            </select>

            <div className="flex-1" />

            {/* Export Trigger */}
            {onExportToSong && (
              <button
                onClick={triggerExport}
                className="px-4 py-2 bg-zinc-800 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 transition-colors"
                title="Exportar como canción a la biblioteca"
              >
                <FileSpreadsheet size={14} /> Exportar como Canción
              </button>
            )}
          </div>

          {/* Timeline Row */}
          <div className="relative border border-dashed border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl min-h-[160px] flex items-center w-full overflow-x-auto select-none custom-scrollbar">
            {currentComp.slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center w-full space-y-3">
                <Compass className="text-zinc-300 dark:text-zinc-700 w-12 h-12 animate-bounce" />
                <p className="text-xs text-zinc-400 font-medium">No hay acordes en la línea de tiempo. Comienza tocando el botón de abajo.</p>
                <button
                  onClick={openAddChordFlow}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/10"
                >
                  Agregar Primer Acorde
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4 flex-nowrap pr-24">
                {currentComp.slots.map((slot, i) => {
                  const emo = EMOTIONS[slot.emotion || 'libre'] || { name: 'Libre', color: 'from-zinc-500 to-zinc-600 text-zinc-950', emoji: '⭐' };
                  
                  return (
                    <div key={slot.id} className="flex items-center relative gap-2 shrink-0">
                      
                      {/* Left-right Arrows */}
                      <div className="absolute top-2 left-2 right-2 flex justify-between items-center opacity-0 hover:opacity-100 transition-opacity z-10">
                        {i > 0 && (
                          <button onClick={() => moveSlot(i, 'left')} className="p-1 bg-white dark:bg-zinc-800 rounded shadow text-zinc-600 dark:text-zinc-300">
                            <ArrowLeft size={10} />
                          </button>
                        )}
                        {i < currentComp.slots.length - 1 && (
                          <button onClick={() => moveSlot(i, 'right')} className="p-1 bg-white dark:bg-zinc-800 rounded shadow text-zinc-600 dark:text-zinc-300">
                            <ArrowRight size={10} />
                          </button>
                        )}
                      </div>

                      <motion.div
                        className={`w-36 h-48 rounded-2xl border flex flex-col justify-between p-4 bg-gradient-to-br transition-all relative ${activePlaySlotIdx === i ? 'border-blue-500 ring-4 ring-blue-500/20 scale-105 shadow-xl' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm'}`}
                      >
                        {/* Chord representation info */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xl font-black font-mono tracking-tight text-zinc-900 dark:text-white">
                              {getChordString(slot.chord)}
                            </span>
                            <div className="text-[9px] text-zinc-400 font-mono tracking-tighter mt-0.5">
                              {slot.gesture || 'Paso'}
                            </div>
                          </div>
                          
                          <span className="text-lg">{emo.emoji}</span>
                        </div>

                        {/* Middle Lyric Label */}
                        <div className="my-1 text-center">
                          {slot.lyric ? (
                            <p className="text-[10px] italic text-zinc-600 dark:text-zinc-300 truncate font-sans">
                              "{slot.lyric}"
                            </p>
                          ) : (
                            <button
                              onClick={() => { setEditSlotIdx(i); setTempLyric(''); }}
                              className="text-[9px] text-blue-500 font-bold hover:underline"
                            >
                              + Letra
                            </button>
                          )}
                        </div>

                        {/* Footer stats: quality, tool and astral lvl */}
                        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2 flex justify-between items-center bg-transparent">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-500`}>
                            {slot.durationBeats} beats
                          </span>
                          
                          <span className="text-[10px] font-bold font-mono text-zinc-500" title="Nivel Astral">
                            ✨ {slot.astralLevel}
                          </span>
                        </div>

                        {/* Top corner options picker */}
                        <div className="absolute top-2 right-2 flex items-center gap-0.5 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 rounded bg-white/80 dark:bg-zinc-900/80 p-0.5">
                          <button onClick={() => handleDuplicateSlot(i)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400" title="Duplicar">
                            <Copy size={11} />
                          </button>
                          <button onClick={() => handleDeleteSlot(i)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-red-500" title="Eliminar">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </motion.div>

                      {/* Direction Connector */}
                      {i < currentComp.slots.length - 1 && (
                        <span className="text-zinc-300 dark:text-zinc-700 font-black shrink-0 font-mono text-base tracking-widest px-2">
                          ➜
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Inline append trigger */}
                <button
                  onClick={openAddChordFlow}
                  className="w-14 h-48 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center hover:border-blue-500 hover:text-blue-500 transition-all text-zinc-400"
                  title="Agregar Acorde"
                >
                  <Plus size={20} />
                </button>
              </div>
            )}
          </div>

          {/* 10. Calculations - Phase Indicators (REQ-FAS-01 / REQ-FAS-02) */}
          {phaseInfo && currentComp.slots.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-zinc-100/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800">
              
              {/* Phase and Level Card */}
              <div className="flex flex-col space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">Arco Astral / Fase</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black font-sans text-zinc-800 dark:text-zinc-100">
                    Fase {phaseInfo.phase}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Nivel {Math.round(phaseInfo.level)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span>Tendencia:</span>
                  <span className="font-bold flex items-center gap-0.5 uppercase">
                    {phaseInfo.trend === 'subiendo' ? <ArrowUpRight className="text-green-500" size={14} /> : phaseInfo.trend === 'bajando' ? <ArrowDownRight className="text-amber-500" size={14} /> : <RefreshCw className="text-blue-500 font-semibold" size={12} />}
                    {phaseInfo.trend}
                  </span>
                </div>
              </div>

              {/* Progress Target */}
              <div className="flex flex-col space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">Apuntando hacia</span>
                <span className="text-lg font-extrabold text-zinc-700 dark:text-zinc-300">
                  {phaseInfo.pointingTo}
                </span>
                <p className="text-[10px] text-zinc-500">
                  Heurística calculada en base al volumen emocional de los últimos {slotsAverageWindowDescription()}.
                </p>
              </div>

              {/* Target Coverage Meter (REQ-FAS-01) */}
              <div className="flex flex-col space-y-2 justify-center">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Cobertura del Arco</span>
                  <span className="font-mono font-bold">{Math.round(phaseInfo.coverage * 100)}%</span>
                </div>
                
                {/* Horizontal Progress bar */}
                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${phaseInfo.coverage * 100}%` }}
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  />
                </div>

                {/* Warning message overlay (REQ-FAS-03) */}
                {phaseInfo.coverage < 0.4 && (
                  <div className="flex items-center gap-1.5 text-[9px] text-amber-600 font-bold uppercase tracking-tight mt-1 animate-pulse">
                    <AlertCircle size={10} />
                    <span>Sección inestable: Te falta aterrizar la tierra (Anclaje)</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-400 space-y-3">
          <Sparkles className="text-zinc-300 dark:text-zinc-800 w-16 h-16 animate-pulse" />
          <p className="text-sm font-sans">No tienes ninguna composición creada aún. Toca "Nueva Maqueta" arriba para inaugurar tu taller.</p>
        </div>
      )}

      {/* MODAL: Wizard Assistant - Part 1 & 2 (REQ-CMP-03 / REQ-CMP-04) */}
      <AnimatePresence>
        {isWizardOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]"
            >
              
              {/* Header */}
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  {wizardStep === 2 && (
                    <button onClick={() => setWizardStep(1)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <h3 className="text-lg font-black font-sans">
                    {wizardStep === 1 ? 'Paso 1: ¿Qué herramienta armónica usar?' : 'Paso 2: Elige tu próximo acorde'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Content inside Step 1 or Step 2 */}
              <div className="p-6 overflow-y-auto space-y-4">
                {wizardStep === 1 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TOOLS_INFO.map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => handleSelectTool(tool.id)}
                        className="p-4 bg-zinc-50 hover:bg-zinc-100/50 dark:bg-zinc-900/60 dark:hover:bg-zinc-800 rounded-2xl text-left border border-zinc-200 dark:border-zinc-800/80 transition-all flex flex-col justify-between h-36"
                      >
                        <div>
                          <p className="font-extrabold text-sm text-zinc-800 dark:text-zinc-100">{tool.name}</p>
                          <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">{tool.desc}</p>
                        </div>
                        <div className="flex justify-between items-center w-full pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                          <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider font-mono">
                            Astral: {tool.astralRange}
                          </span>
                          <span className="text-[10px] flex gap-1 items-center">
                            {tool.emotions.map(e => (
                              <span key={e} title={e}>{EMOTIONS[e]?.emoji || '⭐'}</span>
                            ))}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
                      Acordes Candidatos ({getWizardCandidates().length})
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {getWizardCandidates().map((cand, idx) => {
                        const emo = EMOTIONS[cand.emotion] || { name: 'Libre', color: 'bg-zinc-600', emoji: '⭐' };
                        
                        return (
                          <div
                            key={idx}
                            onClick={() => handleSelectCandidate(cand)}
                            className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-600 rounded-2xl transition-all flex flex-col justify-between h-40 cursor-pointer shadow-sm relative group"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-lg font-black font-mono tracking-tight text-zinc-900 dark:text-white">
                                  {getChordString(cand.chord)}
                                </p>
                                <p className="text-[9px] text-zinc-400 font-mono italic mt-0.5">
                                  {cand.gesture}
                                </p>
                              </div>

                              <span className="text-lg">{emo.emoji}</span>
                            </div>

                            <p className="text-[10px] text-zinc-500 pr-8 leading-snug">
                              {cand.rationale}
                            </p>

                            <div className="flex justify-between items-center border-t border-zinc-100 dark:border-zinc-800 pt-2.5 bg-transparent">
                              {cand.role && (
                                <span className="text-[9px] font-bold font-mono text-zinc-400">
                                  {cand.role}
                                </span>
                              )}
                              <span className="text-[10px] ml-auto font-mono text-zinc-400">
                                ✨ {cand.astralLevel}
                              </span>
                            </div>

                            {/* Reference plucker button */}
                            <button
                              onClick={(e) => handlePreviewCandidate(cand, e)}
                              className="absolute bottom-3 right-3 p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500"
                              title="Oír sugerencia"
                            >
                              <Volume2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Edit Lyrics */}
      <AnimatePresence>
        {editSlotIdx !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
              <h3 className="text-base font-extrabold mb-4">Escribir Letra sobre el Acorde</h3>
              <input
                type="text"
                value={tempLyric}
                onChange={(e) => setTempLyric(e.target.value)}
                placeholder="Letra de la sección (ej. 'De tu luz...')"
                className="w-full p-3 border-none bg-zinc-100 dark:bg-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-6 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditSlotIdx(null)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                  Cancelar
                </button>
                <button onClick={handleSaveLyrics} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/10">
                  Guardar Letra
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Edit Tonality / Mode */}
      <AnimatePresence>
        {editKeyModal && currentComp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-6">
              <h3 className="text-base font-extrabold">Elegir Tonalidad de Maqueta</h3>
              
              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">Nota Tónica</label>
                <div className="grid grid-cols-4 gap-2">
                  {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((note, pitch) => (
                    <button
                      key={note}
                      onClick={() => updateCurrentComp({ key: { ...currentComp.key, tonic: pitch } })}
                      className={`py-1.5 rounded-lg text-xs font-bold font-mono border ${currentComp.key.tonic === pitch ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-200 dark:border-zinc-800'}`}
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">Modo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateCurrentComp({ key: { ...currentComp.key, mode: 'major' } })}
                    className={`py-2 rounded-xl text-xs font-extrabold border ${currentComp.key.mode === 'major' ? 'border-blue-600 bg-blue-50/50 text-blue-600' : 'border-zinc-200 dark:border-zinc-800'}`}
                  >
                    Modo Mayor
                  </button>
                  <button
                    onClick={() => updateCurrentComp({ key: { ...currentComp.key, mode: 'minor' } })}
                    className={`py-2 rounded-xl text-xs font-extrabold border ${currentComp.key.mode === 'minor' ? 'border-blue-600 bg-blue-50/50 text-blue-600' : 'border-zinc-200 dark:border-zinc-800'}`}
                  >
                    Modo Menor
                  </button>
                </div>
              </div>

              <button
                onClick={() => setEditKeyModal(false)}
                className="w-full py-3 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold rounded-xl text-xs"
              >
                Listo
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

function slotsAverageWindowDescription() {
  return "tres acordes";
}
