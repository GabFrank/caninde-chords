// Paleta e íconos de los pads.
//
// En Firestore se guarda la CLAVE ('thunder', 'amber'), nunca la clase de
// Tailwind: Tailwind 4 compila sólo las clases que ve escritas en el código, así
// que una clase armada por concatenación en tiempo de ejecución no existiría en
// el CSS final. Acá están escritas enteras.

import {
  CloudLightning, Bird, Waves, Wind, Flame, TreePine, Droplets, Bell,
  Drum, Sparkles, Music, Volume2, Mountain, Sun, Moon, Zap, Heart, Star,
  type LucideIcon,
} from 'lucide-react';

export interface PadColor {
  id: string;
  label: string;
  /** Fondo y borde del pad en reposo. */
  surface: string;
  /** Fondo mientras suena. */
  active: string;
  /** Punto de color en las listas y en el selector. */
  dot: string;
}

export const SOUNDPAD_COLORS: PadColor[] = [
  { id: 'slate',  label: 'Pizarra',  surface: 'bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100',       active: 'bg-slate-500 border-slate-400 text-white',   dot: 'bg-slate-500' },
  { id: 'blue',   label: 'Azul',     surface: 'bg-blue-100 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-100',             active: 'bg-blue-600 border-blue-400 text-white',     dot: 'bg-blue-600' },
  { id: 'cyan',   label: 'Agua',     surface: 'bg-cyan-100 dark:bg-cyan-950/60 border-cyan-300 dark:border-cyan-800 text-cyan-950 dark:text-cyan-100',             active: 'bg-cyan-600 border-cyan-400 text-white',     dot: 'bg-cyan-600' },
  { id: 'green',  label: 'Selva',    surface: 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100', active: 'bg-emerald-600 border-emerald-400 text-white', dot: 'bg-emerald-600' },
  { id: 'amber',  label: 'Fuego',    surface: 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100',       active: 'bg-amber-500 border-amber-300 text-white',   dot: 'bg-amber-500' },
  { id: 'red',    label: 'Trueno',   surface: 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-950 dark:text-red-100',                   active: 'bg-red-600 border-red-400 text-white',       dot: 'bg-red-600' },
  { id: 'purple', label: 'Ceremonia',surface: 'bg-purple-100 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-100', active: 'bg-purple-600 border-purple-400 text-white', dot: 'bg-purple-600' },
  { id: 'pink',   label: 'Aurora',   surface: 'bg-pink-100 dark:bg-pink-950/60 border-pink-300 dark:border-pink-800 text-pink-950 dark:text-pink-100',             active: 'bg-pink-600 border-pink-400 text-white',     dot: 'bg-pink-600' },
];

export const DEFAULT_COLOR_ID = 'slate';

export function padColor(id?: string): PadColor {
  return SOUNDPAD_COLORS.find(c => c.id === id) ?? SOUNDPAD_COLORS[0];
}

export const SOUNDPAD_ICONS: Record<string, LucideIcon> = {
  thunder: CloudLightning,
  bird: Bird,
  waves: Waves,
  wind: Wind,
  fire: Flame,
  forest: TreePine,
  rain: Droplets,
  bell: Bell,
  drum: Drum,
  sparkles: Sparkles,
  music: Music,
  volume: Volume2,
  mountain: Mountain,
  sun: Sun,
  moon: Moon,
  zap: Zap,
  heart: Heart,
  star: Star,
};

export const DEFAULT_ICON_ID = 'volume';

export function padIcon(id?: string): LucideIcon {
  return SOUNDPAD_ICONS[id ?? ''] ?? SOUNDPAD_ICONS[DEFAULT_ICON_ID];
}

/** Categoría implícita de los pads que todavía no se clasificaron. */
export const UNCATEGORIZED_ID = 'uncategorized';
