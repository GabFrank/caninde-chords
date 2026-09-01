// Interactive Guitar and Bass Tuner with real-time pitch tracking
// Uses the Web Audio API AnalyserNode and a custom Autocorrelation algorithm.
// Declares 'microphone' requestFramePermission on metadata.json to operate correctly.

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Volume2, Mic, Settings, AlertCircle, HelpCircle } from 'lucide-react';
import { audioEngine, STRINGS_BASE_MIDI } from '../services/audioEngine';

interface TuningString {
  label: string;
  freq: number;
  midi: number;
}

const GUITAR_STRINGS: TuningString[] = [
  { label: '6E', freq: 82.41, midi: 40 },
  { label: '5A', freq: 110.00, midi: 45 },
  { label: '4D', freq: 146.83, midi: 50 },
  { label: '3G', freq: 196.00, midi: 55 },
  { label: '2B', freq: 246.94, midi: 59 },
  { label: '1E', freq: 329.63, midi: 64 }
];

const BASS_STRINGS: TuningString[] = [
  { label: '4E', freq: 41.20, midi: 28 },
  { label: '3A', freq: 55.00, midi: 33 },
  { label: '2D', freq: 73.42, midi: 38 },
  { label: '1G', freq: 98.00, midi: 43 }
];

export const GuitarTuner: React.FC = () => {
  const [instrument, setInstrument] = useState<'guitar' | 'bass'>('guitar');
  const [isListening, setIsListening] = useState(false);
  const [selectedStringIndex, setSelectedStringIndex] = useState<number | null>(null); // null = Auto-detect
  const [detectedNote, setDetectedNote] = useState<string>('-');
  const [detectedFreq, setDetectedFreq] = useState<number>(0);
  const [centsOffset, setCentsOffset] = useState<number>(0);
  const [tuningStatus, setTuningStatus] = useState<'flat' | 'sharp' | 'tuned' | 'silent'>('silent');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const strings = instrument === 'guitar' ? GUITAR_STRINGS : BASS_STRINGS;

  useEffect(() => {
    return () => {
      stopTuner();
    };
  }, []);

  const startTuner = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; // balanced frequency resolution and response speed
      analyserRef.current = analyser;

      source.connect(analyser);
      setIsListening(true);
      
      // Start processing loop
      animationFrameRef.current = requestAnimationFrame(processAudio);
    } catch (err: any) {
      console.error('Mic permission failed', err);
      setErrorMsg('No se pudo acceder al micrófono. Por favor, asegúrate de dar permisos de audio.');
    }
  };

  const stopTuner = () => {
    setIsListening(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setDetectedNote('-');
    setDetectedFreq(0);
    setCentsOffset(0);
    setTuningStatus('silent');
  };

  const toggleListening = () => {
    if (isListening) {
      stopTuner();
    } else {
      startTuner();
    }
  };

  // High-precision time-domain Autocorrelation pitch detector
  const processAudio = () => {
    if (!analyserRef.current || !isListening) return;

    const bufferSize = analyserRef.current.fftSize;
    const array = new Float32Array(bufferSize);
    analyserRef.current.getFloatTimeDomainData(array);

    // Compute RMS amplitude to block background whisper noise
    let sum = 0;
    for (let i = 0; i < bufferSize; i++) {
      sum += array[i] * array[i];
    }
    const rms = Math.sqrt(sum / bufferSize);

    if (rms < 0.01) {
      // Input is silent
      setCentsOffset(0);
      setTuningStatus('silent');
      setDetectedFreq(0);
      animationFrameRef.current = requestAnimationFrame(processAudio);
      return;
    }

    const sampleRate = audioContextRef.current!.sampleRate;
    const pitch = autoCorrelate(array, sampleRate);

    if (pitch !== -1 && pitch > 30 && pitch < 1000) {
      setDetectedFreq(Math.round(pitch * 100) / 100);

      // Find nearest target frequency
      let targetString = strings[0];
      if (selectedStringIndex !== null) {
        targetString = strings[selectedStringIndex];
      } else {
        // Find nearest string in full auto-detect mode
        let minDiff = 9999;
        strings.forEach(s => {
          const diff = Math.abs(s.freq - pitch);
          if (diff < minDiff) {
            minDiff = diff;
            targetString = s;
          }
        });
      }

      // Calculate cents deviation: Cents = 1200 * log2(f / f_target)
      const cents = Math.round(1200 * Math.log2(pitch / targetString.freq));
      setCentsOffset(Math.max(-50, Math.min(50, cents)));
      setDetectedNote(targetString.label);

      if (Math.abs(cents) <= 2) {
        setTuningStatus('tuned');
      } else if (cents < 0) {
        setTuningStatus('flat');
      } else {
        setTuningStatus('sharp');
      }
    }

    animationFrameRef.current = requestAnimationFrame(processAudio);
  };

  // Autocorrelation algorithm
  const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    const SIZE = buffer.length;
    let r1 = 0;
    let r2 = SIZE - 1;
    const thresh = 0.2;

    // Trim edge silences if any
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < 0.0002) {
        r1 = i;
      } else {
        break;
      }
    }
    for (let i = SIZE - 1; i >= SIZE / 2; i--) {
      if (Math.abs(buffer[i]) < 0.0002) {
        r2 = i;
      } else {
        break;
      }
    }

    const trimmedBuffer = buffer.subarray(r1, r2);
    const len = trimmedBuffer.length;

    // Get autocorrelation coefficients
    const c = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len - i; j++) {
        c[i] = c[i] + trimmedBuffer[j] * trimmedBuffer[j + i];
      }
    }

    // Find the first zero-crossing index displacement
    let d = 0;
    while (d < len - 1 && c[d] > 0) {
      d++;
    }

    // Search for peaks after zero-crossing
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < len; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;

    // Parabolic interpolation for pitch accuracy enhancement
    const x1 = c[T0 - 1] || 0;
    const x2 = c[T0];
    const x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) {
      T0 = T0 - b / (2 * a);
    }

    return sampleRate / T0;
  };

  // Play referential pitch for tuning by ear (REQ-AUD-01)
  const playReference = (s: TuningString) => {
    audioEngine.init();
    audioEngine.pluckNote(s.midi, audioEngine.ctx?.currentTime || 0, 0.95);
  };

  return (
    <div id="guitar-tuner-container" className="flex flex-col items-center justify-center p-3 sm:p-6 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl mx-auto space-y-4 sm:space-y-8">
      
      {/* Selector & Info */}
      <div className="flex justify-between items-center w-full">
        <div className="flex gap-2">
          <button
            onClick={() => { setInstrument('guitar'); stopTuner(); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-sans transition-all border ${instrument === 'guitar' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}
          >
            Guitarra (EADGBE)
          </button>
          <button
            onClick={() => { setInstrument('bass'); stopTuner(); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-sans transition-all border ${instrument === 'bass' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}
          >
            Bajo (4 Cuerdas)
          </button>
        </div>

        <button
          onClick={() => setSelectedStringIndex(null)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${selectedStringIndex === null ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'bg-transparent text-zinc-400'}`}
        >
          Autodetectar
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl text-xs text-red-600 w-full">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Tuner Gauge (Meter) */}
      <div className="relative flex flex-col items-center justify-center w-72 h-44 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 rounded-3xl p-6 overflow-hidden shadow-sm">
        <div className="absolute inset-x-0 bottom-0 top-1/2 flex items-end justify-center pointer-events-none opacity-5 dark:opacity-[0.03]">
          <Mic size={180} />
        </div>

        {/* Needle gauge bar */}
        <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full relative mb-12">
          <div className="absolute left-1/2 top-[-6px] w-1 h-4 bg-zinc-400 dark:bg-zinc-600 transform -translate-x-1/2 rounded" />
          
          <motion.div
            animate={{ x: `${(centsOffset / 50) * 110}px` }}
            transition={{ type: 'spring', damping: 15, stiffness: 120 }}
            className={`absolute left-1/2 top-[-8px] w-2.5 h-6 rounded transform -translate-x-1/2 shadow-md ${tuningStatus === 'tuned' ? 'bg-green-500' : 'bg-blue-600'}`}
          />
        </div>

        {/* Deviation Numbers */}
        <div className="flex flex-col items-center space-y-1">
          <span className={`text-4xl font-mono font-extrabold ${tuningStatus === 'tuned' ? 'text-green-500' : 'text-zinc-800 dark:text-zinc-100'}`}>
            {detectedNote}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
            <span>{detectedFreq > 0 ? `${detectedFreq} Hz` : '-- Hz'}</span>
            {tuningStatus !== 'silent' && (
              <span className={`font-bold uppercase ${tuningStatus === 'tuned' ? 'text-green-500' : 'text-blue-500'}`}>
                ({centsOffset > 0 ? `+${centsOffset}` : centsOffset} cents)
              </span>
            )}
          </div>
        </div>

        {/* Interactive feedback glow */}
        <div className={`absolute bottom-0 inset-x-0 h-1.5 transition-colors duration-200 ${tuningStatus === 'tuned' ? 'bg-green-500' : tuningStatus === 'flat' ? 'bg-amber-500' : tuningStatus === 'sharp' ? 'bg-red-500' : 'bg-transparent'}`} />
      </div>

      {/* Mic Trigger Button */}
      <button
        onClick={toggleListening}
        className={`w-full max-w-xs py-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all shadow-md ${isListening ? 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-500/20' : 'bg-zinc-900 text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900'}`}
      >
        <Mic size={18} className={isListening ? 'animate-pulse' : ''} />
        {isListening ? 'Apagar Micrófono' : 'Encender Micrófono'}
      </button>

      {/* String Tuners Row */}
      <div className="w-full space-y-3">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block text-center">
          Escucha de cuerda de referencia (Por Oído)
        </label>
        
        <div className="grid grid-cols-6 gap-2 w-full">
          {strings.map((str, idx) => (
            <div key={str.label} className="flex flex-col items-center">
              <button
                onClick={() => setSelectedStringIndex(idx)}
                className={`w-full py-3.5 rounded-xl text-sm font-bold font-mono transition-all border ${selectedStringIndex === idx ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'}`}
              >
                {str.label}
              </button>
              
              <button
                onClick={() => playReference(str)}
                className="mt-1.5 p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 transition-colors"
                title={`Oír tono de referencia para ${str.label}`}
              >
                <Volume2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
