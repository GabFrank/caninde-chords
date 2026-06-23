// Datos semilla: paleta emocional + biblioteca mixta + plantilla ayahuasca (doc §9).
//
// Sirve para los demos, los tests y como punto de partida de la app. La música acá es
// ficticia/representativa; los datos técnicos (Camelot/BPM) son ejemplos para el motor.

import type { AttributeDefinition } from '../model/attributes';
import type { Track } from '../model/track';
import type { RitualTemplate } from '../model/template';

// --- Paleta emocional de fábrica (intensity 1..10) + algunas categóricas/flags. ---
export const SEED_ATTRIBUTES: AttributeDefinition[] = [
  { id: 'calm', name: 'Calma', color: '#5b9bd5', kind: 'intensity', min: 1, max: 10, builtIn: true },
  { id: 'energy', name: 'Energía', color: '#e8743b', kind: 'intensity', min: 1, max: 10, builtIn: true },
  { id: 'depth', name: 'Profundidad', color: '#6b4c9a', kind: 'intensity', min: 1, max: 10, builtIn: true },
  { id: 'light', name: 'Luz', color: '#f2c14e', kind: 'intensity', min: 1, max: 10, builtIn: true },
  { id: 'tension', name: 'Tensión', color: '#c0392b', kind: 'intensity', min: 1, max: 10, builtIn: true },
  {
    id: 'moment',
    name: 'Momento',
    color: '#3aa17e',
    kind: 'category',
    options: ['apertura', 'subida', 'pico', 'descenso', 'cierre'],
    builtIn: true,
  },
  { id: 'instrumental', name: 'Instrumental', color: '#7f8c8d', kind: 'flag', builtIn: true },
];

// Helpers compactos para declarar tags.
const i = (defId: string, value: number) => ({ defId, value });
const cat = (defId: string, value: string) => ({ defId, value });
const flag = (defId: string, value: boolean) => ({ defId, value });

const MIN = 60_000;

// --- Biblioteca mixta (Spotify + YouTube + local), todas iguales en la capa creativa. ---
export const SEED_LIBRARY: Track[] = [
  {
    id: 'icaro-apertura',
    title: 'Ícaro de Apertura',
    artist: 'Alma Caniné',
    durationMs: 6 * MIN,
    source: { provider: 'local', externalId: 'local/icaro-apertura.flac' },
    audioMeta: { keyCamelot: '8A', bpm: 64 },
    tags: [i('calm', 8), i('depth', 6), i('light', 5), cat('moment', 'apertura'), flag('instrumental', true)],
  },
  {
    id: 'rio-lento',
    title: 'Río Lento',
    artist: 'Estudio Caniné',
    durationMs: 9 * MIN,
    source: { provider: 'local', externalId: 'local/rio-lento.flac' },
    audioMeta: { keyCamelot: '8A', bpm: 66 },
    tags: [i('calm', 9), i('depth', 7), i('energy', 2), cat('moment', 'apertura'), flag('instrumental', true)],
  },
  {
    id: 'tierra-adentro',
    title: 'Tierra Adentro',
    artist: 'Bosque Profundo',
    durationMs: 8 * MIN,
    source: { provider: 'spotify', externalId: 'spotify:track:tierra-adentro' },
    audioMeta: { keyCamelot: '9A', bpm: 72 },
    tags: [i('depth', 9), i('tension', 4), i('energy', 4), cat('moment', 'subida')],
  },
  {
    id: 'subida-del-sol',
    title: 'Subida del Sol',
    artist: 'Mantra Colectivo',
    durationMs: 7 * MIN,
    source: { provider: 'spotify', externalId: 'spotify:track:subida-del-sol' },
    audioMeta: { keyCamelot: '9B', bpm: 84 },
    tags: [i('energy', 7), i('light', 7), i('depth', 5), cat('moment', 'subida')],
  },
  {
    id: 'fuego-interior',
    title: 'Fuego Interior',
    artist: 'Tambores del Norte',
    durationMs: 8 * MIN,
    source: { provider: 'youtube', externalId: 'yt:fuego-interior' },
    audioMeta: { keyCamelot: '10B', bpm: 96 },
    tags: [i('energy', 9), i('tension', 7), i('light', 6), cat('moment', 'pico')],
  },
  {
    id: 'pico-cosmico',
    title: 'Pico Cósmico',
    artist: 'Alma Caniné',
    durationMs: 10 * MIN,
    source: { provider: 'local', externalId: 'local/pico-cosmico.flac' },
    audioMeta: { keyCamelot: '11B', bpm: 100 },
    tags: [i('energy', 10), i('tension', 8), i('depth', 7), cat('moment', 'pico'), flag('instrumental', true)],
  },
  {
    id: 'descenso-suave',
    title: 'Descenso Suave',
    artist: 'Niebla',
    durationMs: 9 * MIN,
    source: { provider: 'spotify', externalId: 'spotify:track:descenso-suave' },
    audioMeta: { keyCamelot: '11A', bpm: 80 },
    tags: [i('calm', 6), i('depth', 6), i('energy', 4), cat('moment', 'descenso')],
  },
  {
    id: 'vuelta-a-casa',
    title: 'Vuelta a Casa',
    artist: 'Estudio Caniné',
    durationMs: 8 * MIN,
    source: { provider: 'youtube', externalId: 'yt:vuelta-a-casa' },
    audioMeta: { keyCamelot: '8B', bpm: 72 },
    tags: [i('calm', 8), i('light', 8), i('energy', 3), cat('moment', 'descenso')],
  },
  {
    id: 'cierre-tierra',
    title: 'Cierre de Tierra',
    artist: 'Alma Caniné',
    durationMs: 7 * MIN,
    source: { provider: 'local', externalId: 'local/cierre-tierra.flac' },
    audioMeta: { keyCamelot: '8A', bpm: 60 },
    tags: [i('calm', 10), i('depth', 5), i('light', 6), cat('moment', 'cierre'), flag('instrumental', true)],
  },
  {
    id: 'silencio-estrellado',
    title: 'Silencio Estrellado',
    artist: 'Niebla',
    durationMs: 9 * MIN,
    source: { provider: 'spotify', externalId: 'spotify:track:silencio-estrellado' },
    audioMeta: { keyCamelot: '3A', bpm: 58 },
    tags: [i('calm', 9), i('depth', 8), i('light', 4), cat('moment', 'cierre')],
  },
  {
    id: 'lluvia-bosque',
    title: 'Lluvia en el Bosque',
    artist: 'Naturaleza',
    durationMs: 30 * MIN,
    source: { provider: 'local', externalId: 'local/lluvia-bosque.flac' },
    audioMeta: { keyCamelot: '1A', bpm: 0 },
    tags: [i('calm', 10), flag('instrumental', true)],
  },
];

/** Track de naturaleza usado como capa de fondo (ambient). */
export const NATURE_TRACK_ID = 'lluvia-bosque';

// --- Plantilla de ayahuasca (~4h): curva de energía, regiones, anclas, silencios. ---
export const SEED_AYAHUASCA_TEMPLATE: RitualTemplate = {
  id: 'ayahuasca-clasica',
  name: 'Ayahuasca — Viaje Clásico (~4h)',
  totalDurationMs: 4 * 60 * MIN,
  curve: [
    { t: 0, energy: 0.1 },
    { t: 0.15, energy: 0.25 },
    { t: 0.4, energy: 0.6 },
    { t: 0.55, energy: 0.95 },
    { t: 0.7, energy: 0.7 },
    { t: 0.85, energy: 0.35 },
    { t: 1, energy: 0.1 },
  ],
  regions: [
    {
      id: 'apertura',
      name: 'Apertura',
      startT: 0,
      endT: 0.2,
      targets: [
        { defId: 'calm', weight: 1, min: 7, max: 10 },
        { defId: 'depth', weight: 0.6, min: 4, max: 8 },
        { defId: 'moment', weight: 0.4, equals: 'apertura' },
      ],
    },
    {
      id: 'subida',
      name: 'Subida',
      startT: 0.2,
      endT: 0.45,
      targets: [
        { defId: 'energy', weight: 0.8, min: 4, max: 7 },
        { defId: 'depth', weight: 1, min: 6, max: 10 },
      ],
    },
    {
      id: 'pico',
      name: 'Pico',
      startT: 0.45,
      endT: 0.65,
      targets: [
        { defId: 'energy', weight: 1, min: 8, max: 10 },
        { defId: 'tension', weight: 0.7, min: 6, max: 10 },
        { defId: 'moment', weight: 0.5, equals: 'pico' },
      ],
    },
    {
      id: 'descenso',
      name: 'Descenso',
      startT: 0.65,
      endT: 0.85,
      targets: [
        { defId: 'calm', weight: 0.8, min: 5, max: 9 },
        { defId: 'light', weight: 0.8, min: 5, max: 10 },
        { defId: 'energy', weight: 0.5, min: 2, max: 5 },
      ],
    },
    {
      id: 'cierre',
      name: 'Cierre',
      startT: 0.85,
      endT: 1,
      targets: [
        { defId: 'calm', weight: 1, min: 8, max: 10 },
        { defId: 'moment', weight: 0.5, equals: 'cierre' },
      ],
    },
  ],
  anchors: [
    { id: 'a-apertura', trackId: 'icaro-apertura', placement: { type: 'region', regionId: 'apertura', position: 'start' } },
    { id: 'a-pico', trackId: 'pico-cosmico', placement: { type: 'region', regionId: 'pico', position: 'any' } },
    { id: 'a-cierre', trackId: 'cierre-tierra', placement: { type: 'region', regionId: 'cierre', position: 'end' } },
  ],
  silences: [
    { id: 's-pre-pico', t: 0.44, durationMs: 2 * MIN },
    { id: 's-post-pico', t: 0.66, durationMs: 3 * MIN },
  ],
  ambient: { enabled: true, trackId: NATURE_TRACK_ID, baseVolume: 0.2 },
};

// --- Plantilla de rapé (~30min): corta e intensa. Subida rápida a un pico breve,
//     un silencio de quietud tras el soplo, y aterrizaje a tierra. ---
export const SEED_RAPE_TEMPLATE: RitualTemplate = {
  id: 'rape-soplo',
  name: 'Rapé — Soplo y Tierra (~30min)',
  totalDurationMs: 30 * MIN,
  curve: [
    { t: 0, energy: 0.15 },
    { t: 0.18, energy: 0.5 },
    { t: 0.3, energy: 0.95 },
    { t: 0.45, energy: 0.55 },
    { t: 0.7, energy: 0.35 },
    { t: 1, energy: 0.1 },
  ],
  regions: [
    {
      id: 'preparacion',
      name: 'Preparación',
      startT: 0,
      endT: 0.18,
      targets: [
        { defId: 'calm', weight: 1, min: 7, max: 10 },
        { defId: 'depth', weight: 0.5, min: 4, max: 8 },
        { defId: 'moment', weight: 0.4, equals: 'apertura' },
      ],
    },
    {
      id: 'soplo',
      name: 'Soplo',
      startT: 0.18,
      endT: 0.45,
      targets: [
        { defId: 'energy', weight: 1, min: 8, max: 10 },
        { defId: 'tension', weight: 0.8, min: 6, max: 10 },
        { defId: 'moment', weight: 0.4, equals: 'pico' },
      ],
    },
    {
      id: 'integracion',
      name: 'Integración',
      startT: 0.45,
      endT: 0.78,
      targets: [
        { defId: 'depth', weight: 0.9, min: 6, max: 10 },
        { defId: 'calm', weight: 0.7, min: 5, max: 9 },
        { defId: 'energy', weight: 0.5, min: 2, max: 5 },
      ],
    },
    {
      id: 'tierra',
      name: 'Tierra',
      startT: 0.78,
      endT: 1,
      targets: [
        { defId: 'calm', weight: 1, min: 8, max: 10 },
        { defId: 'moment', weight: 0.5, equals: 'cierre' },
      ],
    },
  ],
  anchors: [
    { id: 'r-apertura', trackId: 'icaro-apertura', placement: { type: 'region', regionId: 'preparacion', position: 'start' } },
    { id: 'r-soplo', trackId: 'fuego-interior', placement: { type: 'region', regionId: 'soplo', position: 'any' } },
    { id: 'r-tierra', trackId: 'cierre-tierra', placement: { type: 'region', regionId: 'tierra', position: 'end' } },
  ],
  silences: [
    { id: 's-post-soplo', t: 0.46, durationMs: 90_000 }, // quietud tras el soplo
  ],
  ambient: { enabled: true, trackId: NATURE_TRACK_ID, baseVolume: 0.25 },
};

/** Todas las plantillas semilla disponibles. */
export const SEED_TEMPLATES: RitualTemplate[] = [SEED_AYAHUASCA_TEMPLATE, SEED_RAPE_TEMPLATE];
