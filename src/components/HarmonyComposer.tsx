// Harmonic Composition Workshop - Módulo B
// REQ-CMP-01 to REQ-CMP-09: Composition timeline, step-by-step assistant, phases and emotions.

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Square, Plus, Trash2, Copy, Sparkles, AlertCircle, Compass, HelpCircle, ArrowUpRight, ArrowDownRight, RefreshCw, Save, FileSpreadsheet, Eye, Music, Edit2, Volume2, ArrowLeft, ArrowRight, ChevronDown, Check, MoreVertical, Clock } from 'lucide-react';
import { PitchClass, Quality, Chord, Tool, Slot, Composition, getCandidates, getAllCandidates, getKeepMoodCandidates, getRootVariations, computePhase, analyzeGesture, getChordString, getPitchClassName, getDefaultAstralFor, getDiatonicLadder, parseChordString, SongExportAdapter, mod12, parsePitchClass } from '../lib/harmonyEngine';
import { audioEngine, getVoicingForChord, RHYTHM_PATTERNS } from '../services/audioEngine';
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

// Curated, human-friendly emotion buckets for the Simple mode. Each maps to one
// or more internal taxonomy ids (Appendix D).
interface EmotionGroup { id: string; es: string; en: string; emoji: string; emotions: string[]; }
const EMOTION_GROUPS: EmotionGroup[] = [
  { id: 'esperanza', es: 'Esperanza / Luz', en: 'Hope / Light', emoji: '☀️', emotions: ['luminoso', 'asombro'] },
  { id: 'calma', es: 'Calma / Serenidad', en: 'Calm / Serenity', emoji: '🍃', emotions: ['serenidad', 'aire'] },
  { id: 'tristeza', es: 'Tristeza dulce', en: 'Sweet sadness', emoji: '🌙', emotions: ['melancolico', 'nostalgia'] },
  { id: 'tension', es: 'Tensión', en: 'Tension', emoji: '⚡', emotions: ['tension', 'suspenso'] },
  { id: 'misterio', es: 'Misterio', en: 'Mystery', emoji: '🔮', emotions: ['misterio', 'profundidad'] },
  { id: 'asombro', es: 'Asombro / Épico', en: 'Awe / Epic', emoji: '✨', emotions: ['asombro'] },
  { id: 'flotar', es: 'Flotar / Sueño', en: 'Floating / Dream', emoji: '🎈', emotions: ['ingravidez', 'hipnotico'] },
  { id: 'fuerza', es: 'Fuerza / Empuje', en: 'Drive / Push', emoji: '🚀', emotions: ['empuje'] }
];

// Plain-language description of where the progression currently is (by quality).
const CHORD_MOOD: Record<string, { es: string; en: string }> = {
  major: { es: 'luminoso y estable', en: 'bright and stable' },
  minor: { es: 'sombrío e íntimo, con una pregunta abierta', en: 'dark and intimate, with an open question' },
  dom7: { es: 'con ganas de resolver, empuje', en: 'wants to resolve, driving' },
  maj7: { es: 'dulce y soñador', en: 'sweet and dreamy' },
  min7: { es: 'melancolía cálida y suave', en: 'warm, soft melancholy' },
  aug: { es: 'extraño, suspendido, ingrávido', en: 'strange, suspended, weightless' },
  dim: { es: 'tenso e inestable', en: 'tense and unstable' },
  dim7: { es: 'muy tenso, a punto de girar', en: 'very tense, about to turn' },
  sus2: { es: 'abierto y aireado, sin definir', en: 'open and airy, undefined' },
  sus4: { es: 'expectante, en suspenso', en: 'expectant, suspended' },
  add9: { es: 'luminoso con un brillo extra', en: 'bright with extra shimmer' },
  six: { es: 'dulce y nostálgico, vintage', en: 'sweet and nostalgic, vintage' },
  min7b5: { es: 'inquietante, a la deriva', en: 'uneasy, adrift' }
};

// Song sections (parts) for the timeline.
const SECTION_PRESETS = ['Intro', 'Verso', 'Pre', 'Estribillo', 'Puente', 'Solo', 'Outro'];
const DEFAULT_SECTION = 'Parte 1';

interface ToolInfo {
  id: Tool;
  name: string;
  nameEn: string;
  desc: string;
  descEn: string;
  emotions: string[];
  astralRange: string;
}

const TOOLS_INFO: ToolInfo[] = [
  { id: 'diatonic', name: 'Escalera Diatónica', nameEn: 'Diatonic Ladder', desc: 'Acordes naturales de la tonalidad actual.', descEn: 'Natural chords of the current key.', emotions: ['luminoso', 'serenidad'], astralRange: '1' },
  { id: 'augmentedPortal', name: 'Portal Aumentado', nameEn: 'Augmented Portal', desc: 'La simetría del acorde aumentado abre puertas a mundos de ensueño.', descEn: 'The symmetry of the augmented chord opens doors to dreamlike worlds.', emotions: ['ingravidez', 'asombro'], astralRange: '3-4' },
  { id: 'diminishedBridge', name: 'Puente Disminuido', nameEn: 'Diminished Bridge', desc: 'Tensión cromática pasajera para resolver con fuerza.', descEn: 'Passing chromatic tension that resolves with strength.', emotions: ['tension', 'suspenso'], astralRange: '3' },
  { id: 'chromaticMediant', name: 'Mediantes Cromáticas', nameEn: 'Chromatic Mediants', desc: 'Movimientos a terceras que cambian el color de golpe.', descEn: 'Moves by thirds that suddenly change the color.', emotions: ['asombro', 'profundidad', 'nostalgia'], astralRange: '3' },
  { id: 'modalColor', name: 'Color Modal', nameEn: 'Modal Color', desc: 'Notas flotantes y drones vamps para un viaje místico.', descEn: 'Floating notes and drone vamps for a mystical journey.', emotions: ['hipnotico', 'aire'], astralRange: '0-1' },
  { id: 'cadence', name: 'Cadencia', nameEn: 'Cadence', desc: 'Resoluciones clásicas (V, IV) que cierran o afianzan la tonalidad.', descEn: 'Classic resolutions (V, IV) that close or anchor the key.', emotions: ['luminoso', 'serenidad'], astralRange: '1-2' },
  { id: 'free', name: 'Libre (Cualquiera)', nameEn: 'Free (Any)', desc: 'Exploración abierta sin reglas asignadas.', descEn: 'Open exploration with no assigned rules.', emotions: ['libre'], astralRange: '0-4' }
];

interface HarmonyComposerProps {
  onExportToSong?: (songTitle: string, songContent: string) => void;
  seed?: { title: string; chords: string[] } | null;
  onSeedConsumed?: () => void;
  lang?: 'es' | 'en';
}

export const HarmonyComposer: React.FC<HarmonyComposerProps> = ({ onExportToSong, seed, onSeedConsumed, lang = 'es' }) => {
  const tr = (es: string, en: string) => (lang === 'en' ? en : es);
  const PHASE_EN: Record<string, string> = { 'Anclaje': 'Anchor', 'Apertura': 'Opening', 'Elevación': 'Rise', 'Portal': 'Portal', 'Cima': 'Peak', 'Retorno': 'Return' };
  const TREND_EN: Record<string, string> = { 'subiendo': 'rising', 'bajando': 'falling', 'sostenido': 'steady', '—': '—' };
  const trPhase = (p: string) => (lang === 'en' ? (PHASE_EN[p] || p) : p);
  const trTrend = (t: string) => (lang === 'en' ? (TREND_EN[t] || t) : t);
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [activePlaySlotIdx, setActivePlaySlotIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const isLoopingRef = useRef(false);

  // Editor states
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [selectedTool, setSelectedTool] = useState<Tool>('diatonic');
  
  // Custom dialog flags
  const [editSlotIdx, setEditSlotIdx] = useState<number | null>(null);
  const [tempLyric, setTempLyric] = useState('');
  const [editKeyModal, setEditKeyModal] = useState(false);
  const [menuSlotIdx, setMenuSlotIdx] = useState<number | null>(null);
  // Simple (emotion-first) mode
  const [wizardMode, setWizardMode] = useState<'simple' | 'advanced'>('simple');
  const [simpleStep, setSimpleStep] = useState<'choose' | 'list' | 'freeNotes' | 'freeQualities'>('choose');
  const [simpleList, setSimpleList] = useState<any[]>([]);
  const [simpleTitle, setSimpleTitle] = useState('');
  const [freeRoot, setFreeRoot] = useState<number | null>(null);
  // Sections
  const [collapsedSecs, setCollapsedSecs] = useState<Set<number>>(new Set());
  const [sectionMenu, setSectionMenu] = useState<number | null>(null);
  const [renameSec, setRenameSec] = useState<{ start: number; end: number; value: string } | null>(null);
  const [addSectionPicker, setAddSectionPicker] = useState(false);
  const [pendingInsertIdx, setPendingInsertIdx] = useState<number | null>(null);
  const [pendingSection, setPendingSection] = useState<string | null>(null);

  const playTimerRef = useRef<number | null>(null);
  const playIdxRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);
  const playEndRef = useRef<number>(0);
  const saveTimerRef = useRef<number | null>(null);

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

  // REQ-MAN-04: "Abrir en el Compositor" — build a composition from a seed progression.
  useEffect(() => {
    if (!seed || !seed.chords || seed.chords.length === 0) return;
    let prev: Chord | null = null;
    const slots: Slot[] = seed.chords.map((cs, i) => {
      const chord = parseChordString(cs) || { root: 0, quality: 'major' as Quality };
      let gesture: string | null = 'Punto de partida';
      let emotion = 'libre';
      let astral = getDefaultAstralFor(chord.quality);
      if (prev) {
        const a = analyzeGesture(prev, chord);
        gesture = a.gesture; emotion = a.emotion; astral = a.astral;
      }
      prev = chord;
      return {
        id: `seed_${Date.now()}_${i}`,
        chord, durationBeats: 4,
        toolUsed: (i === 0 ? 'free' : 'diatonic') as Tool,
        gesture, emotion, astralLevel: astral,
        voicing: getVoicingForChord(chord)
      };
    });

    const newComp = {
      title: seed.title || 'Receta del Manual',
      key: { tonic: slots[0]?.chord.root ?? 0, mode: 'major' as const },
      tempo: { bpm: 80, timeSignature: [4, 4] as [number, number] },
      defaultArticulation: 'strum' as const,
      rhythmPatternId: 'balada',
      instrument: 'guitar' as const,
      slots,
      meta: {
        createdWith: 'CanindeSong/Utilitarios', specVersion: '1.0',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
    };

    addDoc(collection(db, 'compositions'), { ...newComp, userId })
      .then(ref => setSelectedCompId(ref.id))
      .catch(e => console.error('Error creando maqueta desde el Manual', e))
      .finally(() => onSeedConsumed?.());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

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
    setCompositions(prev => prev.map(c => c.id === currentComp.id ? updated : c));
    // REQ-NFR-02: debounce de escrituras a Firestore (evita un write por pulsación)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => handleSaveComposition(updated), 600);
  };

  // 10. Compute phase and coverage indicators
  const phaseInfo = currentComp ? computePhase(currentComp.slots) : null;

  // Wizard flow: ADD chord
  const openAddChordFlow = () => {
    if (!currentComp) return;
    // REQ-CMP-02: el primer acorde se elige libremente desde la escalera del tono.
    setSelectedTool('diatonic');
    setWizardStep(currentComp.slots.length === 0 ? 2 : 1);
    setSimpleStep('choose');
    setFreeRoot(null);
    setIsWizardOpen(true);
  };

  // ----- Simple (emotion-first) mode helpers -----
  const lastChord = currentComp && currentComp.slots.length > 0
    ? currentComp.slots[currentComp.slots.length - 1].chord
    : null;

  const describeChord = (c: Chord) => {
    const m = CHORD_MOOD[c.quality];
    return m ? (lang === 'en' ? m.en : m.es) : '';
  };

  const enterKeepMood = () => {
    if (!currentComp || !lastChord) return;
    setSimpleList(getKeepMoodCandidates(lastChord, currentComp.key));
    setSimpleTitle(tr('Mantener el clima', 'Keep the mood'));
    setSimpleStep('list');
  };

  const enterEmotionGroup = (group: EmotionGroup) => {
    if (!currentComp || !lastChord) return;
    const all = getAllCandidates(lastChord, currentComp.key);
    const filtered = all.filter(c => group.emotions.includes(c.emotion));
    setSimpleList(filtered.length > 0 ? filtered : all.slice(0, 6));
    setSimpleTitle(lang === 'en' ? group.en : group.es);
    setSimpleStep('list');
  };

  const enterFreeQualities = (root: number) => {
    setFreeRoot(root);
    setSimpleStep('freeQualities');
  };

  // ----- Sections -----
  const sectionRuns: { name: string; start: number; end: number }[] = [];
  if (currentComp) {
    currentComp.slots.forEach((s, i) => {
      const name = s.section || DEFAULT_SECTION;
      const last = sectionRuns[sectionRuns.length - 1];
      if (last && last.name === name) last.end = i;
      else sectionRuns.push({ name, start: i, end: i });
    });
  }

  const openAddToSection = (run: { name: string; end: number }) => {
    setPendingSection(run.name);
    setPendingInsertIdx(run.end + 1);
    setSelectedTool('diatonic');
    setWizardStep(1);
    setSimpleStep('choose');
    setFreeRoot(null);
    setIsWizardOpen(true);
  };

  const chooseNewSection = (name: string) => {
    setAddSectionPicker(false);
    setPendingSection(name);
    setPendingInsertIdx(null);
    setSelectedTool('diatonic');
    setWizardStep(currentComp && currentComp.slots.length === 0 ? 2 : 1);
    setSimpleStep('choose');
    setFreeRoot(null);
    setIsWizardOpen(true);
  };

  const duplicateSectionRun = (run: { start: number; end: number }) => {
    if (!currentComp) return;
    const block = currentComp.slots.slice(run.start, run.end + 1).map((s, k) => ({ ...s, id: 'dup_' + Date.now() + '_' + k }));
    const arr = [...currentComp.slots];
    arr.splice(run.end + 1, 0, ...block);
    recalculateAllSlotsGestures(arr);
    setSectionMenu(null);
  };

  const deleteSectionRun = (run: { start: number; end: number }) => {
    if (!currentComp) return;
    const arr = currentComp.slots.filter((_, i) => i < run.start || i > run.end);
    recalculateAllSlotsGestures(arr);
    setSectionMenu(null);
  };

  const moveSectionRun = (runIndex: number, dir: 'up' | 'down') => {
    if (!currentComp) return;
    const target = runIndex + (dir === 'up' ? -1 : 1);
    if (target < 0 || target >= sectionRuns.length) return;
    const a = sectionRuns[Math.min(runIndex, target)];
    const b = sectionRuns[Math.max(runIndex, target)];
    const before = currentComp.slots.slice(0, a.start);
    const blockA = currentComp.slots.slice(a.start, a.end + 1);
    const between = currentComp.slots.slice(a.end + 1, b.start);
    const blockB = currentComp.slots.slice(b.start, b.end + 1);
    const after = currentComp.slots.slice(b.end + 1);
    recalculateAllSlotsGestures([...before, ...blockB, ...between, ...blockA, ...after]);
    setSectionMenu(null);
  };

  const applyRenameSection = () => {
    if (!currentComp || !renameSec) return;
    const name = renameSec.value.trim() || DEFAULT_SECTION;
    const arr = currentComp.slots.map((s, i) => (i >= renameSec.start && i <= renameSec.end ? { ...s, section: name } : s));
    updateCurrentComp({ slots: arr });
    setRenameSec(null);
  };

  const toggleCollapse = (start: number) => {
    setCollapsedSecs(prev => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start); else next.add(start);
      return next;
    });
  };

  // Reusable candidate card (used by advanced step 2 and the simple lists).
  const renderCandidate = (cand: any, idx: number) => {
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
            <p className="text-[9px] text-zinc-400 font-mono italic mt-0.5">{cand.gesture}</p>
          </div>
          <span className="text-lg">{emo.emoji}</span>
        </div>

        <p className="text-[10px] text-zinc-500 pr-8 leading-snug">{cand.rationale}</p>

        <div className="flex justify-between items-center border-t border-zinc-100 dark:border-zinc-800 pt-2.5 bg-transparent gap-1">
          {cand.role && (
            <span className="text-[9px] font-bold font-mono text-zinc-400 truncate">{cand.role}</span>
          )}
          <span className="text-[10px] ml-auto font-mono text-zinc-400 flex items-center gap-1">
            {cand.direction === 'up' && <ArrowUpRight size={11} className="text-green-500" />}
            {cand.direction === 'down' && <ArrowDownRight size={11} className="text-amber-500" />}
            ✨ {cand.astralLevel}
          </span>
        </div>

        <button
          onClick={(e) => handlePreviewCandidate(cand, e)}
          className="absolute bottom-3 right-3 p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500"
          title={tr('Oír sugerencia', 'Hear suggestion')}
        >
          <Volume2 size={13} />
        </button>
      </div>
    );
  };

  const handleSelectTool = (tool: Tool) => {
    setSelectedTool(tool);
    setWizardStep(2);
  };

  // Fetch candidate options corresponding to selected tool & current tail chord
  const getWizardCandidates = () => {
    if (!currentComp) return [];
    if (currentComp.slots.length === 0) {
      // Primer acorde: ofrecer la escalera diatónica del tono (REQ-CMP-02)
      return getDiatonicLadder(currentComp.key.tonic, currentComp.key.mode).map(item => ({
        chord: item.chord, tool: 'free' as Tool, gesture: 'Punto de partida',
        emotion: 'libre', astralLevel: getDefaultAstralFor(item.chord.quality),
        direction: 'steady' as const, rationale: `Grado ${item.roman}`, role: item.roman
      }));
    }
    const lastSlot = currentComp.slots[currentComp.slots.length - 1];
    return getCandidates(selectedTool, lastSlot.chord, currentComp.key);
  };

  // Append slot dynamically on candidate pick
  const handleSelectCandidate = (cand: any) => {
    if (!currentComp) return;
    const slots = currentComp.slots;
    const sectionLabel = pendingSection ?? (slots.length > 0 ? (slots[slots.length - 1].section || DEFAULT_SECTION) : DEFAULT_SECTION);
    const newSlot: Slot = {
      id: 'slot_' + Date.now() + '_' + slots.length,
      chord: cand.chord,
      durationBeats: 4,
      toolUsed: cand.tool,
      gesture: cand.gesture,
      emotion: cand.emotion,
      astralLevel: cand.astralLevel,
      voicing: getVoicingForChord(cand.chord),
      section: sectionLabel
    };

    if (pendingInsertIdx !== null) {
      const arr = [...slots];
      arr.splice(pendingInsertIdx, 0, newSlot);
      recalculateAllSlotsGestures(arr);
    } else {
      updateCurrentComp({ slots: [...slots, newSlot] });
    }
    setPendingInsertIdx(null);
    setPendingSection(null);
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
    const art = currentComp?.defaultArticulation || 'strum';
    // REQ-CMP-04: oír la transición en contexto (acorde anterior -> candidato)
    const lastSlot = currentComp?.slots[currentComp.slots.length - 1];
    if (lastSlot) {
      audioEngine.scheduleChord(lastSlot.voicing || getVoicingForChord(lastSlot.chord), 0, { articulation: art });
      audioEngine.scheduleChord(getVoicingForChord(cand.chord), 0.85, { articulation: art });
    } else {
      audioEngine.scheduleChord(getVoicingForChord(cand.chord), 0, { articulation: art });
    }
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
    // Devuelve slots nuevos (sin mutar el estado existente).
    const recalculated = slotsList.map((slot, i) => {
      let out: Slot;
      if (i === 0) {
        out = { ...slot, gesture: 'Punto de partida', emotion: 'libre', astralLevel: getDefaultAstralFor(slot.chord.quality) };
      } else {
        const g = analyzeGesture(prev as Chord, slot.chord, currentComp.key);
        out = { ...slot, gesture: g.gesture, emotion: g.emotion, astralLevel: g.astral };
      }
      prev = slot.chord;
      return out;
    });

    updateCurrentComp({ slots: recalculated });
  };

  // REQ-CMP-06: editar duración (cicla 2 -> 4 -> 8 beats)
  const handleCycleDuration = (idx: number) => {
    if (!currentComp) return;
    const cycle = [2, 4, 8];
    const nextSlots = currentComp.slots.map((s, i) => {
      if (i !== idx) return s;
      const next = cycle[(cycle.indexOf(s.durationBeats) + 1) % cycle.length] ?? 4;
      return { ...s, durationBeats: next };
    });
    updateCurrentComp({ slots: nextSlots });
  };

  const handleSaveLyrics = () => {
    if (editSlotIdx === null || !currentComp) return;
    const nextSlots = [...currentComp.slots];
    nextSlots[editSlotIdx].lyric = tempLyric;
    updateCurrentComp({ slots: nextSlots });
    setEditSlotIdx(null);
  };

  // Timeline playback scheduler (REQ-CMP-07). Plays slots [start, end).
  const startPlayback = (start = 0, end?: number) => {
    if (!currentComp || currentComp.slots.length === 0) return;
    audioEngine.init();
    audioEngine.stopAll();
    if (playTimerRef.current) clearTimeout(playTimerRef.current);

    const stop = end ?? currentComp.slots.length;
    setIsPlaying(true);
    isLoopingRef.current = isLooping;
    playStartRef.current = start;
    playEndRef.current = stop;
    playIdxRef.current = start;
    setActivePlaySlotIdx(start);

    const msPerBeat = (60 / currentComp.tempo.bpm) * 1000;

    const playNext = () => {
      let idx = playIdxRef.current;
      if (!currentComp || idx >= playEndRef.current) {
        if (isLoopingRef.current) {
          idx = playStartRef.current;
          playIdxRef.current = idx;
        } else {
          handleStopComposition();
          return;
        }
      }

      const slot = currentComp.slots[idx];
      if (!slot) { handleStopComposition(); return; }
      setActivePlaySlotIdx(idx);

      // Trigger the slot with its rhythm pattern (Apéndice B)
      const voicing = slot.voicing || getVoicingForChord(slot.chord);
      const effArt = slot.articulation || currentComp.defaultArticulation;
      const patId = effArt === 'arpeggio' ? 'arpegio_pima' : (slot.rhythmPatternId || currentComp.rhythmPatternId);
      const pattern = RHYTHM_PATTERNS[patId] || RHYTHM_PATTERNS['balada'];
      audioEngine.scheduleRhythm(voicing, pattern, currentComp.tempo.bpm, slot.durationBeats);

      if (currentComp.rhythmPatternId === 'drone_lento') {
        audioEngine.triggerDrone(40 + currentComp.key.tonic, true);
      }

      playIdxRef.current = idx + 1;
      playTimerRef.current = window.setTimeout(playNext, slot.durationBeats * msPerBeat);
    };

    playNext();
  };

  const handlePlayComposition = () => {
    if (isPlaying) { handleStopComposition(); return; }
    startPlayback(0);
  };
  const playFromIndex = (idx: number) => { handleStopComposition(); startPlayback(idx); };
  const playSection = (start: number, end: number) => { handleStopComposition(); startPlayback(start, end); };

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
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest font-mono">{tr('Taller de Composición', 'Composition Workshop')}</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={currentComp?.title || ''}
                onChange={(e) => updateCurrentComp({ title: e.target.value })}
                className="text-xl font-extrabold bg-transparent border-none p-0 focus:ring-0 outline-none w-56 font-sans text-zinc-900 dark:text-zinc-100"
                placeholder={tr('Nombre de la composición', 'Composition name')}
              />
              <button onClick={() => setEditKeyModal(true)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-bold flex items-center gap-1 text-zinc-500">
                <Music size={12} /> {currentTonicLabel} {currentComp?.key.mode === 'minor' ? tr('Menor', 'Minor') : tr('Mayor', 'Major')}
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
            <Plus size={14} /> {tr('Nueva Maqueta', 'New Draft')}
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
                {isPlaying ? tr('Detener', 'Stop') : tr('Reproducir', 'Play')}
              </button>
              <button
                onClick={() => { setIsLooping(v => { isLoopingRef.current = !v; return !v; }); }}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border ${isLooping ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-zinc-500 border-zinc-200 dark:border-zinc-700'}`}
                title="Repetir en bucle"
              >
                <RefreshCw size={14} /> Loop
              </button>
            </div>

            {/* Tempo */}
            <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <span className="text-[10px] font-bold text-zinc-500 uppercase px-2 font-mono">{tr('Tempo', 'Tempo')}</span>
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

            {/* Time signature (compás) */}
            <select
              value={currentComp.tempo.timeSignature.join('/')}
              onChange={(e) => {
                const [n, d] = e.target.value.split('/').map(Number);
                updateCurrentComp({ tempo: { ...currentComp.tempo, timeSignature: [n, d] } });
              }}
              className="py-1.5 px-3 rounded-xl border-none outline-none text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            >
              {['4/4', '3/4', '6/8', '2/4'].map(ts => (
                <option key={ts} value={ts}>Compás {ts}</option>
              ))}
            </select>

            {/* Articulation */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button
                onClick={() => updateCurrentComp({ defaultArticulation: 'strum' })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${currentComp.defaultArticulation === 'strum' ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm' : 'text-zinc-500'}`}
              >
                {tr('Rasgueo', 'Strum')}
              </button>
              <button
                onClick={() => updateCurrentComp({ defaultArticulation: 'arpeggio' })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${currentComp.defaultArticulation === 'arpeggio' ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm' : 'text-zinc-500'}`}
              >
                {tr('Arpegio', 'Arpeggio')}
              </button>
            </div>

            {/* Rhythm */}
            <select
              value={currentComp.rhythmPatternId}
              onChange={(e) => updateCurrentComp({ rhythmPatternId: e.target.value })}
              className="py-1.5 px-3 rounded-xl border-none outline-none text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            >
              {Object.values(RHYTHM_PATTERNS)
                .filter(p => p.id !== 'arpegio_pima')
                .map(p => (
                  <option key={p.id} value={p.id}>{tr('Ritmo', 'Rhythm')}: {p.name}</option>
                ))}
            </select>

            <div className="flex-1" />

            {/* Export Trigger */}
            {onExportToSong && (
              <button
                onClick={triggerExport}
                className="px-4 py-2 bg-zinc-800 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 transition-colors"
                title={tr('Exportar como canción a la biblioteca', 'Export as a song to the library')}
              >
                <FileSpreadsheet size={14} /> {tr('Exportar como Canción', 'Export as Song')}
              </button>
            )}
          </div>

          {/* Timeline Row */}
          <div className="border border-dashed border-zinc-200 dark:border-zinc-800 p-4 rounded-3xl min-h-[140px] w-full select-none space-y-3">
            {currentComp.slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center w-full space-y-3 py-8">
                <Compass className="text-zinc-300 dark:text-zinc-700 w-12 h-12 animate-bounce" />
                <p className="text-xs text-zinc-400 font-medium">{tr('No hay acordes todavía. Comienza tocando el botón de abajo.', 'No chords yet. Start by tapping the button below.')}</p>
                <button
                  onClick={openAddChordFlow}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/10"
                >
                  {tr('Agregar Primer Acorde', 'Add First Chord')}
                </button>
              </div>
            ) : (
              <>
                {sectionRuns.map((run, runIdx) => {
                  const collapsed = collapsedSecs.has(run.start);
                  return (
                    <div key={run.start} className="rounded-2xl bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3">
                      {/* Section header */}
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <button onClick={() => toggleCollapse(run.start)} className="flex items-center gap-1.5 min-w-0">
                          <ChevronDown size={14} className={`transition-transform shrink-0 text-zinc-400 ${collapsed ? '-rotate-90' : ''}`} />
                          <span className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300 truncate">{run.name}</span>
                          <span className="text-[9px] text-zinc-400 font-mono shrink-0">({run.end - run.start + 1})</span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => playSection(run.start, run.end + 1)} title={tr('Reproducir sección', 'Play section')} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"><Play size={13} /></button>
                          <button onClick={() => setSectionMenu(runIdx)} title={tr('Opciones de sección', 'Section options')} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"><MoreVertical size={14} /></button>
                        </div>
                      </div>

                      {/* Chips (wrap) */}
                      {!collapsed && (
                        <div className="flex flex-wrap items-center gap-2">
                          {currentComp.slots.slice(run.start, run.end + 1).map((slot, k) => {
                            const i = run.start + k;
                            const emo = EMOTIONS[slot.emotion || 'libre'] || { emoji: '⭐' };
                            const active = activePlaySlotIdx === i;
                            return (
                              <button
                                key={slot.id}
                                onClick={() => setMenuSlotIdx(i)}
                                title={slot.gesture || ''}
                                className={`relative flex flex-col items-center justify-center w-[clamp(3.5rem,18vw,5rem)] h-[3.625rem] rounded-xl border transition-all ${active ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-400'}`}
                              >
                                <span className="text-sm font-black font-mono text-zinc-900 dark:text-white leading-none">{getChordString(slot.chord)}</span>
                                <span className="text-[13px] leading-none mt-1">{emo.emoji}</span>
                                <span className="absolute bottom-0.5 right-1 text-[8px] font-mono text-zinc-400">✨{slot.astralLevel}</span>
                                {slot.lyric && <span className="absolute bottom-0.5 left-1 text-[8px] text-blue-400">♪</span>}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => openAddToSection(run)}
                            title={tr('Agregar acorde aquí', 'Add chord here')}
                            className="w-[clamp(3.5rem,18vw,5rem)] h-[3.625rem] rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 hover:border-blue-500 hover:text-blue-500 transition-all"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add new section */}
                <button
                  onClick={() => setAddSectionPicker(true)}
                  className="w-full py-2.5 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-blue-500 hover:text-blue-500 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus size={14} /> {tr('Nueva sección', 'New section')}
                </button>
              </>
            )}
          </div>

          {/* 10. Calculations - Phase Indicators (REQ-FAS-01 / REQ-FAS-02) */}
          {phaseInfo && currentComp.slots.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl bg-zinc-100/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800">
              
              {/* Phase and Level Card */}
              <div className="flex flex-col space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">{tr('Arco Astral / Fase', 'Astral Arc / Phase')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black font-sans text-zinc-800 dark:text-zinc-100">
                    {tr('Fase', 'Phase')} {trPhase(phaseInfo.phase)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    {tr('Nivel', 'Level')} {Math.round(phaseInfo.level)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span>{tr('Tendencia:', 'Trend:')}</span>
                  <span className="font-bold flex items-center gap-0.5 uppercase">
                    {phaseInfo.trend === 'subiendo' ? <ArrowUpRight className="text-green-500" size={14} /> : phaseInfo.trend === 'bajando' ? <ArrowDownRight className="text-amber-500" size={14} /> : <RefreshCw className="text-blue-500 font-semibold" size={12} />}
                    {trTrend(phaseInfo.trend)}
                  </span>
                </div>
              </div>

              {/* Progress Target */}
              <div className="flex flex-col space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">{tr('Apuntando hacia', 'Pointing to')}</span>
                <span className="text-lg font-extrabold text-zinc-700 dark:text-zinc-300">
                  {trPhase(phaseInfo.pointingTo)}
                </span>
                <p className="text-[10px] text-zinc-500">
                  {tr('Heurística calculada en base al volumen emocional de los últimos tres acordes.', 'Heuristic based on the emotional volume of the last three chords.')}
                </p>
              </div>

              {/* Target Coverage Meter (REQ-FAS-01) */}
              <div className="flex flex-col space-y-2 justify-center">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{tr('Cobertura del Arco', 'Arc Coverage')}</span>
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
                    <span>{tr('Sección inestable: Te falta aterrizar (Anclaje)', 'Unstable section: you still need to land (Anchor)')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-400 space-y-3">
          <Sparkles className="text-zinc-300 dark:text-zinc-800 w-16 h-16 animate-pulse" />
          <p className="text-sm font-sans">{tr('No tienes ninguna composición creada aún. Toca "Nueva Maqueta" arriba para inaugurar tu taller.', 'You have no compositions yet. Tap "New Draft" above to open your workshop.')}</p>
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
              className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90dvh]"
            >
              
              {/* Header */}
              <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {currentComp && currentComp.slots.length > 0 && (
                    (wizardMode === 'advanced' && wizardStep === 2) ||
                    (wizardMode === 'simple' && simpleStep !== 'choose')
                  ) && (
                    <button
                      onClick={() => {
                        if (wizardMode === 'advanced') setWizardStep(1);
                        else setSimpleStep(simpleStep === 'freeQualities' ? 'freeNotes' : 'choose');
                      }}
                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full shrink-0"
                    >
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <h3 className="text-base font-black font-sans truncate">
                    {currentComp && currentComp.slots.length === 0
                      ? tr('Elige cómo empezar', 'Choose how to start')
                      : wizardMode === 'advanced'
                        ? (wizardStep === 1 ? tr('¿Qué herramienta usar?', 'Which tool?') : tr('Elige tu acorde', 'Choose your chord'))
                        : simpleStep === 'choose' ? tr('¿Hacia dónde quieres ir?', 'Where do you want to go?')
                        : simpleStep === 'freeNotes' ? tr('Elige una nota', 'Choose a note')
                        : simpleStep === 'freeQualities' ? tr('Variaciones', 'Variations')
                        : simpleTitle}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {currentComp && currentComp.slots.length > 0 && (
                    <div className="flex items-center gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                      <button
                        onClick={() => setWizardMode('simple')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold ${wizardMode === 'simple' ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-sm' : 'text-zinc-500'}`}
                      >
                        {tr('Sencillo', 'Simple')}
                      </button>
                      <button
                        onClick={() => setWizardMode('advanced')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold ${wizardMode === 'advanced' ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-sm' : 'text-zinc-500'}`}
                      >
                        {tr('Avanzado', 'Advanced')}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setIsWizardOpen(false)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Content inside Step 1 or Step 2 */}
              <div className="p-6 overflow-y-auto space-y-4">
                {currentComp && currentComp.slots.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
                      <HelpCircle size={11} /> {tr('Elige el acorde inicial desde la escalera del tono.', 'Pick the starting chord from the key ladder.')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {getWizardCandidates().map((cand, idx) => renderCandidate(cand, idx))}
                    </div>
                  </div>
                ) : wizardMode === 'advanced' ? (
                  wizardStep === 1 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TOOLS_INFO.map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => handleSelectTool(tool.id)}
                        className="p-4 bg-zinc-50 hover:bg-zinc-100/50 dark:bg-zinc-900/60 dark:hover:bg-zinc-800 rounded-2xl text-left border border-zinc-200 dark:border-zinc-800/80 transition-all flex flex-col justify-between h-36"
                      >
                        <div>
                          <p className="font-extrabold text-sm text-zinc-800 dark:text-zinc-100">{lang === 'en' ? tool.nameEn : tool.name}</p>
                          <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">{lang === 'en' ? tool.descEn : tool.desc}</p>
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
                      {tr('Acordes Candidatos', 'Candidate Chords')} ({getWizardCandidates().length})
                    </p>
                    <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
                      <HelpCircle size={11} /> {tr('Las emociones son tendencias, no garantías: una guía, no una regla.', 'Emotions are tendencies, not guarantees: a guide, not a rule.')}
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

                            <div className="flex justify-between items-center border-t border-zinc-100 dark:border-zinc-800 pt-2.5 bg-transparent gap-1">
                              {cand.role && (
                                <span className="text-[9px] font-bold font-mono text-zinc-400 truncate">
                                  {cand.role}
                                </span>
                              )}
                              <span className="text-[10px] ml-auto font-mono text-zinc-400 flex items-center gap-1">
                                {cand.direction === 'up' && <ArrowUpRight size={11} className="text-green-500" />}
                                {cand.direction === 'down' && <ArrowDownRight size={11} className="text-amber-500" />}
                                ✨ {cand.astralLevel}
                              </span>
                            </div>

                            {/* Reference plucker button */}
                            <button
                              onClick={(e) => handlePreviewCandidate(cand, e)}
                              className="absolute bottom-3 right-3 p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500"
                              title={tr('Oír sugerencia', 'Hear suggestion')}
                            >
                              <Volume2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  )
                ) : (
                  simpleStep === 'choose' ? (
                    <div className="space-y-4">
                      {lastChord && (
                        <div className="p-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/40 text-center">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-mono block">{tr('Estás en', 'You are on')}</span>
                          <span className="text-lg font-black font-mono text-zinc-900 dark:text-white">{getChordString(lastChord)}</span>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{describeChord(lastChord)}</p>
                        </div>
                      )}
                      <button onClick={enterKeepMood} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold text-sm border border-blue-200/50 dark:border-blue-800/40">
                        🔁 {tr('Mantener el clima', 'Keep the mood')}
                      </button>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono mb-2">{tr('O cambiar la emoción', 'Or change the emotion')}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {EMOTION_GROUPS.map(g => (
                            <button key={g.id} onClick={() => enterEmotionGroup(g)} className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-1 transition-all">
                              <span className="text-2xl">{g.emoji}</span>
                              <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-200 text-center leading-tight">{lang === 'en' ? g.en : g.es}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => setSimpleStep('freeNotes')} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-sm">
                        🎚️ {tr('Elegir yo (libre)', 'Choose myself (free)')}
                      </button>
                      <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
                        <HelpCircle size={11} /> {tr('Las emociones son tendencias, no garantías.', 'Emotions are tendencies, not guarantees.')}
                      </p>
                    </div>
                  ) : simpleStep === 'freeNotes' ? (
                    <div className="grid grid-cols-4 gap-2">
                      {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((n, pitch) => (
                        <button key={n} onClick={() => enterFreeQualities(pitch)} className="py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 font-bold font-mono text-sm hover:border-blue-500 hover:text-blue-600 transition-all">
                          {getPitchClassName(pitch)}
                        </button>
                      ))}
                    </div>
                  ) : simpleStep === 'freeQualities' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {lastChord && freeRoot !== null && getRootVariations(lastChord, freeRoot).map((cand, idx) => renderCandidate(cand, idx))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px] text-zinc-400 italic flex items-center gap-1">
                        <HelpCircle size={11} /> {tr('Las emociones son tendencias, no garantías.', 'Emotions are tendencies, not guarantees.')}
                      </p>
                      {simpleList.length === 0 ? (
                        <p className="text-xs text-zinc-400 text-center py-6">{tr('No encontré opciones claras aquí. Prueba otra emoción o el modo libre.', 'No clear options here. Try another emotion or free mode.')}</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {simpleList.map((cand, idx) => renderCandidate(cand, idx))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Slot action menu (touch-friendly) */}
      <AnimatePresence>
        {menuSlotIdx !== null && currentComp && currentComp.slots[menuSlotIdx] && (() => {
          const idx = menuSlotIdx;
          const s = currentComp.slots[idx];
          const isFirst = idx === 0;
          const isLast = idx === currentComp.slots.length - 1;
          const close = () => setMenuSlotIdx(null);
          const itemCls = 'w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm font-bold text-zinc-700 dark:text-zinc-200 transition-colors';
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={close}>
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 30, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-2"
              >
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-zinc-900 dark:text-white">{getChordString(s.chord)}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">{s.gesture}</span>
                  </div>
                  <button onClick={close} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button disabled={isFirst} onClick={() => { moveSlot(idx, 'left'); close(); }} className={`${itemCls} justify-center disabled:opacity-30`}>
                    <ArrowLeft size={16} /> {tr('Mover izq.', 'Move left')}
                  </button>
                  <button disabled={isLast} onClick={() => { moveSlot(idx, 'right'); close(); }} className={`${itemCls} justify-center disabled:opacity-30`}>
                    <ArrowRight size={16} /> {tr('Mover der.', 'Move right')}
                  </button>
                </div>

                <button onClick={() => { close(); playFromIndex(idx); }} className={itemCls}>
                  <Play size={16} /> {tr('Reproducir desde aquí', 'Play from here')}
                </button>

                <button onClick={() => handleCycleDuration(idx)} className={`${itemCls} justify-between`}>
                  <span className="flex items-center gap-2"><Clock size={16} /> {tr('Duración', 'Duration')}</span>
                  <span className="font-mono text-blue-600">{s.durationBeats} beats →</span>
                </button>

                <button onClick={() => { setEditSlotIdx(idx); setTempLyric(s.lyric || ''); close(); }} className={itemCls}>
                  <Edit2 size={16} /> {s.lyric ? tr('Editar letra', 'Edit lyric') : tr('Añadir letra', 'Add lyric')}
                </button>

                <button onClick={() => { handleDuplicateSlot(idx); close(); }} className={itemCls}>
                  <Copy size={16} /> {tr('Duplicar', 'Duplicate')}
                </button>

                <button onClick={() => { handleDeleteSlot(idx); close(); }} className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 text-sm font-bold transition-colors">
                  <Trash2 size={16} /> {tr('Eliminar', 'Delete')}
                </button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* MODAL: Section options */}
      <AnimatePresence>
        {sectionMenu !== null && sectionRuns[sectionMenu] && (() => {
          const run = sectionRuns[sectionMenu];
          const runIdx = sectionMenu;
          const close = () => setSectionMenu(null);
          const itemCls = 'w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-sm font-bold text-zinc-700 dark:text-zinc-200 transition-colors';
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={close}>
              <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  <span className="text-sm font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-200">{run.name}</span>
                  <button onClick={close} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400">✕</button>
                </div>
                <button onClick={() => { close(); playSection(run.start, run.end + 1); }} className={itemCls}><Play size={16} /> {tr('Reproducir sección', 'Play section')}</button>
                <button onClick={() => { setRenameSec({ start: run.start, end: run.end, value: run.name }); close(); }} className={itemCls}><Edit2 size={16} /> {tr('Renombrar', 'Rename')}</button>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={runIdx === 0} onClick={() => moveSectionRun(runIdx, 'up')} className={`${itemCls} justify-center disabled:opacity-30`}><ArrowUpRight size={16} /> {tr('Subir', 'Up')}</button>
                  <button disabled={runIdx === sectionRuns.length - 1} onClick={() => moveSectionRun(runIdx, 'down')} className={`${itemCls} justify-center disabled:opacity-30`}><ArrowDownRight size={16} /> {tr('Bajar', 'Down')}</button>
                </div>
                <button onClick={() => duplicateSectionRun(run)} className={itemCls}><Copy size={16} /> {tr('Duplicar sección', 'Duplicate section')}</button>
                <button onClick={() => deleteSectionRun(run)} className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 text-sm font-bold transition-colors"><Trash2 size={16} /> {tr('Eliminar sección', 'Delete section')}</button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* MODAL: Rename section */}
      <AnimatePresence>
        {renameSec !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
              <h3 className="text-base font-extrabold mb-4">{tr('Renombrar sección', 'Rename section')}</h3>
              <input
                type="text"
                value={renameSec.value}
                onChange={(e) => setRenameSec({ ...renameSec, value: e.target.value })}
                className="w-full p-3 border-none bg-zinc-100 dark:bg-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-3 text-sm"
                placeholder={tr('Nombre de la sección', 'Section name')}
              />
              <div className="flex flex-wrap gap-1.5 mb-5">
                {SECTION_PRESETS.map(p => (
                  <button key={p} onClick={() => setRenameSec({ ...renameSec, value: p })} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-500 hover:text-blue-600">{p}</button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setRenameSec(null)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">{tr('Cancelar', 'Cancel')}</button>
                <button onClick={applyRenameSection} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">{tr('Guardar', 'Save')}</button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: New section picker */}
      <AnimatePresence>
        {addSectionPicker && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAddSectionPicker(false)}>
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold">{tr('Nueva sección', 'New section')}</h3>
                <button onClick={() => setAddSectionPicker(false)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400">✕</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SECTION_PRESETS.map(p => (
                  <button key={p} onClick={() => chooseNewSection(p)} className="py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 text-xs font-bold text-zinc-600 dark:text-zinc-300 transition-colors">{p}</button>
                ))}
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
              <h3 className="text-base font-extrabold mb-4">{tr('Escribir Letra sobre el Acorde', 'Write Lyric over the Chord')}</h3>
              <input
                type="text"
                value={tempLyric}
                onChange={(e) => setTempLyric(e.target.value)}
                placeholder={tr("Letra de la sección (ej. 'De tu luz...')", "Section lyric (e.g. 'From your light...')")}
                className="w-full p-3 border-none bg-zinc-100 dark:bg-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-6 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditSlotIdx(null)} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                  {tr('Cancelar', 'Cancel')}
                </button>
                <button onClick={handleSaveLyrics} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/10">
                  {tr('Guardar Letra', 'Save Lyric')}
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
              <h3 className="text-base font-extrabold">{tr('Elegir Tonalidad de Maqueta', 'Choose Draft Key')}</h3>

              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">{tr('Nota Tónica', 'Tonic Note')}</label>
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
                <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">{tr('Modo', 'Mode')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateCurrentComp({ key: { ...currentComp.key, mode: 'major' } })}
                    className={`py-2 rounded-xl text-xs font-extrabold border ${currentComp.key.mode === 'major' ? 'border-blue-600 bg-blue-50/50 text-blue-600' : 'border-zinc-200 dark:border-zinc-800'}`}
                  >
                    {tr('Modo Mayor', 'Major')}
                  </button>
                  <button
                    onClick={() => updateCurrentComp({ key: { ...currentComp.key, mode: 'minor' } })}
                    className={`py-2 rounded-xl text-xs font-extrabold border ${currentComp.key.mode === 'minor' ? 'border-blue-600 bg-blue-50/50 text-blue-600' : 'border-zinc-200 dark:border-zinc-800'}`}
                  >
                    {tr('Modo Menor', 'Minor')}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setEditKeyModal(false)}
                className="w-full py-3 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold rounded-xl text-xs"
              >
                {tr('Listo', 'Done')}
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
