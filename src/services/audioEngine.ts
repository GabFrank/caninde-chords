// Web Audio API Acoustic Guitar Synth and Scheduler
// REQ-AUD-01: Pure client-side synthesis, no network required, ultra low latency
// REQ-AUD-02/03/04: High timing-accuracy scheduler, drone & rhythm support

import { Slot, Chord, Voicing, Composition, notesOf } from '../lib/harmonyEngine';

export interface PlayOpts {
  articulation?: 'strum' | 'arpeggio';
  strumDirection?: 'down' | 'up';
  durationMs?: number;
  velocity?: number;
  patternId?: string;
}

// Rhythm patterns (Apéndice B / §7.2). `at` = subdivision index from the bar start.
export interface RhythmStep {
  at: number;
  action: 'strumDown' | 'strumUp' | 'arp' | 'bass' | 'rest';
  accent?: boolean;
  arpIndex?: number;
}
export interface RhythmPattern {
  id: string;
  name: string;
  beatsPerBar: number;
  subdivision: number; // subdivisions per beat (2 = eighths)
  steps: RhythmStep[];
}

export const RHYTHM_PATTERNS: Record<string, RhythmPattern> = {
  // balada: D · D · | U · D U  (8 corcheas en 4/4)
  balada: {
    id: 'balada', name: 'Balada (Pop)', beatsPerBar: 4, subdivision: 2,
    steps: [
      { at: 0, action: 'strumDown', accent: true }, { at: 2, action: 'strumDown' },
      { at: 4, action: 'strumUp' }, { at: 6, action: 'strumDown' }, { at: 7, action: 'strumUp' }
    ]
  },
  // vals 3/4: bass D D (acentúa tiempo 1)
  vals: {
    id: 'vals', name: 'Vals (3/4)', beatsPerBar: 3, subdivision: 1,
    steps: [
      { at: 0, action: 'bass', accent: true }, { at: 1, action: 'strumDown' }, { at: 2, action: 'strumDown' }
    ]
  },
  // rasgueado folclórico: D D U · U D U
  rasgueado: {
    id: 'rasgueado', name: 'Rasgueado Folclórico', beatsPerBar: 4, subdivision: 2,
    steps: [
      { at: 0, action: 'strumDown', accent: true }, { at: 1, action: 'strumDown' },
      { at: 2, action: 'strumUp' }, { at: 4, action: 'strumUp' },
      { at: 5, action: 'strumDown' }, { at: 6, action: 'strumUp' }
    ]
  },
  // arpegio PIMA continuo: arp[0,2,1,2,3,2,1,2]
  arpegio_pima: {
    id: 'arpegio_pima', name: 'Arpegio PIMA', beatsPerBar: 4, subdivision: 2,
    steps: [0, 2, 1, 2, 3, 2, 1, 2].map((arpIndex, at) => ({ at, action: 'arp' as const, arpIndex }))
  },
  // drone lento: sostener el acorde (un rasgueo suave por compás) + pedal de tónica
  drone_lento: {
    id: 'drone_lento', name: 'Drone Pedal (Ceremonial)', beatsPerBar: 4, subdivision: 1,
    steps: [{ at: 0, action: 'strumDown' }]
  }
};

// Base MIDI pitches for guitar strings (Standard Tuning EADGBE)
export const STRINGS_BASE_MIDI = [40, 45, 50, 55, 59, 64];

// Minimum voicings database (Apéndice C)
export const VOICINGS_DB: Record<string, number[]> = {
  'C': [-1, 3, 2, 0, 1, 0],
  'Cmaj7': [-1, 3, 2, 0, 0, 0],
  'G': [3, 2, 0, 0, 0, 3],
  'Am': [-1, 0, 2, 2, 1, 0],
  'A(sus2)': [-1, 0, 2, 2, 0, 0],
  'Fm': [1, 3, 3, 1, 1, 1],
  'B7': [-1, 2, 1, 2, 0, 2],
  'Ab': [4, 6, 6, 5, 4, 4],
  'Cadd9': [-1, 3, 2, 0, 3, 0],
  'C+': [-1, 3, 2, 1, 1, 0],
  'Em': [0, 2, 2, 0, 0, 0],
  'E': [0, 2, 2, 1, 0, 0],
  'D': [-1, -1, 0, 2, 3, 2],
  'F': [1, 3, 3, 2, 1, 1],
  'Cdim7': [-1, 3, 4, 2, 4, 2],
  'Eb': [-1, 6, 5, 3, 4, 3]
};

// Generates an on-the-fly voicing for chords not in the database (calculator)
export function getVoicingForChord(chord: Chord): Voicing {
  // Check exact database match
  let chordKey = getVoicingKey(chord);
  if (VOICINGS_DB[chordKey]) {
    return { frets: VOICINGS_DB[chordKey] };
  }
  
  // Custom calculator for dynamic voicings
  // Find notes in the chord
  const chordNotes = notesOf(chord);
  const frets = [0, 0, 0, 0, 0, 0].map((_, strIdx) => {
    const stringBase = STRINGS_BASE_MIDI[strIdx];
    // Find the closest chord pitch class on this string in the first 4 frets
    let bestFret = -1;
    let minD = 99;
    
    for (let fret = 0; fret <= 5; fret++) {
      const midi = stringBase + fret;
      const pitch = midi % 12;
      if (chordNotes.includes(pitch)) {
        if (fret < minD) {
          minD = fret;
          bestFret = fret;
        }
      }
    }
    // Don't play bottom strings on higher chord types unless it fits well
    if (strIdx === 0 && chordNotes.length > 2 && chord.root !== 0 && bestFret > 4) {
      return -1;
    }
    return bestFret;
  });

  return { frets };
}

function getVoicingKey(chord: Chord): string {
  let suffix = '';
  switch (chord.quality) {
    case 'minor': suffix = 'm'; break;
    case 'aug': suffix = '+'; break; // spec says C+ for augmented
    case 'dim': suffix = 'dim'; break;
    case 'dim7': suffix = 'dim7'; break;
    case 'sus2': suffix = 'A(sus2)'; return 'A(sus2)'; // custom standard suspension in database
    case 'sus4': suffix = 'sus4'; break;
    case 'dom7': suffix = '7'; break;
    case 'maj7': suffix = 'maj7'; break;
    case 'min7': suffix = 'm7'; break;
    case 'add9': suffix = 'add9'; break;
    case 'six': suffix = '6'; break;
    case 'min7b5': suffix = 'm7b5'; break;
  }
  return `${getScientificBase(chord.root)}${suffix}`;
}

function getScientificBase(pitch: number): string {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return notes[pitch] || 'C';
}

// Low level audio class
export class BaseAudioEngine {
  public ctx: AudioContext | null = null;
  private masterVolumeNode: GainNode | null = null;
  private buffersCache: Record<number, AudioBuffer> = {};
  private activeSources: { source: AudioBufferSourceNode; gain: GainNode }[] = [];
  private droneSource: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  // Real sampled guitar (SoundFont). Loaded lazily; synthesis is the fallback.
  private sf: any = null;
  private sfReady = false;
  private sfLoading = false;

  constructor() {
    // Lazy initialized when first trigger occurs (to satisfy browser permissions)
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterVolumeNode = this.ctx.createGain();
      this.masterVolumeNode.gain.value = 0.5;

      // Gentle tone shaping: warm low body + soft high roll-off to remove the
      // harsh/shrill fizz, without muffling the instrument.
      const lowShelf = this.ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 180;
      lowShelf.gain.value = 2.5; // subtle wood warmth

      // Gently tame only the harshest upper-mids (avoid making it dull)
      const presenceDip = this.ctx.createBiquadFilter();
      presenceDip.type = 'peaking';
      presenceDip.frequency.value = 3200;
      presenceDip.Q.value = 1.0;
      presenceDip.gain.value = -1.5;

      // Very gentle low-pass: only shaves off ultrasonic fizz, keeps brightness
      const highCut = this.ctx.createBiquadFilter();
      highCut.type = 'lowpass';
      highCut.frequency.value = 8500;
      highCut.Q.value = 0.4;

      // Dry chain
      this.masterVolumeNode.connect(lowShelf);
      lowShelf.connect(presenceDip);
      presenceDip.connect(highCut);
      highCut.connect(this.ctx.destination);

      // Natural reverb via convolution (smooth, decaying impulse) — replaces the
      // old feedback-delay echo that rang metallic.
      const convolver = this.ctx.createConvolver();
      convolver.buffer = this.makeReverbIR(2.2, 3.2);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.16; // tasteful space, not washy
      highCut.connect(convolver);
      convolver.connect(wet);
      wet.connect(this.ctx.destination);

      // Begin loading the real sampled guitar in the background.
      this.loadSoundfont();

    } catch (e) {
      console.error('Failed to initialize AudioContext with acoustic processing', e);
    }
  }

  // Lazily loads a real recorded acoustic-guitar SoundFont. Samples are cached by
  // the PWA service worker, so it keeps working offline after the first load.
  private loadSoundfont() {
    if (this.sfLoading || this.sfReady || !this.ctx || !this.masterVolumeNode) return;
    this.sfLoading = true;
    import('soundfont-player')
      .then((mod: any) => {
        const Soundfont = mod.default || mod;
        return Soundfont.instrument(this.ctx, 'acoustic_guitar_steel', {
          soundfont: 'MusyngKite',
          destination: this.masterVolumeNode
        });
      })
      .then((inst: any) => {
        this.sf = inst;
        this.sfReady = true;
        this.sfLoading = false;
      })
      .catch((e: any) => {
        console.warn('SoundFont de guitarra no disponible; usando síntesis.', e);
        this.sfLoading = false;
      });
  }

  // Builds a smooth, lowpassed exponential-decay impulse response for a natural reverb tail.
  private makeReverbIR(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const ir = this.ctx!.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        const white = Math.random() * 2 - 1;
        lp = lp + 0.5 * (white - lp); // soften the tail to avoid fizzy reverb
        d[i] = lp * env;
      }
    }
    return ir;
  }

  setMasterVolume(vol: number) {
    this.init();
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  // Warm Karplus-Strong pluck: lowpassed excitation + a one-pole loop filter whose
  // damping increases with pitch, so high notes are mellow instead of shrill.
  getPluckedStringBuffer(midiNote: number, durationSec: number = 3.2): AudioBuffer {
    this.init();
    const key = midiNote;
    if (this.buffersCache[key]) {
      return this.buffersCache[key];
    }

    const sampleRate = this.ctx!.sampleRate;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx!.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
    const N = Math.round(sampleRate / frequency);

    if (N <= 0 || N >= numSamples) {
      return buffer;
    }

    // 1. Excitation: white noise through a one-pole low-pass = soft, woody finger pluck
    //    (full-spectrum noise is what made the original attack harsh/buzzy).
    const delayLine = new Float32Array(N);
    let e = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      e = e + 0.40 * (w - e); // warm low-passed burst
      delayLine[i] = e;
      mean += e;
    }
    mean /= N;
    for (let i = 0; i < N; i++) delayLine[i] -= mean; // remove DC offset

    // 2. Physical loop. R = energy decay (bass rings longer). S = loop low-pass
    //    amount; higher for treble so the top end is damped and not shrill.
    const R = Math.min(0.9990, 0.9965 - (midiNote - 40) * 0.00009);
    const S = Math.min(0.62, 0.22 + (midiNote - 40) * 0.0065);
    let lp = 0;
    let p = 0;
    for (let i = 0; i < numSamples; i++) {
      const x = delayLine[p];
      data[i] = x;
      lp = (1 - S) * x + S * lp; // one-pole low-pass in the feedback loop
      delayLine[p] = R * lp;
      p = (p + 1) % N;
    }

    // 3. Smooth tail fade-out to avoid an abrupt cut
    const fade = Math.min(2000, numSamples);
    for (let i = numSamples - fade; i < numSamples; i++) {
      data[i] *= (numSamples - i) / fade;
    }

    this.buffersCache[key] = buffer;
    return buffer;
  }

  // Plucks an acoustic guitar note at specified ctx time
  pluckNote(midiNote: number, time: number, velocity: number = 0.8) {
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    const now = this.ctx.currentTime;
    // Treat as relative offset if time is far in the past of the actual context timeline
    const absoluteTime = time < (now - 0.5) ? now + time : time;

    // Prefer the real sampled guitar when it's ready; otherwise kick off loading
    // and fall back to synthesis so there is never silence.
    if (this.sfReady && this.sf) {
      try {
        this.sf.play(midiNote, absoluteTime, { gain: Math.max(0.05, Math.min(1, velocity)) });
        return;
      } catch (e) {
        // fall through to synthesis on any sampler error
      }
    } else {
      this.loadSoundfont();
    }

    const buffer = this.getPluckedStringBuffer(midiNote);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);

    // Per-note low-pass that tracks pitch: keeps highs in check (less shrill) while
    // letting low notes keep their body.
    const noteFilter = this.ctx.createBiquadFilter();
    noteFilter.type = 'lowpass';
    noteFilter.frequency.value = Math.max(1400, Math.min(5000, frequency * 6));
    noteFilter.Q.value = 0.6;

    const gainNode = this.ctx.createGain();
    const freqFactor = 1.0 - Math.min(0.5, (midiNote - 40) / 60) * 0.35;
    const peak = Math.max(0.0008, velocity * freqFactor);

    // Soft 6 ms attack to remove the harsh click, then a natural exponential decay.
    gainNode.gain.setValueAtTime(0.0001, absoluteTime);
    gainNode.gain.linearRampToValueAtTime(peak, absoluteTime + 0.006);
    gainNode.gain.exponentialRampToValueAtTime(0.004, absoluteTime + 2.6);

    source.connect(noteFilter);
    noteFilter.connect(gainNode);
    gainNode.connect(this.masterVolumeNode!);
    source.start(absoluteTime);
    source.stop(absoluteTime + 3.2);

    const activeItem = { source, gain: gainNode };
    this.activeSources.push(activeItem);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(x => x.source !== source);
    };
  }

  // Schedules the notes of a voicing based on strum options
  scheduleChord(voicing: Voicing, time: number, opts: PlayOpts) {
    const art = opts.articulation || 'strum';
    const strumDir = opts.strumDirection || 'down';
    const vel = opts.velocity || 0.8;

    // Filter valid frets and map to overall MIDI numbers
    const activeStringPitches: { midi: number; stringIdx: number }[] = [];
    voicing.frets.forEach((f, idx) => {
      if (f !== -1) {
        activeStringPitches.push({
          midi: STRINGS_BASE_MIDI[idx] + f,
          stringIdx: idx
        });
      }
    });

    if (activeStringPitches.length === 0) return;

    if (art === 'strum') {
      // Sort string play order by direction
      if (strumDir === 'down') {
        // Low strings to high strings indexes
        activeStringPitches.sort((a,b) => a.stringIdx - b.stringIdx);
      } else {
        // High strings to low strings
        activeStringPitches.sort((a,b) => b.stringIdx - a.stringIdx);
      }

      // Schedule pluck times incrementally with spacing (15 to 30ms strum duration)
      const interPluckDelay = 0.020; // 20ms delay
      activeStringPitches.forEach((p, idx) => {
        const pluckTime = time + idx * interPluckDelay;
        // Dampen higher strings slightly to sound like a realistic physical swipe
        const damper = strumDir === 'down' ? 1.0 - idx * 0.05 : 1.0 - (activeStringPitches.length - 1 - idx) * 0.05;
        this.pluckNote(p.midi, pluckTime, vel * damper);
      });
    } else {
      // Arpeggio pattern play
      // Schedule pattern subdivisions: P - I - M - A spacing
      const subdivisionDelay = 0.150; // 150ms arpeggio spacing
      activeStringPitches.sort((a,b) => a.stringIdx - b.stringIdx); // sort E2 to E4
      activeStringPitches.forEach((p, idx) => {
        const pluckTime = time + idx * subdivisionDelay;
        this.pluckNote(p.midi, pluckTime, vel * 0.9);
      });
    }
  }

  // Schedules a voicing across a slot following a rhythm pattern, on the audio
  // clock for accuracy (REQ-AUD-02/03, §7.2). Returns the slot duration in seconds.
  scheduleRhythm(voicing: Voicing, pattern: RhythmPattern, bpm: number, durationBeats: number, baseOffsetSec: number = 0): number {
    this.init();
    if (!this.ctx) return 0;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const secPerBeat = 60 / bpm;
    const secPerSub = secPerBeat / pattern.subdivision;
    const totalSubs = pattern.beatsPerBar * pattern.subdivision;
    const slotSubs = Math.max(1, Math.round(durationBeats * pattern.subdivision));
    const startTime = this.ctx.currentTime + 0.03 + baseOffsetSec;

    // Active strings ordered low -> high (for bass/arp indexing)
    const active = voicing.frets
      .map((f, i) => (f !== -1 ? { midi: STRINGS_BASE_MIDI[i] + f, idx: i } : null))
      .filter((x): x is { midi: number; idx: number } => x !== null)
      .sort((a, b) => a.idx - b.idx);
    if (active.length === 0) return durationBeats * secPerBeat;

    for (let sub = 0; sub < slotSubs; sub++) {
      const step = pattern.steps.find(s => s.at === (sub % totalSubs));
      if (!step || step.action === 'rest') continue;
      const t = startTime + sub * secPerSub;
      const vel = step.accent ? 0.95 : 0.78;
      if (step.action === 'strumDown') {
        this.scheduleChord(voicing, t, { articulation: 'strum', strumDirection: 'down', velocity: vel });
      } else if (step.action === 'strumUp') {
        this.scheduleChord(voicing, t, { articulation: 'strum', strumDirection: 'up', velocity: vel * 0.85 });
      } else if (step.action === 'bass') {
        this.pluckNote(active[0].midi, t, vel);
      } else if (step.action === 'arp') {
        const n = active[(step.arpIndex ?? 0) % active.length];
        this.pluckNote(n.midi, t, vel * 0.9);
      }
    }
    return durationBeats * secPerBeat;
  }

  // Supports a deep, warm drone pedal note below the progression (REQ-AUD-04)
  triggerDrone(note: number, active: boolean) {
    this.init();
    if (!this.ctx) return;
    
    if (!active) {
      if (this.droneSource) {
        try {
          this.droneSource.stop();
        } catch(e) {}
        this.droneSource = null;
      }
      return;
    }

    if (this.droneSource) {
      // Update frequency if already running to smooth transitions
      const frequency = 440 * Math.pow(2, (note - 69) / 12);
      this.droneSource.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      return;
    }

    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    
    this.droneSource = this.ctx.createOscillator();
    this.droneSource.type = 'triangle'; // Soft warmer drone
    this.droneSource.frequency.value = frequency;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    // Smooth fade-in to prevent loud clicks
    this.droneGain.gain.exponentialRampToValueAtTime(0.12, this.ctx.currentTime + 1.5);

    // Apply lowpass filter to remove harsh upper buzz
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, this.ctx.currentTime);

    this.droneSource.connect(filter);
    filter.connect(this.droneGain);
    this.droneGain.connect(this.masterVolumeNode!);

    this.droneSource.start();
  }

  stopAll() {
    if (this.sf) {
      try { this.sf.stop(); } catch (e) {}
    }
    this.activeSources.forEach(s => {
      try {
        s.source.stop();
      } catch (e) {}
    });
    this.activeSources = [];
    
    if (this.droneSource) {
      try {
        this.droneSource.stop();
      } catch (e) {}
      this.droneSource = null;
    }
  }
}

// Global active AudioEngine instance export
export const audioEngine = new BaseAudioEngine();
