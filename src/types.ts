export interface Song {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  tempo?: string;
  content: string;
  ownerId: string;
  collaborators?: string[];
  editors?: string[];
  originalId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Setlist {
  id: string;
  name: string;
  ownerId: string;
  songIds: string[];
  collaborators?: string[];
  editors?: string[];
  originalId?: string;
  createdAt: any;
}

export interface Session {
  id: string;
  setlistId: string;
  directorId: string;
  directorName: string;
  currentSongIndex: number;
  currentSongId: string;
  active: boolean;
  isOffline?: boolean;
  updatedAt: any;
}
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: 'user' | 'admin';
  language?: 'en' | 'es';
  sidebarPosition?: 'left' | 'right';
  sidebarWidth?: number;
  defaultFontSize?: number;
  defaultColumns?: number;
  defaultTranspose?: number;
  chordNotation?: 'scientific' | 'solfege';
  chordFontSize?: number;
  showCapo?: boolean;
  minFontSize?: number;
  maxFontSize?: number;
  defaultAutoResize?: boolean;
  alwaysShowSidebar?: boolean;
}

export interface UserSongSettings {
  id: string; // userId_songId
  userId: string;
  songId: string;
  fontSize?: number;
  columns?: number;
  transpose?: number;
  autoResize?: boolean;
  updatedAt: any;
}

export interface Share {
  id: string;
  type: 'songs' | 'setlists';
  resourceId: string;
  title: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
  songsData?: Song[]; // For setlists, include all songs
  resourceData?: any; // The actual song or setlist data
}

export interface Contact {
  id: string;
  ownerId: string;
  email: string;
  name?: string;
  lastInteraction: any;
}

// ── Soundpad ──────────────────────────────────────────────────────────────────
// El catálogo (esto) vive en Firestore y se sincroniza entre dispositivos.
// El audio en sí NO: los MP3 se guardan en IndexedDB, en cada dispositivo, bajo
// la clave `fileKey`. Ver `src/services/soundLibrary.ts`.

export interface SoundPad {
  id: string;
  ownerId: string;
  name: string;
  categoryId: string;
  /** Color del pad. Clave de SOUNDPAD_COLORS, no una clase de Tailwind. */
  color?: string;
  /** Nombre del ícono. Clave de SOUNDPAD_ICONS. */
  icon?: string;
  /** Clave del blob en IndexedDB. Vale también entre dispositivos: si falta el
   *  archivo acá, el pad se muestra como "sin audio" y se puede revincular. */
  fileKey: string;
  fileName: string;
  fileSize: number;
  durationMs?: number;
  /** 0 a 1. */
  volume: number;
  /** Cuántas veces suena. 1 = una sola; 0 = en bucle hasta pararlo. */
  repeat: number;
  /** true: se superpone a lo que esté sonando.
   *  false: corta todo lo demás antes de empezar. */
  overlay: boolean;
  /** Milisegundos de fundido al ser cortado por un pad exclusivo o por pánico. */
  fadeOutMs?: number;
  /** Nota MIDI que dispara este pad (0-127). Se asigna con "aprender". */
  midiNote?: number;
  /** Recorte NO destructivo: dónde empieza a sonar, en ms desde el inicio. */
  trimStartMs?: number;
  /** Recorte NO destructivo: dónde deja de sonar, en ms desde el inicio. */
  trimEndMs?: number;
  favorite: boolean;
  order: number;
  createdAt: any;
  updatedAt: any;
}

export interface SoundCategory {
  id: string;
  ownerId: string;
  name: string;
  color: string;
  order: number;
  createdAt: any;
}
