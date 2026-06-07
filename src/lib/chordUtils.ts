
const scientificNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const solfegeNotes = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

const flatMap: { [key: string]: string } = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
  'Reb': 'Do#', 'Mib': 'Re#', 'Solb': 'Fa#', 'Lab': 'Sol#', 'Sib': 'La#'
};

const solfegeToScientificMap: { [key: string]: string } = {
  'Do': 'C', 'Re': 'D', 'Mi': 'E', 'Fa': 'F', 'Sol': 'G', 'La': 'A', 'Si': 'B'
};

const scientificToSolfegeMap: { [key: string]: string } = {
  'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si'
};

const nonChordWords = ['Capo', 'Intro', 'Coro', 'Puente', 'Solo', 'Final', 'Outro', 'Chorus', 'Bridge', 'Break', 'Col', 'x2', 'x3', 'x4'];

export const transposeChord = (chord: string, semitones: number, targetNotation: 'scientific' | 'solfege' = 'scientific'): string => {
  // 0. Skip if it's a known tag
  if (nonChordWords.some(word => chord.toLowerCase().startsWith(word.toLowerCase()))) {
    return chord;
  }

  // 1. Identify root note and suffix
  // Try matching Solfege first (longer strings)
  let match = chord.match(/^(Do|Re|Mi|Fa|Sol|La|Si)([#b]?)(.*)/i);
  let isSolfege = !!match;
  
  if (!match) {
    match = chord.match(/^([A-G])([#b]?)(.*)/i);
  }

  if (!match) return chord;

  let root = match[1];
  const accidental = match[2];
  const suffix = match[3];

  // Normalize root to capitalized
  root = root.charAt(0).toUpperCase() + root.slice(1).toLowerCase();
  let fullRoot = root + accidental;

  // 2. Convert to Scientific for internal logic
  if (isSolfege) {
    const scientificBase = solfegeToScientificMap[root];
    fullRoot = scientificBase + accidental;
  }

  // Handle flats
  if (flatMap[fullRoot]) {
    fullRoot = flatMap[fullRoot];
  }

  // 3. Transpose
  const index = scientificNotes.indexOf(fullRoot);
  if (index === -1) return chord;

  let newIndex = (index + semitones) % 12;
  if (newIndex < 0) newIndex += 12;

  const transposedScientific = scientificNotes[newIndex];

  // 4. Convert to target notation
  if (targetNotation === 'solfege') {
    // Check if it's a sharp note
    if (transposedScientific.endsWith('#')) {
      const base = transposedScientific.slice(0, -1);
      return scientificToSolfegeMap[base] + '#' + suffix;
    }
    return scientificToSolfegeMap[transposedScientific] + suffix;
  }

  return transposedScientific + suffix;
};

export const transposeContent = (
  content: string, 
  semitones: number, 
  notation: 'scientific' | 'solfege' = 'scientific',
  showCapo: boolean = true
): string => {
  // 1. Detect Capo
  const capoMatch = content.match(/\[Capo\s+(\d+)\]/i);
  const currentCapo = capoMatch ? parseInt(capoMatch[1], 10) : 0;

  let finalContent = content;
  let finalSemitones = semitones;

  if (showCapo) {
    // If showing capo, and we have a capo tag
    if (capoMatch) {
      // Update the capo tag instead of transposing chords
      const newCapo = currentCapo + semitones;
      finalContent = content.replace(/\[Capo\s+(\d+)\]/i, `[Capo ${newCapo}]`);
      finalSemitones = 0; // Don't transpose chords
    }
  } else {
    // If NOT showing capo
    // We hide the capo tag and transpose chords by (currentCapo + semitones)
    finalContent = content.replace(/\[Capo\s+(\d+)\]/i, '');
    finalSemitones = currentCapo + semitones;
  }

  // Regex to find [Chord] patterns
  return finalContent.replace(/\[(.*?)\]/g, (match, chord) => {
    // Skip empty tags (might happen if we replaced Capo with empty string)
    if (!chord.trim()) return '';

    // Handle complex chords like G/B
    if (chord.includes('/')) {
      const [base, bass] = chord.split('/');
      return `[${transposeChord(base, finalSemitones, notation)}/${transposeChord(bass, finalSemitones, notation)}]`;
    }
    return `[${transposeChord(chord, finalSemitones, notation)}]`;
  });
};
