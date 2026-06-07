// Pure Harmony Engine and Theory Domain Model
// Corresponds to Section 5, 6 & 10 of the Caminos Armónicos Spec.
// REQ-ARC-01: NO imports of UI or Host dependencies.

export type PitchClass = number; // 0..11, C=0

export type Quality = 
  | 'major' 
  | 'minor' 
  | 'aug' 
  | 'dim' 
  | 'dim7' 
  | 'sus2' 
  | 'sus4' 
  | 'dom7' 
  | 'maj7' 
  | 'min7' 
  | 'add9' 
  | 'six';

export interface Chord {
  root: PitchClass;
  quality: Quality;
  bass?: PitchClass;
}

export type Tool = 
  | 'diatonic' 
  | 'augmentedPortal' 
  | 'diminishedBridge' 
  | 'chromaticMediant' 
  | 'modalColor' 
  | 'cadence' 
  | 'free';

export interface Voicing {
  frets: number[]; // e.g. [-1, 3, 2, 0, 1, 0] for C Major (EADGBE), -1 = mute
  midi?: number[]; // MIDI note values
}

export interface Slot {
  id: string;
  chord: Chord;
  durationBeats: number;
  articulation?: 'strum' | 'arpeggio';
  rhythmPatternId?: string;
  toolUsed: Tool;
  gesture?: string | null;
  emotion?: string | null;
  astralLevel: number; // 0..4
  voicing?: Voicing | null;
  lyric?: string;
}

export interface Composition {
  id: string;
  title: string;
  key: { tonic: PitchClass; mode: 'major' | 'minor' };
  tempo: { bpm: number; timeSignature: [number, number] };
  defaultArticulation: 'strum' | 'arpeggio';
  rhythmPatternId: string;
  instrument: 'guitar';
  slots: Slot[];
  meta: {
    createdWith: string;
    specVersion: string;
    createdAt: string; // ISO String
    updatedAt: string; // ISO String
  };
}

// Semitone intervals from the root (Apéndice A.1)
export const QUALITIES: Record<Quality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  aug: [0, 4, 8],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  add9: [0, 2, 4, 7],
  six: [0, 4, 7, 9]
};

// Map qualities to major/minor/etc class
export function getQualityClass(quality: Quality): 'major' | 'minor' | 'aug' | 'dim' | 'sus' | 'dom' {
  if (['major', 'maj7', 'six', 'add9'].includes(quality)) return 'major';
  if (['minor', 'min7'].includes(quality)) return 'minor';
  if (['dom7'].includes(quality)) return 'dom';
  if (['aug'].includes(quality)) return 'aug';
  if (['dim', 'dim7'].includes(quality)) return 'dim';
  return 'sus'; // sus2, sus4
}

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function notesOf(c: Chord): number[] {
  const intervals = QUALITIES[c.quality] || [0];
  return Array.from(new Set(intervals.map(i => mod12(c.root + i)))).sort((a,b)=>a-b);
}

export function transpose(c: Chord, n: number): Chord {
  return {
    root: mod12(c.root + n),
    quality: c.quality,
    ...(c.bass !== undefined ? { bass: mod12(c.bass + n) } : {})
  };
}

export const major = (r: number): Chord => ({ root: mod12(r), quality: 'major' });
export const minor = (r: number): Chord => ({ root: mod12(r), quality: 'minor' });

export function commonTones(a: Chord, b: Chord): number[] {
  const notesA = notesOf(a);
  const notesB = notesOf(b);
  return notesA.filter(n => notesB.includes(n));
}

// Candidates structures
export interface Candidate {
  chord: Chord;
  tool: Tool;
  gesture: string;
  emotion: string;
  astralLevel: number;
  direction?: 'up' | 'down' | 'steady';
  rationale: string;
  role?: string;
  voicingHint?: Voicing;
}

// DIATONIC DEGREES (Apéndice A.1 / A.2 / A.3)
export interface DiatonicDegree {
  semi: number;
  quality: Quality;
  roman: string;
  fn: 'tonic' | 'sub' | 'dom';
}

export const MAJOR_DEGREES: DiatonicDegree[] = [
  { semi: 0, quality: 'major', roman: 'I', fn: 'tonic' },
  { semi: 2, quality: 'minor', roman: 'ii', fn: 'sub' },
  { semi: 4, quality: 'minor', roman: 'iii', fn: 'tonic' },
  { semi: 5, quality: 'major', roman: 'IV', fn: 'sub' },
  { semi: 7, quality: 'major', roman: 'V', fn: 'dom' },
  { semi: 9, quality: 'minor', roman: 'vi', fn: 'tonic' },
  { semi: 11, quality: 'dim', roman: 'vii°', fn: 'dom' }
];

export const MINOR_DEGREES: DiatonicDegree[] = [
  { semi: 0, quality: 'minor', roman: 'i', fn: 'tonic' },
  { semi: 2, quality: 'dim', roman: 'ii°', fn: 'sub' },
  { semi: 3, quality: 'major', roman: 'III', fn: 'tonic' },
  { semi: 5, quality: 'minor', roman: 'iv', fn: 'sub' },
  { semi: 7, quality: 'minor', roman: 'v', fn: 'dom' },
  { semi: 8, quality: 'major', roman: 'VI', fn: 'sub' },
  { semi: 10, quality: 'major', roman: 'VII', fn: 'dom' }
];

export function getDiatonicLadder(tonic: PitchClass, mode: 'major' | 'minor'): { chord: Chord; roman: string; function: string }[] {
  const table = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
  return table.map(deg => ({
    chord: { root: mod12(tonic + deg.semi), quality: deg.quality },
    roman: deg.roman,
    function: deg.fn
  }));
}

// Voice leading estimation (simples semitones distance between nearest chord notes)
export function estimateVoiceLeadingDistance(a: Chord, b: Chord): number {
  const notesA = notesOf(a);
  const notesB = notesOf(b);
  let totalDistance = 0;
  
  // Greedy assignment to nearest note
  for (const nA of notesA) {
    let minD = 12;
    for (const nB of notesB) {
      const diff = mod12(nB - nA);
      const d = Math.min(diff, 12 - diff);
      if (d < minD) minD = d;
    }
    totalDistance += minD;
  }
  return totalDistance;
}

// 6.7 GESTURE TABLE (ΔRaíz, clase destino) -> emoción / astral
// Map ΔRaíz + "_" + destination_quality_class -> Gesture details
export interface GestureRule {
  id: string;
  name: string;
  emotion: string;
  astral: number;
  text: string;
}

export const GESTURE_TABLE: Record<string, GestureRule> = {
  // ΔRoot = 7, major (dominant V)
  '7_major': { id: 'dominant', name: 'a la dominante (V)', emotion: 'luminoso', astral: 2, text: 'Resolución o impulso hacia la luz.' },
  // ΔRoot = 5, major (subdominant IV)
  '5_major': { id: 'subdominant', name: 'a la subdominante (IV)', emotion: 'serenidad', astral: 1, text: 'Expansión hacia el descanso.' },
  // ΔRoot = 9, minor (relative vi)
  '9_minor': { id: 'relative_minor', name: 'relativo menor (vi)', emotion: 'melancolico', astral: 1, text: 'Transición nostálgica al interior.' },
  // ΔRoot = 4, minor (mediant iii)
  '4_minor': { id: 'diatonic_mediant_iii', name: 'mediante diatónica (iii)', emotion: 'melancolico', astral: 1, text: 'Un brillo melancólico sutil.' },
  // ΔRoot = 2, minor (supertonic ii)
  '2_minor': { id: 'supertonic_ii', name: 'supertónica (ii)', emotion: 'serenidad', astral: 1, text: 'Estabilidad y calma preparatoria.' },
  // ΔRoot = 5, minor (minor subdominant ivb)
  '5_minor': { id: 'minor_subdominant_iv', name: 'subdominante menor (iv)', emotion: 'nostalgia', astral: 3, text: 'Suspiro emotivo y nostálgico.' },
  // ΔRoot = 8, major (flat VI chromatic mediant)
  '8_major': { id: 'chromatic_mediant_flat_vi', name: 'mediante cromática grave (♭VI)', emotion: 'profundidad', astral: 3, text: 'Un descenso hacia lo profundo y místico.' },
  // ΔRoot = 3, major (flat III chromatic mediant)
  '3_major': { id: 'chromatic_mediant_flat_iii', name: 'mediante cromática (♭III)', emotion: 'misterio', astral: 3, text: 'Portal hacia tierras misteriosas.' },
  // ΔRoot = 4, major (III chromatic mediant)
  '4_major': { id: 'chromatic_mediant_iii_m', name: 'mediante cromática alta (III)', emotion: 'asombro', astral: 4, text: 'Brillo y asombro iluminador.' },
  // ΔRoot = 1, major (Neapolitan bII)
  '1_major': { id: 'neapolitan_bii', name: 'napolitana (♭II)', emotion: 'suspenso', astral: 3, text: 'Tensión dramática y extrañeza expresiva.' },
  // ΔRoot = 0, sus (same root)
  '0_sus': { id: 'suspension', name: 'suspensión', emotion: 'aire', astral: 1, text: 'Apertura espacial sin tensión definida.' }
};

// Return default emotion based on chord quality (Appendix A.4)
export function getDefaultEmotionFor(quality: Quality): string {
  const qClass = getQualityClass(quality);
  if (quality === 'maj7') return 'nostalgia'; // nostalgia_luminosa
  if (quality === 'min7') return 'melancolico'; // melancolico_calido
  if (['sus2', 'sus4'].includes(quality)) return 'aire';
  if (quality === 'dom7') return 'empuje';
  if (quality === 'aug') return 'ingravidez';
  if (['dim', 'dim7'].includes(quality)) return 'tension';
  if (qClass === 'major') return 'luminoso';
  return 'melancolico';
}

// Return default astral level based on chord quality (Appendix A.4)
export function getDefaultAstralFor(quality: Quality): number {
  if (['sus2', 'sus4'].includes(quality)) return 0;
  if (['dim', 'dim7', 'aug'].includes(quality)) return 3;
  if (quality === 'dom7') return 2;
  return 1;
}

// Annotation helper to create candidate objects
export function annotate(cur: Chord, target: Chord, tool: Tool, role?: string): Candidate {
  const dRoot = mod12(target.root - cur.root);
  const qClass = getQualityClass(target.quality);
  const keyRule = `${dRoot}_${qClass}`;
  
  let gesture = 'free';
  let gestureName = 'Movimiento libre';
  let emotion = getDefaultEmotionFor(target.quality);
  let astralLevel = getDefaultAstralFor(target.quality);
  let rationale = 'Progresión libre';

  const rule = GESTURE_TABLE[keyRule];
  if (rule) {
    gesture = rule.id;
    gestureName = rule.name;
    emotion = rule.emotion;
    astralLevel = rule.astral;
    rationale = rule.text;
  } else if (target.quality === 'aug') {
    gesture = 'augmentedPortal';
    gestureName = 'Gesto de portal';
    emotion = 'ingravidez';
    astralLevel = 3;
    rationale = 'Conexión cromática del portal aumentado.';
  } else if (['dim', 'dim7'].includes(target.quality)) {
    gesture = 'diminishedBridge';
    gestureName = 'Gesto de puente';
    emotion = 'tension';
    astralLevel = 3;
    rationale = 'Tensión simétrica de paso.';
  } else {
    const dist = estimateVoiceLeadingDistance(cur, target);
    rationale = dist <= 2 ? 'Conducción de voces suave' : 'Salto armónico';
  }

  // Determine relative movement direction
  const shortestMovement = dRoot <= 6 ? dRoot : dRoot - 12;
  const direction = shortestMovement > 0 ? 'up' : shortestMovement < 0 ? 'down' : 'steady';

  return {
    chord: target,
    tool,
    gesture: gestureName,
    emotion,
    astralLevel,
    direction,
    rationale,
    role
  };
}

// 6.2 THE AUGMENTED PORTAL
export function getAugmentedPortalCandidates(cur: Chord): { pivot: Chord; candidates: Candidate[] } {
  let a = cur.root;
  if (cur.quality === 'major') {
    a = cur.root;
  } else if (cur.quality === 'minor') {
    a = mod12(cur.root - 1);
  }
  
  const pivot: Chord = { root: a, quality: 'aug' };
  
  const majors: Chord[] = [major(a), major(a + 4), major(a + 8)];
  const minors: Chord[] = [minor(a + 1), minor(a + 5), minor(a + 9)];
  
  // Filter out the current chord itself so it is not duplicated
  const candidatesRaw = [...majors, ...minors].filter(
    c => !(c.root === cur.root && c.quality === cur.quality)
  );
  
  return {
    pivot,
    candidates: candidatesRaw.map(c => annotate(cur, c, 'augmentedPortal'))
  };
}

// 6.3 THE DIMINISHED BRIDGE
export function getDiminishedBridgeCandidates(cur: Chord): { pivot: Chord; resolutions: Candidate[]; passingTarget: Candidate } {
  const bridgeRoot = mod12(cur.root + 1);
  const pivot: Chord = { root: bridgeRoot, quality: 'dim7' };
  
  // 4 resolution roots based on the symmetric dim7 notes (adding 1 semitone)
  const notes = notesOf(pivot);
  const resolutionsRaw: Chord[] = [];
  
  for (const t of notes) {
    const resRoot = mod12(t + 1);
    resolutionsRaw.push(major(resRoot));
    resolutionsRaw.push(minor(resRoot));
  }
  
  // Exclude current chord
  const resolutions = resolutionsRaw
    .filter(c => !(c.root === cur.root && c.quality === cur.quality))
    .map(c => annotate(cur, c, 'diminishedBridge', 'Resolución'));
    
  // Passing target chord: root+2 major
  const passingTargetChord = major(mod12(cur.root + 2));
  const passingTarget = annotate(cur, passingTargetChord, 'diminishedBridge', 'Paso');
  
  return {
    pivot,
    resolutions,
    passingTarget
  };
}

// 6.4 CHROMATIC MEDIANTS
export function getChromaticMediantCandidates(cur: Chord): Candidate[] {
  const r = cur.root;
  const candidatesRaw: Chord[] = [
    major(r + 4), // +3ª M: asombro
    major(r + 8), // -3ª M: profundidad
    minor(r + 3), // +3ª m: misterio
    minor(r + 9)  // -3ª m: sombra
  ];
  
  return candidatesRaw.map(c => annotate(cur, c, 'chromaticMediant'));
}

// 6.5 DIATONIC NEIGHBORS
export function getDiatonicCandidates(cur: Chord, key: { tonic: PitchClass; mode: 'major' | 'minor' }): Candidate[] {
  const ladder = getDiatonicLadder(key.tonic, key.mode);
  
  // Find current index in diatonic scale
  let i = ladder.findIndex(item => item.chord.root === cur.root && item.chord.quality === cur.quality);
  
  if (i === -1) {
    // If cur is not in scale, search closest diatonic chord by root distance
    let minD = 12;
    let closestIndex = 0;
    ladder.forEach((item, idx) => {
      const d = Math.abs(item.chord.root - cur.root);
      const modularD = Math.min(d, 12 - d);
      if (modularD < minD) {
        minD = modularD;
        closestIndex = idx;
      }
    });
    i = closestIndex;
  }
  
  // Neighbors: standard degrees are i-1, i+1, dominant (index 4), subdominant (index 3)
  const nIndices = [
    mod12(i - 1) % 7,
    mod12(i + 1) % 7,
    4, // Degree V
    3  // Degree IV
  ];
  
  const neighbors: { chord: Chord; roman: string; function: string }[] = [];
  const seenStr = new Set<string>();
  
  for (const idx of nIndices) {
    const item = ladder[idx];
    if (item) {
      const keyStr = `${item.chord.root}_${item.chord.quality}`;
      if (!seenStr.has(keyStr) && !(item.chord.root === cur.root && item.chord.quality === cur.quality)) {
        seenStr.add(keyStr);
        neighbors.push(item);
      }
    }
  }

  return neighbors.map(item => {
    const candidate = annotate(cur, item.chord, 'diatonic');
    candidate.role = `${item.roman} (${item.function})`;
    return candidate;
  });
}

// 6.6 MODAL DRONES / COLORS
export function getModalColorCandidates(droneRoot: PitchClass): Candidate[] {
  // Modal Character Chords (Apéndice A.3)
  const modesData = [
    { mode: 'lydian', chord: { root: droneRoot, quality: 'maj7' as Quality }, label: 'Lydian maj7(#11)' },
    { mode: 'ionian', chord: { root: droneRoot, quality: 'maj7' as Quality }, label: 'Ionian maj7' },
    { mode: 'mixolydian', chord: { root: droneRoot, quality: 'dom7' as Quality }, label: 'Mixolydian dom7' },
    { mode: 'dorian', chord: { root: droneRoot, quality: 'min7' as Quality }, label: 'Dorian min7' },
    { mode: 'dorian_iv', chord: { root: mod12(droneRoot + 5), quality: 'major' as Quality }, label: 'Dorian IV Mayor' },
    { mode: 'aeolian_vi', chord: { root: mod12(droneRoot + 8), quality: 'major' as Quality }, label: 'Aeolian ♭VI' },
    { mode: 'phrygian_bii', chord: { root: mod12(droneRoot + 1), quality: 'major' as Quality }, label: 'Phrygian ♭II' }
  ];
  
  return modesData.map(m => {
    const cand = annotate({ root: droneRoot, quality: 'major' }, m.chord, 'modalColor');
    cand.role = m.label;
    cand.astralLevel = 1; // Mark as low intensity (astral 0-1) for hypnotics
    return cand;
  });
}

// Global query dispatcher
export function getCandidates(tool: Tool, cur: Chord, key: { tonic: PitchClass; mode: 'major' | 'minor' }): Candidate[] {
  switch (tool) {
    case 'augmentedPortal':
      return getAugmentedPortalCandidates(cur).candidates;
    case 'diminishedBridge':
      const bridge = getDiminishedBridgeCandidates(cur);
      return [...bridge.resolutions, bridge.passingTarget];
    case 'chromaticMediant':
      return getChromaticMediantCandidates(cur);
    case 'diatonic':
      return getDiatonicCandidates(cur, key);
    case 'modalColor':
      return getModalColorCandidates(key.tonic);
    default:
      // Cadence & Free fallback: return a mixture of diatonic and mediants
      const diatonic = getDiatonicCandidates(cur, key);
      const chroms = getChromaticMediantCandidates(cur);
      return [...diatonic, ...chroms.slice(0, 2)];
  }
}

// Inverse function: given a list of transitions, analyze a full sequence
export function analyzeGesture(a: Chord, b: Chord, key?: { tonic: PitchClass; mode: 'major' | 'minor' }): { 
  gesture: string; 
  emotion: string; 
  astral: number; 
  rationale: string; 
} {
  const dRoot = mod12(b.root - a.root);
  const qClass = getQualityClass(b.quality);
  const rule = GESTURE_TABLE[`${dRoot}_${qClass}`];
  
  if (rule) {
    return {
      gesture: rule.id,
      emotion: rule.emotion,
      astral: rule.astral,
      rationale: rule.text
    };
  }
  
  // Symmetry fallbacks
  if (b.quality === 'aug') {
    return {
      gesture: 'augmentedPortal',
      emotion: 'ingravidez',
      astral: 3,
      rationale: 'Resolución de portal'
    };
  }
  if (['dim', 'dim7'].includes(b.quality)) {
    return {
      gesture: 'diminishedBridge',
      emotion: 'tension',
      astral: 3,
      rationale: 'Tensión de puente disminuido'
    };
  }
  
  // Voice Leading computation fallback
  const dist = estimateVoiceLeadingDistance(a, b);
  const emotion = getDefaultEmotionFor(b.quality);
  const astral = getDefaultAstralFor(b.quality);
  const rationale = dist <= 2 ? 'movimiento suave' : 'salto';
  
  return {
    gesture: 'free',
    emotion,
    astral,
    rationale
  };
}


// --- 10. CÁLCULO DE FASE 0-4 ---
// Heurística determinista del arco astral e intensidad de progresión (REQ-FAS-01 / REQ-FAS-02)

export interface PhaseResult {
  level: number;       // Current intensity level (0..4)
  phase: string;       // Name of the phase: "Anclaje", "Apertura", "Elevación", "Portal", "Cima"
  trend: 'subiendo' | 'bajando' | 'sostenido' | '—';
  pointingTo: string;  // Next phase target
  coverage: number;    // Arch completeness (0.0 to 1.0)
  peak: number;        // Max intensity reached
}

export const PHASES = ['Anclaje', 'Apertura', 'Elevación', 'Portal', 'Cima'];

// Section 10 thresholds using configurable constants (REQ-FAS-02)
export const PHASE_CONFIG = {
  TREND_THRESHOLD: 0.6,
  HISTORIC_WINDOW: 3
};

export function computePhase(slots: Slot[]): PhaseResult {
  const L = slots.map(s => s.astralLevel);
  
  if (L.length === 0) {
    return {
      level: 0,
      phase: 'Anclaje',
      trend: '—',
      pointingTo: 'Anclaje',
      coverage: 0,
      peak: 0
    };
  }
  
  const cur = L[L.length - 1];
  
  // History window: up to 3 previous items
  const startIdx = Math.max(0, L.length - 1 - PHASE_CONFIG.HISTORIC_WINDOW);
  const win = L.slice(startIdx, L.length - 1);
  
  let base = cur;
  if (win.length > 0) {
    const sum = win.reduce((acc, v) => acc + v, 0);
    base = sum / win.length;
  }
  
  const delta = cur - base;
  let trend: 'subiendo' | 'bajando' | 'sostenido' = 'sostenido';
  
  if (delta > PHASE_CONFIG.TREND_THRESHOLD) {
    trend = 'subiendo';
  } else if (delta < -PHASE_CONFIG.TREND_THRESHOLD) {
    trend = 'bajando';
  }
  
  const peak = Math.max(...L);
  const phaseIdx = Math.min(4, Math.max(0, Math.round(cur)));
  
  let pointingToIdx = phaseIdx;
  if (trend === 'subiendo') {
    pointingToIdx = Math.min(4, phaseIdx + 1);
  } else if (trend === 'bajando') {
    if (cur <= 1) {
      // Suggest returning to base
      return {
        level: cur,
        phase: PHASES[phaseIdx],
        trend,
        pointingTo: 'Retorno',
        coverage: Array.from(new Set(L.map(x => Math.min(4, Math.max(0, Math.round(x)))))).length / 5,
        peak
      };
    }
    pointingToIdx = Math.max(0, phaseIdx - 1);
  }
  
  const coverageCount = Array.from(new Set(L.map(x => Math.min(4, Math.max(0, Math.round(x)))))).length;
  const coverage = coverageCount / 5;
  
  return {
    level: cur,
    phase: PHASES[phaseIdx],
    trend,
    pointingTo: PHASES[pointingToIdx],
    coverage,
    peak
  };
}

// Bidirectional adapters for Song exporting/importing (Section 12)
export class SongExportAdapter {
  static toHostSongContent(comp: Composition): string {
    // Generate raw string representation
    let text = `[Capo 0]\n`;
    
    // Header block
    text += `[Title: ${comp.title}]\n`;
    text += `[Key: ${getPitchClassName(comp.key.tonic)} ${comp.key.mode}]\n`;
    text += `[BPM: ${comp.tempo.bpm}]\n\n`;

    // Metadatos armónicos en un bloque XML/JSON propio con espacio de nombres para no romper compatibilidad (REQ-INT-03)
    text += `[HarmonySectionIndex: START_METADATA]\n`;
    const serializedSlots = comp.slots.map(s => ({
      c: { r: s.chord.root, q: s.chord.quality },
      t: s.toolUsed,
      g: s.gesture,
      e: s.emotion,
      a: s.astralLevel,
      d: s.durationBeats,
      v: s.voicing ? s.voicing.frets : null,
      l: s.lyric || ''
    }));
    text += `[HarmonyMetadata: ${JSON.stringify(serializedSlots)}]\n`;
    text += `[HarmonySectionIndex: END_METADATA]\n\n`;

    // Render song body formatted in lyric system with chords on top
    text += `.Intro\n`;
    comp.slots.forEach((slot, idx) => {
      const isLast = idx === comp.slots.length - 1;
      const chName = getChordString(slot.chord);
      text += `[${chName}] `;
      if (slot.lyric) {
        text += `${slot.lyric} `;
      }
      if ((idx + 1) % 4 === 0 && !isLast) {
        text += `\n`;
      }
    });

    return text;
  }

  static fromHostSongContent(title: string, content: string, ownerId: string): Composition {
    // Attempt reverse-importing: parse content and look for [HarmonyMetadata] fallback
    const metadataMatch = content.match(/\[HarmonyMetadata:\s*(.*?)\]/);
    let slots: Slot[] = [];

    if (metadataMatch) {
      try {
        const rawArr = JSON.parse(metadataMatch[1]);
        slots = rawArr.map((item: any, i: number) => ({
          id: `slot_${Date.now()}_${i}`,
          chord: { root: item.c.r, quality: item.c.q },
          toolUsed: item.t,
          gesture: item.g,
          emotion: item.e,
          astralLevel: item.a,
          durationBeats: item.d || 4,
          voicing: item.v ? { frets: item.v } : null,
          lyric: item.l
        }));
      } catch (e) {
        console.error('Failed to restore slots from metadata, parsing chords manually', e);
      }
    }

    if (slots.length === 0) {
      // Reconstruct best-effort using chord scanner (REQ-INT-04)
      const chordMatches = Array.from(content.matchAll(/\[(.*?)\]/g)).map(m => m[1]);
      const uniqueChords = chordMatches.filter(c => !c.toLowerCase().includes('capo') && c.length <= 8);
      
      let prev: Chord | null = null;
      uniqueChords.forEach((text, i) => {
        const chordObj = parseChordString(text);
        if (chordObj) {
          let gest = null;
          let emo = getDefaultEmotionFor(chordObj.quality);
          let astral = getDefaultAstralFor(chordObj.quality);
          
          if (prev) {
            const analysis = analyzeGesture(prev, chordObj);
            gest = analysis.gesture;
            emo = analysis.emotion;
            astral = analysis.astral;
          }
          
          slots.push({
            id: `rebuild_${Date.now()}_${i}`,
            chord: chordObj,
            durationBeats: 4,
            toolUsed: i === 0 ? 'free' : 'diatonic',
            gesture: gest,
            emotion: emo,
            astralLevel: astral,
            voicing: null
          });
          prev = chordObj;
        }
      });
    }

    // Tonic parse
    const keyMatch = content.match(/\[Key:\s*([A-Za-z#]+)\s*([a-z]+)?\]/i);
    let tonic = 0;
    let mode: 'major' | 'minor' = 'minor';
    if (keyMatch) {
      tonic = parsePitchClass(keyMatch[1]);
      mode = (keyMatch[2] || '').toLowerCase().includes('minor') ? 'minor' : 'major';
    }

    return {
      id: `comp_${Date.now()}`,
      title: title || 'Composición Reconstruida',
      key: { tonic, mode },
      tempo: { bpm: 90, timeSignature: [4, 4] },
      defaultArticulation: 'strum',
      rhythmPatternId: 'balada',
      instrument: 'guitar',
      slots,
      meta: {
        createdWith: 'CanindeSong/Utilitarios',
        specVersion: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }
}

// Helpers for string chord translation
export const SCIENTIFIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SOLFEGE_NOTES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export function getPitchClassName(p: PitchClass, notation: 'scientific' | 'solfege' = 'scientific'): string {
  const norm = mod12(p);
  return notation === 'solfege' ? SOLFEGE_NOTES[norm] : SCIENTIFIC_NOTES[norm];
}

export function parsePitchClass(str: string): PitchClass {
  const clean = str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();
  let idx = SCIENTIFIC_NOTES.indexOf(clean);
  if (idx !== -1) return idx;
  idx = SOLFEGE_NOTES.indexOf(clean);
  if (idx !== -1) return idx;
  
  // Flat mapping check
  const alias: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
    'Reb': 'Do#', 'Mib': 'Re#', 'Solb': 'Fa#', 'Lab': 'Sol#', 'Sib': 'La#'
  };
  const resolved = alias[clean];
  if (resolved) {
    idx = SCIENTIFIC_NOTES.indexOf(resolved);
    if (idx !== -1) return idx;
  }
  return 0; // Default fallback to C
}

export function getChordString(chord: Chord, notation: 'scientific' | 'solfege' = 'scientific'): string {
  const tName = getPitchClassName(chord.root, notation);
  let suffix = '';
  switch (chord.quality) {
    case 'minor': suffix = 'm'; break;
    case 'aug': suffix = 'aug'; break;
    case 'dim': suffix = 'dim'; break;
    case 'dim7': suffix = 'dim7'; break;
    case 'sus2': suffix = 'sus2'; break;
    case 'sus4': suffix = 'sus4'; break;
    case 'dom7': suffix = '7'; break;
    case 'maj7': suffix = 'maj7'; break;
    case 'min7': suffix = 'm7'; break;
    case 'add9': suffix = 'add9'; break;
    case 'six': suffix = '6'; break;
    default: suffix = ''; break;
  }
  return tName + suffix;
}

export function parseChordString(str: string): Chord | null {
  const clean = str.trim();
  let match = clean.match(/^(Do|Re|Mi|Fa|Sol|La|Si)(Do#|Re#|Mi#|Fa#|Sol#|La#|Si#|[#b]?)(.*)/i);
  let isSolfege = !!match;
  if (!match) {
    match = clean.match(/^([A-G])([#b]?)(.*)/i);
  }
  if (!match) return null;
  
  const rootStr = match[1] + match[2];
  const root = parsePitchClass(rootStr);
  const suffix = (match[3] || '').trim().toLowerCase();
  
  let quality: Quality = 'major';
  if (suffix === 'm' || suffix === 'min') quality = 'minor';
  else if (suffix === 'aug' || suffix === '5+') quality = 'aug';
  else if (suffix === 'dim7') quality = 'dim7';
  else if (suffix === 'dim') quality = 'dim';
  else if (suffix === 'sus2') quality = 'sus2';
  else if (suffix === 'sus4') quality = 'sus4';
  else if (suffix === '7' || suffix === 'dom7') quality = 'dom7';
  else if (suffix === 'maj7') quality = 'maj7';
  else if (suffix === 'm7' || suffix === 'min7') quality = 'min7';
  else if (suffix === 'add9') quality = 'add9';
  else if (suffix === '6' || suffix === 'six') quality = 'six';
  
  return { root, quality };
}
