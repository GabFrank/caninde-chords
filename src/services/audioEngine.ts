// Motor de audio de la guitarra acústica (síntesis Karplus-Strong + SoundFont).
// Lo usa el Afinador Interactivo para tocar la nota de referencia de cada cuerda:
// no necesita red, y tras la primera carga los samples quedan en la caché del
// service worker.
//
// Sólo expone lo que el afinador usa: `init`, `pluckNote`, `ctx` y las cuerdas.
// Los rasgueos, patrones rítmicos y drone se fueron con el Yggdrasil.
//
// El Soundpad NO pasa por acá: esta cadena colorea la señal (realce de graves,
// atenuación de agudos y reverb) para que suene a guitarra, y eso destrozaría un
// trueno o un sonido de naturaleza. El Soundpad tiene su propia cadena limpia en
// `soundpadEngine.ts`; ambos comparten el AudioContext de `audioContext.ts`.

import { getAudioContext } from './audioContext';

// Base MIDI pitches for guitar strings (Standard Tuning EADGBE)
export const STRINGS_BASE_MIDI = [40, 45, 50, 55, 59, 64];

// Low level audio class
export class BaseAudioEngine {
  public ctx: AudioContext | null = null;
  private masterVolumeNode: GainNode | null = null;
  private buffersCache: Record<number, AudioBuffer> = {};
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
      this.ctx = getAudioContext();
      if (!this.ctx) return;
      this.masterVolumeNode = this.ctx.createGain();
      this.masterVolumeNode.gain.value = 0.85;

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

      // Master limiter: lets us run louder without clipping when full chords play.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(this.ctx.destination);

      // Dry chain
      this.masterVolumeNode.connect(lowShelf);
      lowShelf.connect(presenceDip);
      presenceDip.connect(highCut);
      highCut.connect(limiter);

      // Natural reverb via convolution (smooth, decaying impulse) — replaces the
      // old feedback-delay echo that rang metallic.
      const convolver = this.ctx.createConvolver();
      convolver.buffer = this.makeReverbIR(2.2, 3.2);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.16; // tasteful space, not washy
      highCut.connect(convolver);
      convolver.connect(wet);
      wet.connect(limiter);

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
        this.sf.play(midiNote, absoluteTime, { gain: Math.max(0.05, Math.min(2, velocity * 1.4)) });
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
  }
}

// Instancia global del motor de audio
export const audioEngine = new BaseAudioEngine();
