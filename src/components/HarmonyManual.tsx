// Interactive Transition Manual - Módulo C
// Fully expanded based on the "Caminos Armónicos" PDF manual by Alma Canindé.
// Includes 10 real interactive chapters, sound plucking triggers (acoustic Karplus-Strong physical modeling guitar synth),
// real-time progression sequencers, and background drone pedal control.

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Compass, ChevronDown, Volume2, HelpCircle, Sparkles, 
  Wand2, Star, Play, Music, Activity, Sun, Moon, Maximize2, RotateCcw 
} from 'lucide-react';
import { 
  Chord, Quality, getChordString, getPitchClassName, notesOf, 
  parseChordString, computePhase, Slot, parsePitchClass 
} from '../lib/harmonyEngine';
import { audioEngine, getVoicingForChord } from '../services/audioEngine';

interface Recipe {
  name: string;
  description: string;
  chords: string[];
  emotion: string;
  astral: number | string;
  scenario?: string;
  keyLabel?: string;
}

interface Gesto {
  mov: string;
  queEs: string;
  sensacion: string;
  uso: string;
  astral: string;
  chords: string[];
}

export const HarmonyManual: React.FC = () => {
  const [activeChapter, setActiveChapter] = useState<number>(0);
  const [useTransposition, setUseTransposition] = useState<boolean>(false);
  const [selectedTonic, setSelectedTonic] = useState<number>(0); // Default C
  const [isDroneActive, setIsDroneActive] = useState<boolean>(false);
  const [droneNote, setDroneNote] = useState<number>(40); // Default E2 (MIDI 40)
  const [playingSeq, setPlayingSeq] = useState<{ id: string; index: number } | null>(null);
  const [currentlyPlayingChord, setCurrentlyPlayingChord] = useState<string | null>(null);
  const [selectedChord, setSelectedChord] = useState<string>("C");

  const trackerTimeout = useRef<NodeJS.Timeout | null>(null);
  const singleChordTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stop any active sequences and drones on unmount or tab switch
  useEffect(() => {
    return () => {
      audioEngine.stopAll();
      if (trackerTimeout.current) {
        clearTimeout(trackerTimeout.current);
      }
      if (singleChordTimeoutRef.current) {
        clearTimeout(singleChordTimeoutRef.current);
      }
    };
  }, [activeChapter]);

  // Clean play chord helper with transpose and sanitizing
  const playSingleChord = (chordStr: string, isFromSequence: boolean = false) => {
    // Sanitize chords representation for the parser
    let cleanStr = chordStr.trim();
    if (cleanStr.endsWith('+')) {
      cleanStr = cleanStr.slice(0, -1) + 'aug';
    } else if (cleanStr.includes('dim7')) {
      cleanStr = cleanStr; // standard
    } else if (cleanStr.includes('°7')) {
      cleanStr = cleanStr.replace('°7', 'dim7');
    } else if (cleanStr.includes('°')) {
      cleanStr = cleanStr.replace('°', 'dim');
    } else if (cleanStr === 'D/C') {
      cleanStr = 'D'; // playable proxy or root
    }

    const chordObj = parseChordString(cleanStr);
    if (!chordObj) return;

    // Inform the visual diagram
    setSelectedChord(chordStr);

    // Optional Transposition
    const finalRoot = useTransposition ? (chordObj.root + selectedTonic) % 12 : chordObj.root;
    const finalChord: Chord = {
      root: finalRoot,
      quality: chordObj.quality
    };

    setIsDroneActive(false);
    audioEngine.init();
    const voicing = getVoicingForChord(finalChord);

    if (isFromSequence) {
      // Fast single strum for sequence flows to prevent overlapping noise
      audioEngine.scheduleChord(voicing, 0, { articulation: 'strum', velocity: 0.8 });
      
      setCurrentlyPlayingChord(chordStr);
      if (singleChordTimeoutRef.current) {
        clearTimeout(singleChordTimeoutRef.current);
      }
      singleChordTimeoutRef.current = setTimeout(() => {
        setCurrentlyPlayingChord(null);
      }, 1400);
    } else {
      // Direct manual play: Beautiful arpeggio followed by two down/up strumming strokes!
      // 1. Arpeggio at t = 0
      audioEngine.scheduleChord(voicing, 0, { articulation: 'arpeggio', velocity: 0.75 });
      // 2. First strum (down) at t = 0.9s
      audioEngine.scheduleChord(voicing, 0.9, { articulation: 'strum', strumDirection: 'down', velocity: 0.85 });
      // 3. Second strum (up) at t = 1.4s
      audioEngine.scheduleChord(voicing, 1.4, { articulation: 'strum', strumDirection: 'up', velocity: 0.65 });

      // Keep visual tracker active for length of the sequence play & decay
      setCurrentlyPlayingChord(chordStr);
      if (singleChordTimeoutRef.current) {
        clearTimeout(singleChordTimeoutRef.current);
      }
      singleChordTimeoutRef.current = setTimeout(() => {
        setCurrentlyPlayingChord(null);
      }, 2500);
    }
  };

  // Turn drone on/off
  const toggleDrone = (noteMidi: number) => {
    audioEngine.init();
    if (isDroneActive && droneNote === noteMidi) {
      audioEngine.triggerDrone(noteMidi, false);
      setIsDroneActive(false);
    } else {
      audioEngine.triggerDrone(noteMidi, true);
      setDroneNote(noteMidi);
      setIsDroneActive(true);
    }
  };

  // Play Sequence (Iterative Progression with Highlight tracker)
  const playProgressionSequence = (seqId: string, chordsArray: string[]) => {
    audioEngine.init();
    audioEngine.stopAll();
    setIsDroneActive(false);
    
    if (trackerTimeout.current) {
      clearTimeout(trackerTimeout.current);
    }

    let currentIndex = 0;
    setPlayingSeq({ id: seqId, index: 0 });

    const playNext = () => {
      if (currentIndex >= chordsArray.length) {
        setPlayingSeq(null);
        return;
      }

      setPlayingSeq({ id: seqId, index: currentIndex });
      playSingleChord(chordsArray[currentIndex], true);

      currentIndex++;
      trackerTimeout.current = setTimeout(playNext, 1500); // 1.5s per step
    };

    playNext();
  };

  const stopProgressionSequence = () => {
    if (trackerTimeout.current) {
      clearTimeout(trackerTimeout.current);
    }
    if (singleChordTimeoutRef.current) {
      clearTimeout(singleChordTimeoutRef.current);
    }
    setPlayingSeq(null);
    setCurrentlyPlayingChord(null);
    audioEngine.stopAll();
    setIsDroneActive(false);
  };

  // CHAPTERS DEF
  const chapters = [
    { title: 'Ch. 1: Mapa de Emociones', desc: 'Funcional vs Modal', icon: <Compass size={14} /> },
    { title: 'Ch. 2: Color del Acorde', desc: 'Diccionario afectivo', icon: <Music size={14} /> },
    { title: 'Ch. 3: Portal Aumentado', desc: 'Tríada simétrica y vecinos', icon: <Sparkles size={14} /> },
    { title: 'Ch. 4: Puente Disminuido', desc: 'Resoluciones múltiples', icon: <Activity size={14} /> },
    { title: 'Ch. 5: Escaleras Diatónicas', desc: 'Peligros y escalones', icon: <ChevronDown size={14} /> },
    { title: 'Ch. 6: Gestos de Transición', desc: 'Tabla sistemática completa', icon: <Wand2 size={14} /> },
    { title: 'Ch. 7: Mediantes Cromáticas', desc: 'El misterio de lo astral', icon: <Star size={14} /> },
    { title: 'Ch. 8: Modos y Drones', desc: 'Acordes quietos y Planing', icon: <Sun size={14} /> },
    { title: 'Ch. 9: Arco de Intensidad', desc: 'Estructurando la pieza', icon: <InteractivePathIcon size={14} /> },
    { title: 'Ch. 10: Recetas Alma Canindé', desc: '4 viajes ceremoniales', icon: <BookOpen size={14} /> },
  ];

  // CHAPTER 6 DATA
  const DIATONICOS: Gesto[] = [
    { mov: 'C → F', queEs: 'subdominante (IV)', sensacion: 'expansión, abrazo, descanso', uso: 'abrir sin irse de casa', astral: '1', chords: ['C', 'F'] },
    { mov: 'C → G', queEs: 'dominante (V)', sensacion: 'elevación luminosa', uso: 'subir el cuerpo, todavía en casa', astral: '2', chords: ['C', 'G'] },
    { mov: 'C → Am', queEs: 'relativo menor (vi)', sensacion: 'se nubla, ternura', uso: 'mismo paisaje en sombra', astral: '1', chords: ['C', 'Am'] },
    { mov: 'C → Em', queEs: 'mediante diatónica (iii)', sensacion: 'brillo melancólico', uso: 'suspensión suave', astral: '1', chords: ['C', 'Em'] },
    { mov: 'C → Dm', queEs: 'supertónica (ii)', sensacion: 'serenidad que prepara', uso: 'respirar antes del paso', astral: '1', chords: ['C', 'Dm'] },
  ];

  const CADENCIAS: Gesto[] = [
    { mov: 'G → C', queEs: 'cadencia auténtica (V→I)', sensacion: 'resolución, llegada', uso: 'cerrar, descansar', astral: '↓', chords: ['G', 'C'] },
    { mov: 'G → Am', queEs: 'cadencia rota (V→vi)', sensacion: 'sorpresa agridulce', uso: '“casi, pero no”: suspender el final', astral: '2', chords: ['G', 'Am'] },
    { mov: 'C°7 → C', queEs: 'resolución del disminuido', sensacion: 'alivio tras el vértigo', uso: 'soltar la tensión del umbral', astral: '↓', chords: ['Cdim7', 'C'] },
  ];

  const PRESTAMOS: Gesto[] = [
    { mov: 'C → Fm', queEs: 'subdominante menor (iv♭)', sensacion: 'nostalgia honda, suspiro', uso: 'el velo se humedece', astral: '2-3', chords: ['C', 'Fm'] },
    { mov: 'C → A♭', queEs: 'mediante cromática grave (♭VI)', sensacion: 'profundidad, lo sagrado-oscuro', uso: 'descenso, entrar a lo hondo', astral: '3', chords: ['C', 'Ab'] },
    { mov: 'C → E♭', queEs: 'mediante cromática (♭III)', sensacion: 'misterio, giro de escena', uso: 'cambiar de mundo sin avisar', astral: '3', chords: ['C', 'Eb'] },
    { mov: 'C → E', queEs: 'mediante cromática alta (III)', sensacion: 'asombro, revelación', uso: '“se abre una puerta de luz”', astral: '3-4', chords: ['C', 'E'] },
    { mov: 'C → D♭', queEs: 'napolitana (♭II)', sensacion: 'extrañeza solemne', uso: 'lo ritual ajeno, lo antiguo', astral: '3', chords: ['C', 'Db'] },
  ];

  const PORTAL_AUM: Gesto[] = [
    { mov: 'C → C+ → Fm', queEs: 'portal → menor', sensacion: 'disolución y reaparición', uso: 'teletransporte hacia la sombra', astral: '3-4', chords: ['C', 'Caug', 'Fm'] },
    { mov: 'C → C+ → Am', queEs: 'portal → menor', sensacion: 'flotar y aterrizar tierno', uso: 'salir de casa sin ruido', astral: '3', chords: ['C', 'Caug', 'Am'] },
    { mov: 'C → C+ → E', queEs: 'portal → mayor', sensacion: 'elevarse hacia la luz', uso: 'ascenso astral', astral: '3-4', chords: ['C', 'Caug', 'E'] },
  ];

  return (
    <div id="harmony-manual-container" className="flex flex-col xl:flex-row gap-6 p-4 md:p-6 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-7xl mx-auto shadow-sm">
      
      {/* Sidebar Chapters Guide Index */}
      <div className="xl:w-80 shrink-0 flex flex-col space-y-2 border-b xl:border-b-0 xl:border-r border-zinc-200/60 dark:border-zinc-800/60 pb-6 xl:pb-0 xl:pr-6">
        <div className="flex items-center gap-2 px-3 py-2 text-zinc-800 dark:text-zinc-100">
          <BookOpen size={18} className="text-blue-600 animate-pulse" />
          <span className="text-sm font-black uppercase tracking-wider font-mono">Caminos Armónicos</span>
        </div>
        <p className="text-[11px] text-zinc-400 px-3 pb-3 leading-relaxed">
          Cuaderno de armonía integral y física modal de Alma Canindé. Edición interactiva completa en español.
        </p>

        {/* Global Key Transposer & Controls */}
        <div className="bg-zinc-50 dark:bg-zinc-900/40 p-3 rounded-2xl border border-zinc-200/40 dark:border-zinc-800/40 space-y-3 mb-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono font-bold uppercase text-zinc-500 flex items-center gap-1.5">
              <span>Transposición Armónica</span>
            </label>
            <input 
              type="checkbox" 
              checked={useTransposition}
              onChange={() => setUseTransposition(!useTransposition)}
              className="w-3.5 h-3.5 text-blue-600 border-zinc-300 rounded focus:ring-blue-500"
            />
          </div>

          {useTransposition && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="space-y-1.5 overflow-hidden"
            >
              <span className="text-[9px] text-zinc-400 block font-mono">SELECCIONA NOTA CLAVE:</span>
              <div className="grid grid-cols-6 gap-1">
                {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'D#', 'F#', 'G#', 'A#'].map((note) => {
                  const pitchVal = parsePitchClass(note);
                  return (
                    <button
                      key={note}
                      onClick={() => setSelectedTonic(pitchVal)}
                      className={`py-1 text-[9px] font-mono leading-none rounded border font-bold ${selectedTonic === pitchVal ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-800'}`}
                    >
                      {note}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>Tono Actual:</span>
            <span className="font-extrabold text-blue-600">
              {useTransposition ? `${getPitchClassName(selectedTonic)}` : 'Original (Como el libro)'}
            </span>
          </div>

          {playingSeq && (
            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg text-red-600">
              <span className="text-[9px] font-bold animate-pulse">REPRODUCIENDO VIAJE...</span>
              <button onClick={stopProgressionSequence} className="text-[9px] underline font-bold hover:text-red-700">
                Detener
              </button>
            </div>
          )}
        </div>

        {/* Chapters navigation */}
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-1 pt-2">
          {chapters.map((chap, idx) => (
            <button
              key={idx}
              onClick={() => setActiveChapter(idx)}
              className={`px-3 py-2.5 rounded-xl text-left transition-all flex items-center gap-2 text-xs font-bold font-sans border ${activeChapter === idx ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/15' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'}`}
            >
              <span className={activeChapter === idx ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'}>
                {chap.icon}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="truncate leading-tight text-[11px] xl:text-xs">{chap.title}</span>
                <span className={`text-[8px] xl:text-[9px] font-regular truncate mt-0.5 ${activeChapter === idx ? 'text-blue-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
                  {chap.desc}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chapter Content Workspace */}
      <div className="flex-1 min-h-[500px] flex flex-col justify-between p-1">
        
        <AnimatePresence mode="wait">
          <motion.div
            key={activeChapter}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            
            {/* CHAPTER 1: MAPA DE EMOCIONES */}
            {activeChapter === 0 && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Compass className="text-blue-600" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 1</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">La armonía como mapa de emociones</h3>
                  </div>
                </div>

                <div className="border-l-2 border-blue-505 pl-4 py-2 bg-blue-50/10 dark:bg-blue-900/5 my-4 rounded-r-xl">
                  <p className="italic text-sm text-zinc-600 dark:text-zinc-300 font-serif leading-relaxed">
                    “Un acorde no es una regla: es un lugar. Y entre dos lugares siempre hay un camino.”
                  </p>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed space-y-3 font-sans">
                  <p>
                    Este cuaderno no es teoría por la teoría. Es un mapa para caminar entre acordes en la guitarra y diseñar viajes, sobre todo para música ceremonial y visionaria, donde cada cambio de acorde es un cambio de estado.
                  </p>
                  <p>
                    Vas a usar dos lógicas que se complementan. A veces caminarás y saltarás entre mundos (tensión y resolución); otras veces te quedarás quieto, sosteniendo un color sobre un drone.
                  </p>
                </div>

                {/* Grid Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                    <span className="text-xs font-black text-amber-500 block uppercase font-mono mb-1.5">A. Caminar y saltar</span>
                    <span className="text-[10px] text-zinc-400 block font-mono mb-3">Tensión → Resolución</span>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      La lógica funcional: tensión que pide resolverse. Los portales (aumentado, disminuido), las escaleras diatónicas y las mediantes cromáticas te llevan de un mundo a otro con rapidez y precisión.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                    <span className="text-xs font-black text-teal-500 block uppercase font-mono mb-1.5">B. Quedarse</span>
                    <span className="text-[10px] text-zinc-400 block font-mono mb-3">Color sobre un drone</span>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      La lógica modal: sostener un drone y dejar que el color trabaje. Tiempo suspendido, trance, permanencia — el corazón de lo espiritual y ceremonial.
                    </p>
                  </div>
                </div>

                {/* Color and Astral Guidance */}
                <div className="p-4 bg-stone-50 dark:bg-zinc-900/50 rounded-2xl border border-stone-200/60 dark:border-zinc-800/60">
                  <span className="text-[10px] font-mono font-bold uppercase text-stone-500 block mb-2">Código de Color y Guía del Viaje</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded bg-stone-200 dark:bg-zinc-800 text-[10px] font-medium text-stone-700 dark:text-stone-300">Nivel Astral 0: Anclaje</span>
                    <span className="px-2 py-1 rounded bg-stone-200 dark:bg-zinc-800 text-[10px] font-medium text-stone-700 dark:text-stone-300">Nivel Astral 1: Apertura</span>
                    <span className="px-2 py-1 rounded bg-stone-200 dark:bg-zinc-800 text-[10px] font-medium text-stone-700 dark:text-stone-300">Nivel Astral 2: Elevación</span>
                    <span className="px-2 py-1 rounded bg-stone-200 dark:bg-zinc-800 text-[10px] font-medium text-stone-700 dark:text-stone-300">Nivel Astral 3: Portal</span>
                    <span className="px-2 py-1 rounded bg-stone-200 dark:bg-zinc-800 text-[10px] font-medium text-stone-700 dark:text-stone-300">Nivel Astral 4: Cima</span>
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 2: EL COLOR DE CADA ACORDE */}
            {activeChapter === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Music className="text-blue-600 animate-pulse" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 2</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">El color de cada acorde</h3>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans">
                  Un pequeño diccionario afectivo. Antes de caminar entre acordes, conviene escuchar qué sensación base trae cada tipo. Ningún acorde "es" una emoción, son tendencias que nacen de las relaciones armónicas. **Presiona sobre cada tipo para oírlo interpretado en la guitarra:**
                </p>

                {/* Acordes Dictionary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { title: 'Mayor', color: 'border-l-4 border-l-amber-500', feelings: 'Luminoso, afirmativo, abierto. El "sí".', ceremonial: 'Luz, presencia, el suelo firme.', sample: 'C', forms: 'E, A, D, G, C' },
                    { title: 'menor', color: 'border-l-4 border-l-blue-500', feelings: 'Introspectivo, tierno, sombra cálida.', ceremonial: 'Recogimiento, lo íntimo, la entrada al adentro.', sample: 'Am', forms: 'Em, Am, Dm' },
                    { title: 'aumentado +', color: 'border-l-4 border-l-fuchsia-500', feelings: 'Ingravidez, ensueño, sin suelo: su simetría no tiene casa.', ceremonial: 'El portal, lo astral, suspender el tiempo.', sample: 'Caug', forms: 'Una sola forma que se repite cada 4 trastes.' },
                    { title: 'disminuido °', color: 'border-l-4 border-l-purple-500', feelings: 'Tensión, vértigo, inestabilidad que pide salida.', ceremonial: 'El umbral, el miedo justo antes de soltar.', sample: 'Cdim7', forms: 'Forma móvil que se repite cada 3 trastes.' },
                    { title: 'sus2 / sus4', color: 'border-l-4 border-l-teal-500', feelings: 'Apertura, respiración, una pregunta sin responder.', ceremonial: 'El aire, la espera, el mantra que no se cierra.', sample: 'Asus2', forms: 'Dsus2, Asus2, Esus4' },
                    { title: '7 (dominante)', color: 'border-l-4 border-l-orange-500', feelings: 'Empuje, deseo, gravedad que tira hacia casa.', ceremonial: 'La corriente que arrastra, el llamado.', sample: 'G7', forms: 'E7, A7, B7, D7' },
                    { title: 'maj7', color: 'border-l-4 border-l-yellow-400', feelings: 'Nostalgia luminosa, ensoñación dulce.', ceremonial: 'La belleza serena, el recuerdo que abraza.', sample: 'Cmaj7', forms: 'Cmaj7, Gmaj7, Fmaj7' },
                    { title: 'm7 / m9', color: 'border-l-4 border-l-cyan-500', feelings: 'Calidez melancólica, flotante.', ceremonial: 'La melancolía que mece, el agua quieta.', sample: 'Am7', forms: 'Em7, Am7, Dm9' },
                    { title: '6 / add9', color: 'border-l-4 border-l-lime-500', feelings: 'Frescura, inocencia, presente sin peso.', ceremonial: 'Lo claro, lo nuevo, la mañana.', sample: 'Cadd9', forms: 'Cadd9, G6, Em(add9)' },
                  ].map((x, idx) => {
                    const isActive = currentlyPlayingChord === x.sample;
                    return (
                      <button
                        key={idx}
                        onClick={() => playSingleChord(x.sample)}
                        className={`p-4 rounded-2xl text-left hover:scale-[1.01] transition-all flex flex-col justify-between group h-44 ${
                          isActive 
                            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-505 dark:border-blue-900 ring-2 ring-blue-550/20' 
                            : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-855 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50'
                        } ${x.color}`}
                      >
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs font-black tracking-wide text-zinc-855 dark:text-zinc-100">{x.title}</span>
                            <Volume2 size={13} className={isActive ? 'text-blue-600' : 'text-zinc-400 group-hover:text-blue-505 transition-colors'} />
                          </div>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal mb-2">{x.feelings}</p>
                          <p className="text-[10px] text-zinc-400 leading-normal italic">{x.ceremonial}</p>
                        </div>

                        <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40 w-full mt-2 flex justify-between items-center">
                          <span className="text-[8px] font-mono tracking-tight text-zinc-400 block truncate">Guitarra: {x.forms}</span>
                          {isActive ? (
                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 leading-none">
                              <SoundWave size="xs" />
                              <span className="text-[9px] font-black font-mono">Sonando</span>
                            </div>
                          ) : (
                            <span className="text-[9px] font-bold font-mono text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none">Oír {x.sample}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CHAPTER 3: EL PORTAL AUMENTADO */}
            {activeChapter === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Sparkles className="text-blue-600" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 3</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">El portal aumentado</h3>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans space-y-2">
                  <p>
                    El acorde aumentado es simétrico: divide la octava en tres terceras mayores iguales. **C+ = E+ = A♭+**: son exactamente las mismas tres notas.
                  </p>
                  <p>
                    Esa ambigüedad es justo lo que lo vuelve un portal. Como no tiene una “casa” clara, flota — y desde él podés deslizarte, moviendo una sola voz medio tono, hacia seis acordes vecinos: tres mayores (bajando una voz) y tres menores (subiéndola).
                  </p>
                </div>

                {/* Interactive Mandala Triangle */}
                <div className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-3xl relative overflow-hidden">
                  <span className="text-[9px] font-extrabold font-mono text-zinc-400 uppercase tracking-widest block mb-4">
                    Mandala del Portal C+ y sus seis vecinos
                  </span>

                  <div className="relative w-64 h-64 flex items-center justify-center mt-2">
                    {/* SVG connection lines representing voice movements */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 256 256">
                      <polygon points="128,30 35,190 221,190" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="3 3" className="opacity-30" />
                      <line x1="128" y1="128" x2="128" y2="30" stroke="#f43f5e" strokeWidth="1.5" className="opacity-30" />
                      <line x1="128" y1="128" x2="35" y2="190" stroke="#f43f5e" strokeWidth="1.5" className="opacity-30" />
                      <line x1="128" y1="128" x2="221" y2="190" stroke="#f43f5e" strokeWidth="1.5" className="opacity-30" />
                      
                      {/* Secondary link lines */}
                      <line x1="128" y1="30" x2="40" y2="100" stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
                      <line x1="128" y1="30" x2="216" y2="100" stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
                      <line x1="35" y1="190" x2="128" y2="226" stroke="#10b981" strokeWidth="1" strokeDasharray="2 2" />
                    </svg>

                    {/* Neighbor Minor: Fm (E->F) */}
                    <button onClick={() => playSingleChord('Fm')} className="absolute top-16 left-2 w-11 h-11 bg-zinc-900 border border-zinc-700 rounded-full flex flex-col items-center justify-center text-rose-400 hover:scale-105 transition-all text-[10px] font-bold shadow-md">
                      <span>Fm</span>
                    </button>

                    {/* Neighbor Minor: Dbm (C->Db) */}
                    <button onClick={() => playSingleChord('C#m')} className="absolute top-16 right-2 w-11 h-11 bg-zinc-900 border border-zinc-700 rounded-full flex flex-col items-center justify-center text-rose-400 hover:scale-105 transition-all text-[10px] font-bold shadow-md">
                      <span>C#m</span>
                    </button>

                    {/* Neighbor Minor: Am (G#->A) */}
                    <button onClick={() => playSingleChord('Am')} className="absolute bottom-1 right-24 w-11 h-11 bg-zinc-900 border border-zinc-700 rounded-full flex flex-col items-center justify-center text-rose-400 hover:scale-105 transition-all text-[10px] font-bold shadow-md">
                      <span>Am</span>
                    </button>

                    {/* Major Neighbor 1: C (G#->G) */}
                    <button onClick={() => playSingleChord('C')} className="absolute top-1 left-24 w-12 h-12 bg-white dark:bg-zinc-800 border border-emerald-500 rounded-full flex flex-col items-center justify-center text-emerald-600 hover:scale-105 transition-all text-xs font-black shadow">
                      <span>C</span>
                    </button>

                    {/* Major Neighbor 2: E (C->B) */}
                    <button onClick={() => playSingleChord('E')} className="absolute bottom-12 left-2 w-12 h-12 bg-white dark:bg-zinc-800 border border-emerald-500 rounded-full flex flex-col items-center justify-center text-emerald-600 hover:scale-105 transition-all text-xs font-black shadow">
                      <span>E</span>
                    </button>

                    {/* Major Neighbor 3: Ab (E->Eb) */}
                    <button onClick={() => playSingleChord('Ab')} className="absolute bottom-12 right-2 w-12 h-12 bg-white dark:bg-zinc-800 border border-emerald-500 rounded-full flex flex-col items-center justify-center text-emerald-600 hover:scale-105 transition-all text-xs font-black shadow">
                      <span>A♭</span>
                    </button>

                    {/* Central Portal Node C+ */}
                    <button
                      onClick={() => playSingleChord('Caug')}
                      className="w-16 h-16 bg-blue-600 border border-blue-400 text-white rounded-2xl flex flex-col items-center justify-center hover:scale-105 transition-all shadow-xl z-20"
                    >
                      <span className="text-[11px] font-black uppercase font-mono tracking-wider">C+</span>
                      <span className="text-[8px] font-regular mt-0.5">PORTAL</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-zinc-400 mt-4 leading-relaxed max-w-sm text-center">
                    Toca los nodos externos para oír cómo se transforman. La línea roja representa el movimiento de medio tono. El C+ central conecta instantáneamente a estos seis mundos.
                  </p>
                </div>

                {/* Acertijo info */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-2xl">
                  <span className="text-[10px] font-mono font-bold uppercase text-blue-600 tracking-wider block mb-1">El Acertijo C → Fm</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans mb-3">
                    Ir de Do mayor a Fa menor suena lejano en teoría, pero por el portal aumentado son solo dos pasos de medio tono:
                    <strong className="block font-mono text-zinc-700 dark:text-zinc-300 mt-1">
                      C → C+ (sube G a G♯) → Fm (sube E a F). El A♭ de Fm ya estaba ahí como G♯.
                    </strong>
                  </p>
                  <button 
                    onClick={() => playProgressionSequence('acertijo-c-fm', ['C', 'Caug', 'Fm'])}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-2xs transition-all shadow-sm shadow-blue-500/10"
                  >
                    <Play size={10} fill="currentColor" /> Escuchar Acertijo C → C+ → Fm
                  </button>
                </div>
              </div>
            )}

            {/* CHAPTER 4: EL PUENTE DISMINUIDO */}
            {activeChapter === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Activity className="text-blue-600 animate-pulse" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 4</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">El puente disminuido</h3>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans space-y-2">
                  <p>
                    El otro acorde simétrico. Si el aumentado flota, el disminuido tiembla: es el portal de la tensión, el umbral antes de soltar.
                  </p>
                  <p>
                    El `dim7` divide la octava en cuatro terceras menores iguales. Por eso **C°7 = E♭°7 = G♭°7 = A°7** son las mismas cuatro notas. Y como cada nota puede ser una sensible, un solo `dim7` tiene cuatro salidas, cada una a medio tono — se mueve con fuerza a cuatro tonalidades distintas.
                  </p>
                </div>

                {/* Compass Layout */}
                <div className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 rounded-3xl relative">
                  <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest block mb-4">
                    La brújula del C°7: Cuatro Destinos Simétricos
                  </span>

                  <div className="relative w-64 h-64 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 256 256">
                      <line x1="128" y1="35" x2="128" y2="221" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="35" y1="128" x2="221" y2="128" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 3" />
                    </svg>

                    {/* North Target: Db */}
                    <button onClick={() => playSingleChord('Db')} className="absolute top-1 w-12 h-12 bg-white dark:bg-zinc-800 border border-amber-600 rounded-full flex flex-col items-center justify-center text-amber-600 text-xs font-black shadow">
                      <span>D♭</span>
                    </button>

                    {/* East Target: E */}
                    <button onClick={() => playSingleChord('E')} className="absolute right-0 w-12 h-12 bg-white dark:bg-zinc-800 border border-amber-600 rounded-full flex flex-col items-center justify-center text-amber-600 text-xs font-black shadow">
                      <span>E</span>
                    </button>

                    {/* South Target: G */}
                    <button onClick={() => playSingleChord('G')} className="absolute bottom-1 w-12 h-12 bg-white dark:bg-zinc-800 border border-amber-600 rounded-full flex flex-col items-center justify-center text-amber-600 text-xs font-black shadow">
                      <span>G</span>
                    </button>

                    {/* West Target: Bb */}
                    <button onClick={() => playSingleChord('Bb')} className="absolute left-0 w-12 h-12 bg-white dark:bg-zinc-800 border border-amber-600 rounded-full flex flex-col items-center justify-center text-amber-600 text-xs font-black shadow">
                      <span>B♭</span>
                    </button>

                    {/* Center Bridge Button */}
                    <button onClick={() => playSingleChord('Cdim7')} className="w-16 h-16 bg-purple-600 border border-purple-400 rounded-2xl text-white flex flex-col items-center justify-center hover:scale-105 transition-all shadow-xl z-20">
                      <span className="text-[11px] font-black font-mono">C°7</span>
                      <span className="text-[8px]">PUENTE</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-zinc-400 mt-4 text-center max-w-xs">
                    Toca el acorde central y fíjate cómo se disuelve agradablemente en cualquiera de los cuatro destinos externos a una tercera menor de distancia.
                  </p>
                </div>

                {/* Tres gestos con disminuidos */}
                <div className="space-y-2">
                  <span className="text-xs font-mono font-bold uppercase text-zinc-500 block">Cómo usarlo — tres gestos clave:</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { name: '1. Paso Cromático (♯i°7)', info: 'C → C♯°7 → Dm', feelings: 'Impulso, urgencia breve.', astral: '2', list: ['C', 'C#dim7', 'Dm'] },
                      { name: '2. Resolución (vii°7)', info: '°7 → I / i', feelings: 'Alivio tras el vértigo.', astral: '↓', list: ['Cdim7', 'C'] },
                      { name: '3. Brújula (4 salidas)', info: 'C°7 → D♭ / E / G / B♭', feelings: 'Puerta de fuga, suspenso supremo.', astral: '3-4', list: ['Cdim7', 'Db'] }
                    ].map((g, i) => (
                      <div key={i} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center">
                            <span className="text-2xs font-bold text-zinc-800 dark:text-white">{g.name}</span>
                            <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1.5 rounded font-mono font-bold leading-none py-0.5">Lv {g.astral}</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 mt-1 block">{g.info}</span>
                          <span className="text-[9px] text-zinc-500 leading-normal block mt-1">{g.feelings}</span>
                        </div>
                        <button 
                          onClick={() => playProgressionSequence('gesto-dim-' + i, g.list)}
                          className="mt-3 py-1 bg-zinc-900 hover:bg-zinc-855 text-white text-[9px] font-bold rounded flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Play size={8} fill="currentColor" /> Tocar Gesto
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 5: ESCALERAS DIATÓNICAS */}
            {activeChapter === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <ChevronDown className="text-blue-600" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 5</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">Escaleras diatónicas</h3>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans space-y-2">
                  <p>
                    Los portales sirven para saltar entre mundos. La escalera, en cambio, es para **caminar dentro de uno**: los siete acordes de una tonalidad, ordenados como peldaños.
                  </p>
                  <p>
                    Acordes vecinos comparten dos notas, así que moverse de peldaño en peldaño siempre suena bien. Cada uno cumple una función: **tónica** (descanso), **subdominante** (movimiento) o **dominante** (tensión que pide volver).
                  </p>
                </div>

                {/* Staircase Step-by-step UI */}
                <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-200/50">
                  <span className="text-[10px] font-mono font-bold uppercase block text-center text-zinc-400 mb-4">
                    La Escalera de Do Mayor: Grados y Funciones
                  </span>

                  <div className="flex flex-col-reverse space-y-2 space-y-reverse w-full max-w-md mx-auto">
                    {[
                      { deg: 'vii°', label: 'B°', func: 'dominante (tensión que tira a casa)', sample: 'Bdim', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
                      { deg: 'vi', label: 'Am', func: 'tónica (relativo menor - ternura)', sample: 'Am', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                      { deg: 'V', label: 'G', func: 'dominante (tensión / elevación)', sample: 'G', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
                      { deg: 'IV', label: 'F', func: 'subdominante (abrir / expansión)', sample: 'F', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
                      { deg: 'iii', label: 'Em', func: 'tónica (médula diatónica)', sample: 'Em', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                      { deg: 'ii', label: 'Dm', func: 'subdominante (supertónica - preparar)', sample: 'Dm', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
                      { deg: 'I', label: 'C', func: 'tónica (descanso inicial / hogar)', sample: 'C', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' }
                    ].map((step, idx) => (
                      <button
                        key={idx}
                        onClick={() => playSingleChord(step.sample)}
                        className={`flex justify-between items-center p-2.5 rounded-xl border text-left hover:translate-x-1.5 transition-all ${step.color}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-black py-0.5 px-1.5 bg-zinc-900/10 rounded">{step.deg}</span>
                          <span className="text-xs font-extrabold font-mono">{step.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">{step.func}</span>
                          <Volume2 size={11} className="opacity-50 shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Modulación info */}
                <div className="p-4 bg-zinc-50 border border-zinc-200/50 dark:bg-zinc-900 rounded-2xl">
                  <span className="text-[10px] font-mono font-bold uppercase text-zinc-550 block mb-1">Puerta entre escaleras (Pivote)</span>
                  <p className="text-[11px] text-zinc-500 leading-normal">
                    Un mismo acorde menor vive en varias tonalidades distintas. Por ejemplo: **Am** es el grado vi de Do, pero también es el grado ii de Sol y el grado iii de Fa. Pisar ese acorde menor compartido es el puente de oro para pasar de una escala a otra sin que el oído se asuste — el pivote clásico de modulación.
                  </p>
                </div>
              </div>
            )}

            {/* CHAPTER 6: GESTOS DE TRANSICIÓN */}
            {activeChapter === 5 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Wand2 className="text-blue-600 animate-pulse" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 6</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">Gestos de transición y su emoción</h3>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans">
                  No el acorde aislado, sino el **gesto del movimiento** de transición y la emoción concreta que tiende a evocar en el oyente. Haz click sobre cualquier fila para oír la transición interpretada instantáneamente:
                </p>

                {/* Mega Transition Table Tabs */}
                <div className="space-y-6">
                  {/* Category A */}
                  <div className="space-y-2">
                    <span className="text-xs font-black text-amber-500 block uppercase font-mono border-b dark:border-zinc-800 pb-1">
                      A. Movimientos diatónicos — Caminar dentro de casa
                    </span>
                    <div className="space-y-1.5">
                      {DIATONICOS.map((g, idx) => (
                        <button
                          key={idx}
                          onClick={() => playProgressionSequence('t-dia-' + idx, g.chords)}
                          className={`w-full text-left p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/40 hover:border-blue-500 hover:scale-[1.005] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${playingSeq?.id === 't-dia-' + idx ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-xs font-extrabold font-mono text-blue-600">{g.mov}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">({g.queEs})</span>
                            <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-200">{g.sensacion}</span>
                          </div>

                          <div className="flex items-center gap-2.5 self-end sm:self-center">
                            <span className="text-[10px] text-zinc-400 italic">Uso: {g.uso}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-zinc-200/50 dark:bg-zinc-800 font-extrabold rounded">Lv {g.astral}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category B */}
                  <div className="space-y-2">
                    <span className="text-xs font-black text-red-500 block uppercase font-mono border-b dark:border-zinc-800 pb-1">
                      B. Cadencias — La Puntuación armónica
                    </span>
                    <div className="space-y-1.5">
                      {CADENCIAS.map((g, idx) => (
                        <button
                          key={idx}
                          onClick={() => playProgressionSequence('t-cad-' + idx, g.chords)}
                          className={`w-full text-left p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/40 hover:border-blue-500 hover:scale-[1.005] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${playingSeq?.id === 't-cad-' + idx ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-xs font-extrabold font-mono text-blue-600">{g.mov}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">({g.queEs})</span>
                            <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-200">{g.sensacion}</span>
                          </div>

                          <div className="flex items-center gap-2.5 self-end sm:self-center">
                            <span className="text-[10px] text-zinc-400 italic">{g.uso}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-zinc-200/50 dark:bg-zinc-800 font-extrabold rounded">Lv {g.astral}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category C */}
                  <div className="space-y-2">
                    <span className="text-xs font-black text-fuchsia-500 block uppercase font-mono border-b dark:border-zinc-800 pb-1">
                      C. Préstamos y cromatismo — Abrir el cielo
                    </span>
                    <div className="space-y-1.5">
                      {PRESTAMOS.map((g, idx) => (
                        <button
                          key={idx}
                          onClick={() => playProgressionSequence('t-pre-' + idx, g.chords)}
                          className={`w-full text-left p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/40 hover:border-blue-500 hover:scale-[1.005] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${playingSeq?.id === 't-pre-' + idx ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-xs font-extrabold font-mono text-blue-600">{g.mov}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">({g.queEs})</span>
                            <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-200">{g.sensacion}</span>
                          </div>

                          <div className="flex items-center gap-2.5 self-end sm:self-center">
                            <span className="text-[10px] text-zinc-400 italic">{g.uso}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-zinc-200/50 dark:bg-zinc-800 font-extrabold rounded">Lv {g.astral}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category D */}
                  <div className="space-y-2">
                    <span className="text-xs font-black text-purple-600 block uppercase font-mono border-b dark:border-zinc-800 pb-1">
                      D. El portal aumentado — Saltos astrales
                    </span>
                    <div className="space-y-1.5">
                      {PORTAL_AUM.map((g, idx) => (
                        <button
                          key={idx}
                          onClick={() => playProgressionSequence('t-aum-' + idx, g.chords)}
                          className={`w-full text-left p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/40 hover:border-blue-500 hover:scale-[1.005] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${playingSeq?.id === 't-aum-' + idx ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-xs font-extrabold font-mono text-blue-600">{g.mov}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">({g.queEs})</span>
                            <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-200">{g.sensacion}</span>
                          </div>

                          <div className="flex items-center gap-2.5 self-end sm:self-center">
                            <span className="text-[10px] text-zinc-400 italic">{g.uso}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-zinc-200/50 dark:bg-zinc-800 font-extrabold rounded">Lv {g.astral}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 7: MEDIANTES CROMÁTICAS */}
            {activeChapter === 6 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Star className="text-blue-600 animate-pulse" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 7</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">Mediantes cromáticas y lo astral</h3>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans space-y-2">
                  <p>
                    El salto que más se siente como “magia”. Una mediante cromática mueve la raíz una tercera y cambia de color, pero conserva una nota común con el acorde base — por eso suena suave aunque teóricamente parezca descabellado o lejano.
                  </p>
                  <p>
                    Ese roce entre lo familiar (la nota común) y lo inesperado (la alteración) produce **asombro, revelación, lo sobrenatural**. Es el recurso favorito del cine para retratar "lo sublime" y un imán cósmico para lo ceremonial.
                  </p>
                </div>

                {/* Ciclo diagram */}
                <div className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-3xl relative">
                  <span className="text-[9px] font-bold font-mono text-zinc-400 uppercase tracking-widest block mb-4">
                    Ciclo del Elevador Infinito de Terceras Mayores
                  </span>

                  <div className="relative w-56 h-56 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 200">
                      <polygon points="100,25 40,140 160,140" fill="none" stroke="#f43f5e" strokeWidth="2" />
                    </svg>

                    {/* Node C */}
                    <button onClick={() => playSingleChord('C')} className="absolute top-1 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-white dark:bg-zinc-800 border-2 border-blue-600 rounded-full flex items-center justify-center text-xs font-mono font-black shadow select-none">
                      <span>C</span>
                    </button>

                    {/* Node E */}
                    <button onClick={() => playSingleChord('E')} className="absolute bottom-6 right-1 w-12 h-12 bg-white dark:bg-zinc-800 border-2 border-blue-600 rounded-full flex items-center justify-center text-xs font-mono font-black shadow select-none">
                      <span>E</span>
                    </button>

                    {/* Node Ab */}
                    <button onClick={() => playSingleChord('Ab')} className="absolute bottom-6 left-1 w-12 h-12 bg-white dark:bg-zinc-800 border-2 border-blue-600 rounded-full flex items-center justify-center text-xs font-mono font-black shadow select-none">
                      <span>A♭</span>
                    </button>

                    {/* Center Core */}
                    <span className="text-[10px] font-sans font-bold text-zinc-400 italic">Eje Aumentado</span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => playProgressionSequence('ciclo-espiral', ['C', 'E', 'Ab'])}
                      className={`flex items-center gap-1.5 px-4 py-2 bg-blue-650 hover:bg-blue-750 text-white font-bold rounded-xl text-xs transition-all shadow-md ${playingSeq?.id === 'ciclo-espiral' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                    >
                      <Play size={10} fill="currentColor" /> {playingSeq?.id === 'ciclo-espiral' ? 'Detener Espiral' : 'Activar Espiral con Secuenciador'}
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-2xl">
                  <p className="text-[11px] text-zinc-500 leading-normal font-sans">
                    Es el primo “macro” del portal aumentado (cap. 3): allí eran notas moviéndose medio tono; aquí son **tonalidades enteras**. Subir por la espiral diatónica de terceras mayores da esa sensación de elevación infinita y mística, como una escalera que nunca termina.
                  </p>
                </div>
              </div>
            )}

            {/* CHAPTER 8: MODOS, DRONES Y PLANING */}
            {activeChapter === 7 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <Sun className="text-blue-600 animate-pulse" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 8</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">Modos, drones y planing</h3>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans space-y-2">
                  <p>
                    Hasta acá jugamos con tensión y resolución. Pero gran parte de la música ceremonial vive en otra lógica: **sostener una nota grave —un drone o pedal—** y dejar que todo flote encima. No hay urgencia armónica: hay textura, color modal y permanencia mística.
                  </p>
                </div>

                {/* Drone Background sound control */}
                <div className="p-4 bg-zinc-900 text-white rounded-3xl border border-zinc-800/80 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <Activity className={`text-blue-400 ${isDroneActive ? 'animate-bounce' : ''}`} size={24} />
                    <div>
                      <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest block">Generador de Pedal de Drone</span>
                      <p className="text-[10px] text-zinc-400">Activa un sonido de pedal de fondo en baja frecuencia para experimentar los vamps.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleDrone(40)} // E2
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${isDroneActive && droneNote === 40 ? 'bg-red-600 text-white shadow' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {isDroneActive && droneNote === 40 ? 'Apagar Mi (E2)' : 'Pedal en Mi (E2)'}
                    </button>
                    <button
                      onClick={() => toggleDrone(36)} // C2
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${isDroneActive && droneNote === 36 ? 'bg-red-600 text-white shadow' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    >
                      {isDroneActive && droneNote === 36 ? 'Apagar Do (C2)' : 'Pedal en Do (C2)'}
                    </button>
                  </div>
                </div>

                {/* Modes Scale representation */}
                <div className="space-y-2">
                  <span className="text-xs font-black text-zinc-800 dark:text-white uppercase font-mono">Los Siete Modos Ordenados deBrillo a Sombra:</span>
                  <div className="space-y-1.5">
                    {[
                      { name: '1. Lidio', characteristics: '#4', effect: 'celeste, ensueño, asombro', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20' },
                      { name: '2. Jónico', characteristics: '— (Base mayor)', effect: 'luz, estable, afirmativo', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
                      { name: '3. Mixolidio', characteristics: '♭7', effect: 'terrenal, hipnótico, mantra', color: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20' },
                      { name: '4. Dórico', characteristics: '♭3, 6', effect: 'menor con esperanza, místico', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
                      { name: '5. Eolio', characteristics: '♭3, ♭6', effect: 'melancolía, introspección', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
                      { name: '6. Frigio', characteristics: '♭2, ♭3, ♭6', effect: 'oscuro, antiguo, ritual', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
                      { name: '7. Locrio', characteristics: '♭2, ♭5', effect: 'inestable, suspendido en la bruma', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20' }
                    ].map((m, idx) => (
                      <div key={idx} className={`flex justify-between items-center p-2 rounded-xl border ${m.color}`}>
                        <span className="text-xs font-black font-sans">{m.name}</span>
                        <div className="flex gap-4 items-center">
                          <span className="text-[10px] font-mono font-bold">Modificación: {m.characteristics}</span>
                          <span className="text-[10px] italic">{m.effect}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vamp over pedal examples */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-mono font-bold uppercase text-zinc-500 block">Vamps sobre Pedal:</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { name: 'Vamp Dórico en Mi', route: 'Em → A → Em', list: ['Em', 'A', 'Em'], isE: true },
                      { name: 'Color Frigio en Mi', route: 'Em → F → Em', list: ['Em', 'F', 'Em'], isE: true },
                      { name: 'Suspensión Lidia en Do', route: 'Cmaj7 → D/C → Cmaj7', list: ['Cmaj7', 'D', 'Cmaj7'], isE: false },
                    ].map((v, i) => (
                      <div key={i} className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-2xl flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-black text-zinc-800 dark:text-zinc-100 block">{v.name}</span>
                          <span className="text-[10px] font-mono text-blue-600 block mt-1">{v.route}</span>
                        </div>
                        <button
                          onClick={() => {
                            toggleDrone(v.isE ? 40 : 36);
                            playProgressionSequence('vamp-' + i, v.list);
                          }}
                          className="mt-4 py-1.5 bg-zinc-900 border-none hover:bg-zinc-800 text-white rounded-xl text-xs font-bold leading-none flex items-center justify-center gap-1.5"
                        >
                          <Play size={10} fill="currentColor" /> Encender Drone & Oír Vamp
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 9: TU ARCO DE INTENSIDAD */}
            {activeChapter === 8 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <InteractivePathIcon className="text-blue-600" />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 9</span>
                    <h3 className="text-lg font-black text-zinc-800 dark:text-zinc-100">Tu arco de intensidad</h3>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans">
                  Aquí se junta todo: cada familia de gestos armónicos tiene un lugar natural en un arco de intensidad ascendente que sube y vuelve. Es el esqueleto emocional interior de cualquier pieza ceremonial.
                </p>

                {/* Beautiful custom styled Intensity path map */}
                <div className="flex flex-col items-center bg-zinc-50 dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/50 relative">
                  <span className="text-[9px] font-extrabold font-mono text-zinc-400 uppercase tracking-widest block mb-4">
                    Esquema Interior de la Curva de Intensidad
                  </span>

                  <div className="relative w-full max-w-lg min-h-[140px] flex items-center justify-between">
                    {[
                      { l: 'Anclaje', level: '0', d: 'Tónica, drone, sus2' },
                      { l: 'Apertura', level: '1', d: 'Subdominante, add9, vi' },
                      { l: 'Elevación', level: '2', d: 'Dominante, mediante diatónica' },
                      { l: 'Portal', level: '3', d: 'Aumentado, mediante cromática, iv♭' },
                      { l: 'Cima', level: '4', d: 'Modulación lejana, disminuido' }
                    ].map((step, idx) => (
                      <div key={idx} className="flex flex-col items-center flex-1 text-center relative group select-none">
                        <div className="w-8 h-8 rounded-full bg-blue-600 border border-blue-400 text-white flex items-center justify-center font-bold text-xs shadow-md group-hover:scale-105 transition-transform z-10">
                          {step.level}
                        </div>
                        <span className="text-[10px] font-black text-zinc-800 dark:text-zinc-200 mt-2 block leading-none">{step.l}</span>
                        <span className="text-[8px] text-zinc-400 mt-1 max-w-[70px] leading-tight block">{step.d}</span>
                      </div>
                    ))}
                    {/* Connecting dotted lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 140" preserveAspectRatio="none">
                      <line x1="10%" y1="16" x2="90%" y2="16" stroke="gray" strokeWidth="1" strokeDasharray="3 3" className="opacity-30" />
                    </svg>
                  </div>

                  <p className="text-[10.5px] text-zinc-400 mt-4 max-w-md text-center leading-normal">
                    La música sube de intensidad orgánica (0 a 4) y luego retorna. Volver a la tónica (nivel 0) es lo que hace que el viaje se sienta completo y redondo, como aterrizar con seguridad después de volar.
                  </p>
                </div>

                {/* Dos recetas en el arco */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-mono font-bold uppercase text-zinc-500 block">Dos recetas basadas en el Arco de Intensidad (Toca para oír):</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-2xl flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-zinc-800 dark:text-zinc-100 block">Apertura del cielo (Guitarra en Sol)</span>
                        <div className="flex gap-1.5 mt-2.5">
                          {['G (L0)', 'Cadd9 (L1)', 'Em (L1)', 'Eb (L3)', 'D (L2)', 'G (L0)'].map((ch, idx) => (
                            <span key={idx} className="text-[9px] font-bold font-mono px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded">
                              {ch}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => playProgressionSequence('cielo-sol', ['G', 'Cadd9', 'Em', 'Eb', 'D', 'G'])}
                        className="mt-5 py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold leading-none flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Play size={10} fill="currentColor" /> Tocar Progresión Completa
                      </button>
                    </div>

                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 rounded-2xl flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-zinc-800 dark:text-zinc-100 block">El portal en Do</span>
                        <div className="flex gap-1.5 mt-2.5">
                          {['C (L0)', 'G (L2)', 'C+ (L3)', 'Fm (L3)', 'G7 (L4)', 'C (L0)'].map((ch, idx) => (
                            <span key={idx} className="text-[9px] font-bold font-mono px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded">
                              {ch}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => playProgressionSequence('portal-do', ['C', 'G', 'Caug', 'Fm', 'G7', 'C'])}
                        className="mt-5 py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold leading-none flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Play size={10} fill="currentColor" /> Tocar Progresión Completa
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 10: RECETAS ALMA CANINDÉ */}
            {activeChapter === 9 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <BookOpen className="text-blue-600 animate-pulse" size={20} />
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">CAPÍTULO 10</span>
                    <h3 className="text-lg font-black text-zinc-850 dark:text-zinc-100">Recetas en clave Alma Canindé</h3>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-300 leading-relaxed font-sans">
                  Cuatro ceremonias armónicas completas para guitarra pensadas para sostener oraciones tradicionales o crear atmósferas envolventes en momentos especiales. **Haz click sobre cualquier nodo para tocarlo individualmente, o presiona "Oír Viaje Ceremonial Completo" para reproducir la escala secuencialmente:**
                </p>

                {/* Recipes maps */}
                <div className="space-y-4">
                  {[
                    {
                      name: '1. La llamada (Mi · Pedal de E)',
                      sub: 'Abrir la ceremonia: presencia que crece y un primer destello de lo otro.',
                      chords: ['E', 'Asus2', 'C#m', 'C', 'B', 'E'],
                      steps: [
                        { name: 'anclaje', code: 'E', lvl: '0' },
                        { name: 'apertura', code: 'Asus2', lvl: '1' },
                        { name: 'sombra', code: 'C#m', lvl: '1' },
                        { name: 'se abre el velo (♭VI)', code: 'C', lvl: '3' },
                        { name: 'tensión', code: 'B', lvl: '2' },
                        { name: 'retorno', code: 'E', lvl: '0' }
                      ]
                    },
                    {
                      name: '2. Ascenso astral (Do · Ciclo de mediantes)',
                      sub: 'La espiral que sube por terceras mayores y se disuelve en el portal antes de volver.',
                      chords: ['C', 'E', 'Ab', 'Caug', 'C'],
                      steps: [
                        { name: 'casa', code: 'C', lvl: '0' },
                        { name: 'mediante alta', code: 'E', lvl: '3' },
                        { name: 'sigue subiendo', code: 'Ab', lvl: '4' },
                        { name: 'portal / disolución', code: 'C+', lvl: '4' },
                        { name: 'retorno', code: 'C', lvl: '0' }
                      ]
                    },
                    {
                      name: '3. El suspiro (Do)',
                      sub: 'El valle emocional: la nostalgia honda antes de soltar y volver a casa.',
                      chords: ['C', 'Am', 'Fm', 'Ab', 'G7', 'C'],
                      steps: [
                        { name: 'luz', code: 'C', lvl: '1' },
                        { name: 'sombra', code: 'Am', lvl: '1' },
                        { name: 'suspiro (iv)', code: 'Fm', lvl: '3' },
                        { name: 'descenso (♭VI)', code: 'Ab', lvl: '3' },
                        { name: 'entrega', code: 'G7', lvl: '4' },
                        { name: 'retorno', code: 'C', lvl: '0' }
                      ]
                    },
                    {
                      name: '4. Aterrizaje (Mi · Pedal de E)',
                      sub: 'Cerrar: mecerse en pliegues abiertos sobre el drone hasta la quietud total.',
                      chords: ['E', 'Asus2', 'E', 'Bsus4', 'E'],
                      steps: [
                        { name: 'tierra', code: 'E', lvl: '0' },
                        { name: 'respiro', code: 'Asus2', lvl: '1' },
                        { name: 'tierra', code: 'E', lvl: '0' },
                        { name: 'último aire', code: 'Bsus4', lvl: '1' },
                        { name: 'quietud', code: 'E', lvl: '0' }
                      ]
                    }
                  ].map((recipe, recipeIdx) => (
                    <div 
                      key={recipeIdx}
                      className="p-5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-3xl space-y-3.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b dark:border-zinc-800/40 pb-2">
                        <div>
                          <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-100">{recipe.name}</h4>
                          <span className="text-[10px] text-zinc-400 font-sans block mt-0.5">{recipe.sub}</span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => playProgressionSequence('recipe-' + recipeIdx, recipe.chords)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Play size={10} fill="currentColor" /> Reprod. Completo
                          </button>
                        </div>
                      </div>

                      {/* Timeline/Horizontal Nodes container */}
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1.5">
                        {recipe.steps.map((st, stepIdx) => {
                          const isCurrentlyPlaying = playingSeq?.id === 'recipe-' + recipeIdx && playingSeq.index === stepIdx;
                          return (
                            <button
                              key={stepIdx}
                              onClick={() => playSingleChord(st.code)}
                              className={`p-2.5 rounded-2xl border text-center transition-all bg-white dark:bg-zinc-800 flex flex-col justify-between items-center h-20 relative group hover:scale-[1.02] ${isCurrentlyPlaying ? 'ring-2 ring-blue-500 border-blue-500' : 'border-zinc-200/50 dark:border-zinc-800/80 hover:border-zinc-300'}`}
                            >
                              <span className="text-[8px] uppercase tracking-wider text-zinc-400 font-bold leading-tight block truncate w-full">{st.name}</span>
                              <span className="text-xs font-black font-mono text-zinc-800 dark:text-white mt-1 group-hover:text-blue-500 transition-colors">{st.code}</span>
                              
                              <div className="pt-1.5 flex justify-between items-center w-full border-t border-zinc-100 dark:border-zinc-800 mt-1.5">
                                <span className="text-[8px] font-mono select-none px-1 bg-zinc-100 dark:bg-zinc-800 rounded leading-none text-zinc-400">Lv {st.lvl}</span>
                                <Volume2 size={9} className="opacity-40 text-zinc-400 group-hover:opacity-100" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Floating Active Playback Indicator */}
        <AnimatePresence>
          {(currentlyPlayingChord || playingSeq || isDroneActive) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="sticky bottom-4 left-0 right-0 mx-auto max-w-sm z-40 flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-800/80 rounded-2xl shadow-xl backdrop-blur-md text-white mt-4"
            >
              <div className="flex items-center gap-3">
                <SoundWave size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-blue-400 font-bold block leading-none">
                    {isDroneActive ? 'Drone Activo' : playingSeq ? 'Secuencia en Curso' : 'Tocando Acorde'}
                  </span>
                  <span className="text-xs font-black font-mono text-zinc-100 truncate block mt-0.5">
                    {isDroneActive 
                      ? `Nota: E2 (6a Cuerda)` 
                      : playingSeq 
                        ? `Paso ${playingSeq.index + 1}: ${currentlyPlayingChord || '...'}` 
                        : `Acorde: ${currentlyPlayingChord}`}
                  </span>
                </div>
              </div>
              <button
                onClick={stopProgressionSequence}
                className="p-1 px-2.5 bg-zinc-800 hover:bg-zinc-700 dark:bg-zinc-850 dark:hover:bg-zinc-750 text-[10px] font-black rounded-lg text-white transition-colors"
              >
                Silenciar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual Footer */}
        <div id="manual-footer" className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-5 mt-6 flex flex-col sm:flex-row justify-between items-center gap-3 bg-transparent">
          <div className="flex gap-1.5 items-center text-[10px] text-zinc-400 font-sans">
            <HelpCircle size={14} className="text-zinc-405" />
            <span>Alma Canindé - Caminos Armónicos: Un mapa de emociones para caminar entre acordes (Guitarra).</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest block bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded">
            CanindeChords Engine • Physical Modeling
          </span>
        </div>

      </div>

      {/* Interactive Guitar Diagram Side-Panel */}
      <div className="xl:w-80 shrink-0 flex flex-col pt-6 xl:pt-0 xl:pl-6 border-t xl:border-t-0 xl:border-l border-zinc-200/60 dark:border-zinc-800/60 sticky top-4 self-start">
        <GuitarChordDiagram 
          chordStr={selectedChord} 
          useTransposition={useTransposition}
          selectedTonic={selectedTonic}
          onPlay={playSingleChord}
        />
        <div className="mt-4 p-3.5 bg-blue-50/25 dark:bg-blue-950/10 rounded-2xl border border-blue-500/10 text-[10px] text-zinc-500 dark:text-zinc-400 font-sans leading-relaxed">
          💡 <span className="font-bold text-blue-600 dark:text-blue-400">Consejo Canindé:</span> Al presionar cualquier acorde en las lecciones y recetas del manual, sonará su tono orgánico de guitarra y se actualizará este gráfico con su digitación exacta y perfil afectivo en tiempo real.
        </div>
      </div>

    </div>
  );
};

// Beautiful Interactive Guitar Chord Diagram Sub-component
interface GuitarChordDiagramProps {
  chordStr: string;
  useTransposition: boolean;
  selectedTonic: number;
  onPlay: (chord: string) => void;
}

const GuitarChordDiagram: React.FC<GuitarChordDiagramProps> = ({ 
  chordStr, 
  useTransposition, 
  selectedTonic, 
  onPlay 
}) => {
  // Sanitize the chord symbol
  let cleanStr = chordStr.trim();
  if (cleanStr.endsWith('+')) {
    cleanStr = cleanStr.slice(0, -1) + 'aug';
  } else if (cleanStr.includes('dim7')) {
    cleanStr = cleanStr;
  } else if (cleanStr.includes('°7')) {
    cleanStr = cleanStr.replace('°7', 'dim7');
  } else if (cleanStr.includes('°')) {
    cleanStr = cleanStr.replace('°', 'dim');
  } else if (cleanStr === 'D/C') {
    cleanStr = 'D';
  }

  const chordObj = parseChordString(cleanStr);
  if (!chordObj) {
    return (
      <div className="p-5 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-150 dark:border-zinc-800/50 text-center text-xs text-zinc-400 font-sans">
        Selecciona un acorde del manual para ver su diagrama
      </div>
    );
  }

  // Calculate transposed or original chord
  const finalRoot = useTransposition ? (chordObj.root + selectedTonic) % 12 : chordObj.root;
  const finalChord: Chord = {
    root: finalRoot,
    quality: chordObj.quality
  };

  const voicing = getVoicingForChord(finalChord);
  const chordNameTransposed = getChordString(finalChord);

  // Get emotional descriptors based on quality
  const getEmotionalProfile = (quality: string) => {
    switch (quality) {
      case 'minor': 
        return {
          feels: "Introspectivo, tierno, nostalgia contemplativa de misterio dulce.",
          sacred: "Recogimiento interno, el viaje meditativo hacia el adentro."
        };
      case 'aug': 
        return {
          feels: "Ingravidez, ensueño cósmico, disolución absoluta del suelo.",
          sacred: "El portal astral, suspender el tiempo lineal del ego."
        };
      case 'dim': 
        return {
          feels: "Tensión acumulada, misterio profundo, inestabilidad que pide luz.",
          sacred: "El umbral de transmutación, rendición antes de cruzar."
        };
      case 'dim7': 
        return {
          feels: "Vértigo sagrado, tensión magnética cósmica.",
          sacred: "Cruzar el puente ritual hacia resoluciones inesperadas."
        };
      case 'sus2':
      case 'sus4': 
        return {
          feels: "Apertura celeste, respiración, expectación límpida libre de pesos.",
          sacred: "El elemento aire, la espera sagrada, el mantra sin cerrar."
        };
      case 'dom7': 
        return {
          feels: "Fuerza telúrica, empuje terrenal, gravedad hacia el origen.",
          sacred: "El llamado imperioso de retorno a la tierra, magnetismo activo."
        };
      case 'maj7': 
        return {
          feels: "Nostalgia de luz dorada, ensoñación dulce, madurez del corazón.",
          sacred: "Contemplación pacífica, cobijar la belleza presente."
        };
      case 'min7':
      case 'm7':
      case 'm9': 
        return {
          feels: "Calidez melancólica, flotación acogedora, susurro íntimo.",
          sacred: "Aguas quietas del espíritu que mecen suavemente el rezo."
        };
      case 'add9':
      case 'six':
      case '6': 
        return {
          feels: "Frescura primaveral, inocencia pura del instante presente.",
          sacred: "El juego del amanecer límpido, alegría ceremonial libre."
        };
      default: 
        return {
          feels: "Apoyo estable, arraigo maduro, luz dorada clara de resolución.",
          sacred: "El centro radiante, la casa del alma donde toda tormenta calma."
        };
    }
  };

  const emo = getEmotionalProfile(chordObj.quality);

  const frets = voicing.frets; // e.g. [-1, 3, 2, 0, 1, 0]
  const activeFretValues = frets.filter(f => f > 0);
  const maxFret = activeFretValues.length > 0 ? Math.max(...activeFretValues) : 0;
  const minFret = activeFretValues.length > 0 ? Math.min(...activeFretValues) : 0;

  // Standard window is fret 1-5. If maxFret > 5, we shift starting fret.
  let startFret = 1;
  if (maxFret > 5) {
    startFret = minFret;
  }

  // Grid dimensions
  const numStrings = 6;
  const numFrets = 5; // display 5 frets
  const stepX = 22;
  const stepY = 24;
  const width = 160;
  const height = 165;
  const startX = 25;
  const startY = 28;

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/60 rounded-3xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b dark:border-zinc-800/50 pb-2 mb-3">
          <div>
            <span className="text-[9px] font-mono text-zinc-400 font-bold uppercase tracking-widest block">DIAGRAMA GUITARRA</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <h4 className="text-lg font-black font-mono text-zinc-900 dark:text-white leading-none">
                {chordNameTransposed}
              </h4>
              {useTransposition && (
                <span className="text-[9px] text-zinc-400 font-mono italic">
                  (Orig: {chordStr})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onPlay(chordStr)}
            className="p-1 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-black flex items-center gap-1 shadow-sm transition-all"
          >
            <Play size={8} fill="currentColor" /> Rasguear
          </button>
        </div>

        {/* Beautiful Interactive Vector SVG Diagram */}
        <div className="flex justify-center items-center py-2.5 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900/40 shadow-inner">
          <svg width={width} height={height} className="overflow-visible select-none text-zinc-850 dark:text-zinc-200">
            {/* Draw Nut (thick line) if startFret is 1 */}
            {startFret === 1 ? (
              <line 
                x1={startX} 
                y1={startY} 
                x2={startX + (numStrings - 1) * stepX} 
                y2={startY} 
                stroke="currentColor" 
                strokeWidth={5} 
                strokeLinecap="round"
              />
            ) : (
              // Draw regular line for the top fret and a label on the left
              <>
                <line 
                  x1={startX} 
                  y1={startY} 
                  x2={startX + (numStrings - 1) * stepX} 
                  y2={startY} 
                  stroke="currentColor" 
                  strokeWidth={2} 
                />
                <text 
                  x={startX - 14} 
                  y={startY + (stepY / 2) + 3} 
                  fontSize="9px" 
                  fontFamily="monospace"
                  fontWeight="black"
                  className="fill-blue-500 font-bold"
                  textAnchor="middle"
                >
                  {startFret}fr
                </text>
              </>
            )}

            {/* Draw Fret Lines (Horizontal) */}
            {Array.from({ length: numFrets }).map((_, fIdx) => {
              const y = startY + (fIdx + 1) * stepY;
              return (
                <line 
                  key={fIdx} 
                  x1={startX} 
                  y1={y} 
                  x2={startX + (numStrings - 1) * stepX} 
                  y2={y} 
                  stroke="currentColor" 
                  strokeWidth={1} 
                  className="opacity-25 dark:opacity-20"
                />
              );
            })}

            {/* Draw String Lines (Vertical) */}
            {Array.from({ length: numStrings }).map((_, sIdx) => {
              const x = startX + sIdx * stepX;
              return (
                <line 
                  key={sIdx} 
                  x1={x} 
                  y1={startY} 
                  x2={x} 
                  y2={startY + numFrets * stepY} 
                  stroke="currentColor" 
                  strokeWidth={sIdx === 0 ? 1.6 : 1.1 - sIdx * 0.1} // Gauge difference
                  className="opacity-30 dark:opacity-25"
                />
              );
            })}

            {/* Draw Open/Muted icons directly above the nut */}
            {frets.map((fretVal, stringIdx) => {
              const x = startX + stringIdx * stepX;
              const y = startY - 8;
              if (fretVal === -1) {
                return (
                  <g key={stringIdx} className="opacity-50">
                    <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} stroke="#ef4444" strokeWidth={1.5} />
                    <line x1={x + 3} y1={y - 3} x2={x - 3} y2={y + 3} stroke="#ef4444" strokeWidth={1.5} />
                  </g>
                );
              } else if (fretVal === 0) {
                return (
                  <circle 
                    key={stringIdx} 
                    cx={x} 
                    cy={y} 
                    r={3} 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth={1.2} 
                    className="opacity-65 text-blue-500" 
                  />
                );
              }
              return null;
            })}

            {/* Draw Fretted Dots */}
            {frets.map((fretVal, stringIdx) => {
              if (fretVal <= 0) return null;
              // Check if fits inside window
              const relativeFret = fretVal - startFret + 1;
              if (relativeFret < 1 || relativeFret > numFrets) return null;

              const x = startX + stringIdx * stepX;
              const y = startY + (relativeFret - 1) * stepY + (stepY / 2);

              return (
                <g key={stringIdx}>
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={8.5} 
                    className="fill-blue-500/10 dark:fill-blue-400/10" 
                  />
                  <circle 
                    cx={x} 
                    cy={y} 
                    r={5.5} 
                    className="fill-blue-600 dark:fill-blue-400 stroke-white dark:stroke-zinc-950" 
                    strokeWidth={1.5}
                  />
                  <text 
                    x={x} 
                    y={y + 2} 
                    fontSize="7px" 
                    fontWeight="black" 
                    className="fill-white dark:fill-zinc-950 font-bold" 
                    textAnchor="middle"
                  >
                    {fretVal}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Profile description labels */}
      <div className="bg-zinc-150/40 dark:bg-zinc-900/60 shadow-sm border border-zinc-200/40 dark:border-zinc-800/40 rounded-2xl p-3.5 space-y-2 text-left">
        <div>
          <span className="text-[8px] font-mono font-bold text-blue-500 uppercase tracking-widest block">PERFIL EMOCIONAL</span>
          <p className="text-[10px] italic text-zinc-700 dark:text-zinc-300 font-sans leading-relaxed mt-1">
            "{emo.feels}"
          </p>
        </div>
        <div className="border-t dark:border-zinc-800/30 pt-2">
          <span className="text-[8px] font-mono font-bold text-purple-400 uppercase tracking-widest block">USO EN RITOS</span>
          <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 leading-normal mt-0.5">
            {emo.sacred}
          </p>
        </div>
        <div className="border-t dark:border-zinc-800/30 pt-1.5 flex items-center justify-between text-[8px] text-zinc-450 font-mono">
          <span>{['E', 'A', 'D', 'G', 'B', 'e'].join(' • ')}</span>
          <span className="text-zinc-400 dark:text-zinc-500">Mudo: X • Aire: O</span>
        </div>
      </div>
    </div>
  );
};

// Custom layout-safe path icon for chapter 9
const InteractivePathIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 14 }) => {
  return (
    <svg 
      className={className} 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9Z" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
};

// SoundWave component representing audio actively playing
export const SoundWave: React.FC<{ size?: 'xs' | 'sm' | 'md' }> = ({ size = 'md' }) => {
  const barClass = "bg-blue-600 dark:bg-blue-400 rounded-full w-[3px]";
  const containerHeight = size === 'xs' ? "h-3" : size === 'sm' ? "h-4" : "h-6";
  const gap = size === 'xs' ? "gap-[1px]" : "gap-[2px]";
  const barWidth = size === 'xs' ? "w-[2px]" : "w-[3px]";
  const scale = size === 'xs' ? "scale-75 origin-bottom" : "";
  return (
    <div className={`flex items-end ${gap} ${containerHeight} ${scale}`} aria-hidden="true">
      <style>{`
        @keyframes manualSoundWave1 {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
        @keyframes manualSoundWave2 {
          0%, 100% { height: 6px; }
          50% { height: 22px; }
        }
        @keyframes manualSoundWave3 {
          0%, 100% { height: 3px; }
          50% { height: 12px; }
        }
        @keyframes manualSoundWave4 {
          0%, 100% { height: 5px; }
          50% { height: 18px; }
        }
        .manual-wave-bar-1 { animation: manualSoundWave1 0.7s ease-in-out infinite; }
        .manual-wave-bar-2 { animation: manualSoundWave2 0.8s ease-in-out infinite 0.1s; }
        .manual-wave-bar-3 { animation: manualSoundWave3 0.6s ease-in-out infinite 0.2s; }
        .manual-wave-bar-4 { animation: manualSoundWave4 0.75s ease-in-out infinite 0.05s; }
      `}</style>
      <div className={`${barClass} ${barWidth} manual-wave-bar-1`} style={{ height: '6px' }} />
      <div className={`${barClass} ${barWidth} manual-wave-bar-2`} style={{ height: '11px' }} />
      <div className={`${barClass} ${barWidth} manual-wave-bar-3`} style={{ height: '4px' }} />
      <div className={`${barClass} ${barWidth} manual-wave-bar-4`} style={{ height: '8px' }} />
    </div>
  );
};

export default HarmonyManual;
