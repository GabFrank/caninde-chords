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
