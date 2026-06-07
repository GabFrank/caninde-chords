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

  constructor() {
    // Lazy initialized when first trigger occurs (to satisfy browser permissions)
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterVolumeNode = this.ctx.createGain();
      this.masterVolumeNode.gain.value = 0.55;

      // 1. ACOUSTIC GUITAR TONE-SHAPING FILTERS
      // We shape the frequency response of the synthesizer to sound like a rich wooden resonator
      
      // A. Deep wood soundboard body resonance
      const lowShelf = this.ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 210;
      lowShelf.gain.value = 5.5; // Boost warm bottom-end wood resonance

      // B. Peaking filter to add wood warmth and clear presence, while scooping nasal mids
      const midWarmth = this.ctx.createBiquadFilter();
      midWarmth.type = 'peaking';
      midWarmth.frequency.value = 350;
      midWarmth.Q.value = 0.85;
      midWarmth.gain.value = 2.5;

      // C. High-shelf dampening filter to simulate a mellow, cozy nylon/bronze string pluck
      const highWarmthCut = this.ctx.createBiquadFilter();
      highWarmthCut.type = 'highshelf';
      highWarmthCut.frequency.value = 3800;
      highWarmthCut.gain.value = -9.0; // Smooths out harsh buzz/metallic hiss

      // Connect tone shaping chain
      this.masterVolumeNode.connect(lowShelf);
      lowShelf.connect(midWarmth);
      midWarmth.connect(highWarmthCut);
      highWarmthCut.connect(this.ctx.destination);

      // 2. AMBIENT STEREO COZY REVERB & DELAY SPACE
      // Creates a cozy, mesmerizing sacred-grove environment in the background
      const delayL = this.ctx.createDelay(1.0);
      const delayR = this.ctx.createDelay(1.0);
      const feedbackL = this.ctx.createGain();
      const feedbackR = this.ctx.createGain();
      const wetLevel = this.ctx.createGain();

      delayL.delayTime.value = 0.360; // 360ms delay
      delayR.delayTime.value = 0.480; // 480ms delay for wide stereo field

      feedbackL.gain.value = 0.32; // Deep lingering tail
      feedbackR.gain.value = 0.32;
      wetLevel.gain.value = 0.20; // Elegant level of space, wet blend

      // Connect delay blocks
      highWarmthCut.connect(delayL);
      highWarmthCut.connect(delayR);

      delayL.connect(feedbackL);
      feedbackL.connect(delayL); // feedback loop left

      delayR.connect(feedbackR);
      feedbackR.connect(delayR); // feedback loop right

      // Cross-feed slightly for deep spatial stereo expansion
      const crossFeed = this.ctx.createGain();
      crossFeed.gain.value = 0.12;
      feedbackL.connect(crossFeed);
      crossFeed.connect(delayR);

      // Merge and route wet signal to main output
      const stereoMerger = this.ctx.createChannelMerger(2);
      delayL.connect(stereoMerger, 0, 0);
      delayR.connect(stereoMerger, 0, 1);
      
      stereoMerger.connect(wetLevel);
      wetLevel.connect(this.ctx.destination);

    } catch (e) {
      console.error('Failed to initialize AudioContext with acoustic processing', e);
    }
  }

  setMasterVolume(vol: number) {
    this.init();
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  // Pure Karplus-Strong Physical pluck string synthesizer with warm acoustic tuning
  getPluckedStringBuffer(midiNote: number, durationSec: number = 3.0): AudioBuffer {
    this.init();
    const key = midiNote;
    if (this.buffersCache[key]) {
      return this.buffersCache[key];
    }

    const sampleRate = this.ctx!.sampleRate;
    const numSamples = sampleRate * durationSec;
    const buffer = this.ctx!.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // Fundamental frequency calculation
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
    const N = Math.round(sampleRate / frequency);

    if (N <= 0 || N >= numSamples) {
      return buffer;
    }

    // 1. Initialise raw noise for excitation
    const rawNoise = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Adding a little exponential drop inside the pluck burst for a more organic snap
      const scale = Math.exp(-3.5 * (i / N));
      rawNoise[i] = (Math.random() * 2.0 - 1.0) * scale;
    }

    // 2. Binomial 3-point filter window to smooth out harsh high-freq transient clicks
    // converting noise-bursts into soft organic finger pluck excitation
    const delayLine = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const prev = rawNoise[(i - 1 + N) % N];
      const curr = rawNoise[i];
      const next = rawNoise[(i + 1) % N];
      delayLine[i] = (prev * 0.25) + (curr * 0.5) + (next * 0.25);
    }

    // 3. Continuous time-domain physical model loop with lowpass averaging (feedback)
    // Lower bass notes sustain longer (slower wood decay) for nice ceremonial resonance
    const baseDecay = 0.9958;
    const decay = Math.min(0.9968, baseDecay - (midiNote - 40) * 0.00012);
    let p = 0; // Delay pointer
    
    for (let i = 0; i < numSamples; i++) {
      const curVal = delayLine[p];
      const nextIdx = (p + 1) % N;
      const nextVal = delayLine[nextIdx];
      
      // Lowpass feedback filter equation: average current and next samples
      const feedback = (curVal + nextVal) * 0.5 * decay;
      
      // Write into the buffer
      data[i] = curVal;
      
      // Update delay line for the next period cycle
      delayLine[p] = feedback;
      p = nextIdx;
    }

    // Apply highpass to remove DC drift and smooth tail decay
    for (let i = numSamples - 1000; i < numSamples; i++) {
      const ramp = (numSamples - i) / 1000;
      data[i] *= ramp;
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
    
    const buffer = this.getPluckedStringBuffer(midiNote);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    
    // Orgánicas variations of volume based on frequency pitch
    const freqFactor = 1.0 - Math.min(0.5, (midiNote - 40) / 60) * 0.3;
    gainNode.gain.setValueAtTime(velocity * freqFactor, absoluteTime);
    
    // Sutil pluck envelope curve
    gainNode.gain.exponentialRampToValueAtTime(0.005, absoluteTime + 2.5);

    source.connect(gainNode);
    gainNode.connect(this.masterVolumeNode!);
    source.start(absoluteTime);
    source.stop(absoluteTime + 3.0);

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
