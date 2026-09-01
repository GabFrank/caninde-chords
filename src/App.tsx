import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion, arrayRemove, or, getDoc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './components/AuthProvider';
import { Song, Setlist, UserProfile, UserSongSettings, Share, Contact, Session } from './types';
import { translations, Language } from './translations';
import { SongViewer } from './components/SongViewer';
import { SongEditor } from './components/SongEditor';
import { SetlistViewer } from './components/SetlistViewer';
import { SetlistEditor } from './components/SetlistEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Music, Plus, LogIn, LogOut, Settings, Settings2, List, Search, ChevronRight, ChevronLeft, ChevronDown, Share2, Trash2, Edit2, UserPlus, Sun, Moon, Maximize2, Minimize2, Columns, Users, X, XCircle, Radio, Copy, Check, Maximize, Hash, WifiOff, Upload, RefreshCw, Save, Mail, AlertCircle, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getLogoUrl, isStandalonePWA } from './lib/utils';
import { useViewport } from './lib/useViewport';
import { importOpenSongFile } from './lib/openSongParser';
import { UtilitariosHub } from './components/UtilitariosHub';
import { AuthDiagnostics } from './components/AuthDiagnostics';
import { describeAuthError, preferredLang } from './lib/authErrors';
import { recordAttempt, finishAttempt } from './lib/loginAttempt';

// Custom Modal Component
const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div data-overlay className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90dvh]"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;

export default function App() {
  const { user, profile, loading, isAuthReady, updateProfile, authError, setAuthError, authResolvedMs } = useAuth();
  
  useEffect(() => {
    // Attempt to unlock orientation if the API is available
    // On iOS, screen.orientation might be missing or incomplete
    if (typeof window !== 'undefined' && window.screen && window.screen.orientation && typeof (window.screen.orientation as any).unlock === 'function') {
      try {
        (window.screen.orientation as any).unlock();
      } catch (e) {
        // Silently fail on orientation unlock as it is not critical
        console.debug('Orientation unlock failed:', e);
      }
    }
  }, []);

  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeTab, setActiveTab] = useState<'songs' | 'setlists' | 'utilities'>('songs');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedSetlist, setSelectedSetlist] = useState<Setlist | null>(null);
  const [currentSetlistIndex, setCurrentSetlistIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = window.localStorage.getItem('cc:theme');
      if (saved) return saved === 'dark';
    } catch {
      // Sin almacenamiento se usa el valor por defecto.
    }
    return true;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('cc:theme', isDarkMode ? 'dark' : 'light');
    } catch {
      // idem
    }
  }, [isDarkMode]);
  const [fontSize, setFontSize] = useState(16);
  const [columns, setColumns] = useState(1);
  const [transpose, setTranspose] = useState(0);
  const [autoResize, setAutoResize] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const [userSongSettings, setUserSongSettings] = useState<Record<string, UserSongSettings>>({});
  const [pendingShares, setPendingShares] = useState<Share[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const wakeLockRef = useRef<any>(null);
  const lastAppliedSongId = useRef<string | null>(null);
  const hasAppliedSongSettings = useRef<boolean>(false);
  const [hasPendingSongChanges, setHasPendingSongChanges] = useState(false);
  const [tempProfile, setTempProfile] = useState<any>(null);
  const [hasPendingProfileChanges, setHasPendingProfileChanges] = useState(false);
  const [globalLoading, setGlobalLoading] = useState<string | null>(null);

  // Handle URL parameters (join, etc.)
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');

    if (joinId) {
      const joinSession = async () => {
        try {
          const sessionDoc = await getDoc(doc(db, 'sessions', joinId));
          if (sessionDoc.exists()) {
            const session = { id: sessionDoc.id, ...sessionDoc.data() } as Session;
            if (session.active) {
              // Find the setlist
              const canonicalId = session.setlistId;
              const localSetlist = setlists.find(s => s.id === canonicalId || s.originalId === canonicalId);
              
              if (localSetlist) {
                setSelectedSetlist(localSetlist);
                setActiveTab('setlists');
                handleJoinSession(session);
                // Clear URL param without reloading
                window.history.replaceState({}, '', window.location.pathname);
              }
            }
          }
        } catch (err) {
          console.error('Error joining session via URL:', err);
        }
      };
      
      if (setlists.length > 0) {
        joinSession();
      }
    }
  }, [isAuthReady, user, setlists]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setGlobalLoading(t.importing);
    let totalImported = 0;
    let totalErrors: string[] = [];

    try {
      const titleArtistToId: Record<string, string> = {};
      const oldIdToNewId: Record<string, string> = {};

      // Pre-fill map with existing songs
      songs.forEach(s => {
        const key = `${s.title.toLowerCase().trim()}|${(s.artist || '').toLowerCase().trim()}`;
        titleArtistToId[key] = s.id;
      });

      for (let i = 0; i < files.length; i++) {
        const result = await importOpenSongFile(files[i]);
        
        // Import Songs
        for (const songData of result.songs) {
          try {
            const key = `${songData.title?.toLowerCase().trim()}|${(songData.artist || '').toLowerCase().trim()}`;
            const existingId = titleArtistToId[key];

            let finalId = existingId;

            if (existingId) {
              if (overwriteOnImport) {
                await updateDoc(doc(db, 'songs', existingId), {
                  ...songData,
                  updatedAt: serverTimestamp()
                });
                totalImported++;
              } else {
                totalErrors.push(`${songData.title}: ${t.duplicateSong}`);
              }
            } else {
              const docRef = await addDoc(collection(db, 'songs'), {
                ...songData,
                ownerId: user.uid,
                collaborators: [],
                editors: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              finalId = docRef.id;
              titleArtistToId[key] = finalId;
              totalImported++;
            }

            if (finalId && (songData as any).backupId) {
              oldIdToNewId[(songData as any).backupId] = finalId;
            }
          } catch (err) {
            totalErrors.push(`Error saving ${songData.title}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Import Setlists (if any)
        if (result.setlists) {
          for (const setlistData of result.setlists) {
            try {
              const existingSetlist = setlists.find(s => s.name === setlistData.name && s.ownerId === user.uid);
              if (existingSetlist) {
                totalErrors.push(`${setlistData.name}: ${t.duplicateSetlist}`);
                continue;
              }

              // Remap song IDs using the mapping we built
              const remappedSongIds = (setlistData.songIds || []).map(oldId => oldIdToNewId[oldId] || oldId);

              await addDoc(collection(db, 'setlists'), {
                ...setlistData,
                songIds: remappedSongIds,
                ownerId: user.uid,
                createdAt: serverTimestamp()
              });
            } catch (err) {
              totalErrors.push(`Error saving setlist ${setlistData.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        totalErrors = [...totalErrors, ...result.errors];
      }

      if (totalErrors.length > 0) {
        showToast(totalErrors[0], 'error');
        setImportErrors(totalErrors);
      } else {
        showToast(`${totalImported} ${t.songs} ${t.successUpdate}`);
      }
      setIsImportModalOpen(false);
    } catch (err) {
      console.error('Import error:', err);
      showToast('An error occurred during import.', 'error');
    } finally {
      setGlobalLoading(null);
      // Reset file input
      e.target.value = '';
    }
  };

  const toggleFullScreen = async () => {
    if (!isFullScreen) {
      try {
        // En iPhone `requestFullscreen` no existe en documentElement: sin este
        // fallback el `if` no entra, no lanza error, y la app se creía en
        // pantalla completa escondiendo la cabecera sin estarlo.
        const el = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        // Request wake lock
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      // Release wake lock
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }
    // Si el navegador no ofrece pantalla completa (iPhone), no cambiamos el
    // estado: esconder la cabecera sin estar en fullscreen deja al usuario sin
    // salida visible.
    const fsEl = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen) setIsFullScreen(!isFullScreen);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          console.error(`Wake Lock re-request failed: ${err.message}`);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);
  const [sidebarPosition, setSidebarPosition] = useState<'left' | 'right'>('left');
  const [sidebarWidth, setSidebarWidth] = useState(20);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  // El layout se decide por ancho Y alto: un teléfono acostado es ancho y bajo,
  // y con el criterio anterior (solo ancho) recibía el layout de escritorio.
  const { mode, isLandscape, isTablet } = useViewport();
  const isCompact = mode === 'compact';
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Handle window resize, online status and PWA install prompt
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Modal states
  const [collabModal, setCollabModal] = useState<{ isOpen: boolean; type: 'songs' | 'setlists'; id: string } | null>(null);
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; type: 'songs' | 'setlists'; id: string; title: string } | null>(null);
  const [joinModal, setJoinModal] = useState<{ isOpen: boolean; type: 'songs' | 'setlists'; id: string; title: string } | null>(null);
  const [preferencesModal, setPreferencesModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ type: 'songs' | 'setlists'; id: string } | null>(null);
  const [collabEmail, setCollabEmail] = useState('');
  const [collabRole, setCollabRole] = useState<'editor' | 'viewer'>('viewer');
  const [copied, setCopied] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [shareEmail, setShareEmail] = useState('');
  const [isSendingShare, setIsSendingShare] = useState(false);
  const [shareConfirmModal, setShareConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const [removeSongsCheck, setRemoveSongsCheck] = useState(false);

  const t = translations[profile?.language || 'en'];

  // Sync songs (Owner or Collaborator)
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const songsRef = collection(db, 'songs');
    const q = query(
      songsRef, 
      or(
        where('ownerId', '==', user.uid),
        where('collaborators', 'array-contains', user.email),
        where('collaborators', 'array-contains', user.uid),
        where('editors', 'array-contains', user.email),
        where('editors', 'array-contains', user.uid)
      )
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSongs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Song));
      setSongs(fetchedSongs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'songs'));

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Sync setlists (Owner or Collaborator)
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const setlistsRef = collection(db, 'setlists');
    const q = query(
      setlistsRef, 
      or(
        where('ownerId', '==', user.uid),
        where('collaborators', 'array-contains', user.email),
        where('collaborators', 'array-contains', user.uid),
        where('editors', 'array-contains', user.email),
        where('editors', 'array-contains', user.uid)
      )
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSetlists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Setlist));
      setSetlists(fetchedSetlists);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'setlists'));

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Sync UserSongSettings
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const settingsRef = collection(db, 'userSongSettings');
    const q = query(settingsRef, where('userId', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const settingsMap: Record<string, UserSongSettings> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as UserSongSettings;
        settingsMap[data.songId] = { id: doc.id, ...data };
      });
      setUserSongSettings(settingsMap);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'userSongSettings'));

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Sync pending shares and contacts
  useEffect(() => {
    if (!isAuthReady || !user) return;

    // Sync pending shares
    const sharesRef = collection(db, 'shares');
    const sharesQuery = query(
      sharesRef,
      where('recipientEmail', '==', user.email),
      where('status', '==', 'pending')
    );
    const unsubscribeShares = onSnapshot(sharesQuery, (snapshot) => {
      setPendingShares(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Share)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'shares'));

    // Sync contacts
    const contactsRef = collection(db, 'contacts');
    const contactsQuery = query(contactsRef, where('ownerId', '==', user.uid));
    const unsubscribeContacts = onSnapshot(contactsQuery, (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)).sort((a, b) => {
        const aTime = a.lastInteraction?.toMillis() || 0;
        const bTime = b.lastInteraction?.toMillis() || 0;
        return bTime - aTime;
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'contacts'));

    return () => {
      unsubscribeShares();
      unsubscribeContacts();
    };
  }, [isAuthReady, user]);

  // Sync global state with song settings when selecting a song or changing setlist song
  useEffect(() => {
    let songId: string | null = null;
    if (selectedSong) {
      songId = selectedSong.id;
    } else if (selectedSetlist) {
      songId = selectedSetlist.songIds[currentSetlistIndex];
    }

    if (!songId) {
      lastAppliedSongId.current = null;
      hasAppliedSongSettings.current = false;
      return;
    }

    // If song ID changed, reset the "applied" flag
    if (songId !== lastAppliedSongId.current) {
      hasAppliedSongSettings.current = false;
      lastAppliedSongId.current = songId;
    }

    const settings = userSongSettings[songId];
    
    // Only apply settings if we haven't applied the song-specific ones yet
    if (!hasAppliedSongSettings.current) {
      if (settings) {
        // Use functional updates to avoid stale state issues if multiple settings load
        setFontSize(prev => settings.fontSize || prev);
        setColumns(prev => settings.columns || prev);
        setTranspose(prev => settings.transpose !== undefined ? settings.transpose : prev);
        setAutoResize(prev => settings.autoResize !== undefined ? settings.autoResize : prev);
        hasAppliedSongSettings.current = true;
      } else if (profile) {
        // Fallback to profile defaults if no song settings exist yet
        setFontSize(prev => profile.defaultFontSize || prev);
        setColumns(prev => profile.defaultColumns || prev);
        setTranspose(prev => profile.defaultTranspose !== undefined ? profile.defaultTranspose : prev);
        setAutoResize(prev => profile.defaultAutoResize !== undefined ? profile.defaultAutoResize : prev);
        // We set this to true to prevent profile defaults from overwriting 
        // user changes before settings load from Firestore
        hasAppliedSongSettings.current = true;
      }
    }
  }, [selectedSong?.id, selectedSetlist?.id, currentSetlistIndex, userSongSettings, profile]);

  const updateContact = async (email: string, name?: string) => {
    if (!user || email === user.email) return;
    
    const contactId = `${user.uid}_${email.replace(/\./g, '_')}`;
    const contactRef = doc(db, 'contacts', contactId);
    
    try {
      await setDoc(contactRef, {
        ownerId: user.uid,
        email,
        name: name || email.split('@')[0],
        lastInteraction: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error updating contact:', error);
    }
  };

  const handleSendInvitations = async () => {
    if (!user || !shareModal) return;
    
    const emails = [...selectedContacts];
    if (shareEmail && !emails.includes(shareEmail)) {
      emails.push(shareEmail);
    }
    
    if (emails.length === 0) return;
    
    setGlobalLoading(t.sending);
    try {
      let resourceData: any = null;
      let songsData: Song[] = [];
      
      if (shareModal.type === 'songs') {
        const song = songs.find(s => s.id === shareModal.id);
        if (song) {
          resourceData = { ...song };
          delete resourceData.id;
        }
      } else {
        const setlist = setlists.find(s => s.id === shareModal.id);
        if (setlist) {
          resourceData = { ...setlist };
          delete resourceData.id;
          songsData = setlist.songIds
            .map(id => songs.find(s => s.id === id))
            .filter(Boolean)
            .map(s => {
              const data = { ...s! };
              // Ensure the current ID is preserved as originalId for the recipient
              data.originalId = s!.id;
              delete (data as any).id;
              return data;
            });
        }
      }
      
      if (!resourceData) throw new Error('Resource not found');
      
      for (const email of emails) {
        await addDoc(collection(db, 'shares'), {
          type: shareModal.type,
          resourceId: shareModal.id,
          title: shareModal.title,
          senderId: user.uid,
          senderEmail: user.email,
          senderName: profile?.displayName || user.displayName || user.email,
          recipientEmail: email,
          status: 'pending',
          createdAt: serverTimestamp(),
          resourceData,
          songsData
        });
        await updateContact(email);
      }
      
      showToast(t.invitationSent);
      setShareModal(null);
      setShareEmail('');
      setSelectedContacts([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shares');
    } finally {
      setGlobalLoading(null);
    }
  };

  const handleAcceptShare = async (share: Share) => {
    if (!user) return;
    
    setGlobalLoading(t.joining);
    try {
      if (share.type === 'songs') {
        const existingSong = songs.find(s => s.title === share.resourceData.title && s.artist === share.resourceData.artist);
        if (existingSong) {
          setGlobalLoading(null);
          setShareConfirmModal({
            title: t.overwriteLyrics,
            message: t.overwriteConfirm,
            onConfirm: async () => {
              setGlobalLoading(t.joining);
              await updateDoc(doc(db, 'songs', existingSong.id), {
                ...share.resourceData,
                originalId: share.resourceId,
                updatedAt: serverTimestamp()
              });
              await finalizeAccept(share);
            },
            onCancel: async () => {
              setGlobalLoading(t.joining);
              await finalizeAccept(share);
            }
          });
          return;
        } else {
          await addDoc(collection(db, 'songs'), {
            ...share.resourceData,
            ownerId: user.uid,
            originalId: share.resourceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // Setlist
        const existingSongs = songs.filter(s => share.songsData?.some(ss => ss.title === s.title && ss.artist === s.artist));
        
        const processSetlist = async (overwriteAll: boolean) => {
          setGlobalLoading(t.joining);
          const newSongIds: string[] = [];
          for (const songData of (share.songsData || [])) {
            const existing = songs.find(s => s.title === songData.title && s.artist === songData.artist);
            if (existing) {
              if (overwriteAll) {
                await updateDoc(doc(db, 'songs', existing.id), {
                  ...songData,
                  updatedAt: serverTimestamp()
                });
              }
              newSongIds.push(existing.id);
            } else {
              const docRef = await addDoc(collection(db, 'songs'), {
                ...songData,
                ownerId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              newSongIds.push(docRef.id);
            }
          }
          
          await addDoc(collection(db, 'setlists'), {
            ...share.resourceData,
            ownerId: user.uid,
            songIds: newSongIds,
            originalId: share.resourceId,
            createdAt: serverTimestamp()
          });
          await finalizeAccept(share);
        };

        if (existingSongs.length > 0) {
          setGlobalLoading(null);
          setShareConfirmModal({
            title: t.overwriteLyrics,
            message: t.overwriteSetlistConfirm,
            onConfirm: () => processSetlist(true),
            onCancel: () => processSetlist(false)
          });
          return;
        } else {
          await processSetlist(false);
          return;
        }
      }
      
      await finalizeAccept(share);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shares');
      setGlobalLoading(null);
    }
  };

  const finalizeAccept = async (share: Share) => {
    try {
      await updateDoc(doc(db, 'shares', share.id), { status: 'accepted' });
      await updateContact(share.senderEmail, share.senderName);
      showToast(t.successJoin);
      setShareConfirmModal(null);
    } finally {
      setGlobalLoading(null);
    }
  };

  const handleRejectShare = async (shareId: string) => {
    try {
      await updateDoc(doc(db, 'shares', shareId), { status: 'rejected' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shares');
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetData = async () => {
    if (!user) return;
    
    setGlobalLoading(t.resetting);
    try {
      const operations: (() => void)[] = [];
      const userIdentities = [user.uid, user.email].filter(Boolean) as string[];

      // 1. Collect all operations
      const ownedSongsSnap = await getDocs(query(collection(db, 'songs'), where('ownerId', '==', user.uid)));
      const ownedSetlistsSnap = await getDocs(query(collection(db, 'setlists'), where('ownerId', '==', user.uid)));

      ownedSongsSnap.docs.forEach(doc => {
        operations.push(() => { return { type: 'delete', ref: doc.ref } as any });
      });
      ownedSetlistsSnap.docs.forEach(doc => {
        operations.push(() => { return { type: 'delete', ref: doc.ref } as any });
      });

      for (const id of userIdentities) {
        const collabSongsSnap = await getDocs(query(collection(db, 'songs'), where('collaborators', 'array-contains', id)));
        const editorSongsSnap = await getDocs(query(collection(db, 'songs'), where('editors', 'array-contains', id)));
        
        collabSongsSnap.docs.forEach(d => {
          operations.push(() => { return { type: 'update', ref: d.ref, data: { collaborators: arrayRemove(id) } } as any });
        });
        editorSongsSnap.docs.forEach(d => {
          operations.push(() => { return { type: 'update', ref: d.ref, data: { editors: arrayRemove(id) } } as any });
        });

        const collabSetlistsSnap = await getDocs(query(collection(db, 'setlists'), where('collaborators', 'array-contains', id)));
        const editorSetlistsSnap = await getDocs(query(collection(db, 'setlists'), where('editors', 'array-contains', id)));

        collabSetlistsSnap.docs.forEach(d => {
          operations.push(() => { return { type: 'update', ref: d.ref, data: { collaborators: arrayRemove(id) } } as any });
        });
        editorSetlistsSnap.docs.forEach(d => {
          operations.push(() => { return { type: 'update', ref: d.ref, data: { editors: arrayRemove(id) } } as any });
        });
      }

      // Execute in chunks of 450 to stay under the 500 limit
      const CHUNK_SIZE = 450;
      for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        
        chunk.forEach(getOp => {
          const op = getOp() as any;
          if (op.type === 'delete') {
            batch.delete(op.ref);
          } else if (op.type === 'update') {
            batch.update(op.ref, op.data);
          }
        });
        
        await batch.commit();
      }

      showToast(t.successUpdate);
      setPreferencesModal(false);
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Reset Error:', error);
      handleFirestoreError(error, OperationType.DELETE, 'bulk-reset');
    } finally {
      setGlobalLoading(null);
    }
  };

  const handleBackup = () => {
    if (!user) return;
    setGlobalLoading(t.exporting || 'Exporting...');

    try {
      const mySongs = songs.filter(s => s.ownerId === user.uid);
      const mySetlists = setlists.filter(s => s.ownerId === user.uid);

      const backupData = {
        version: APP_VERSION,
        exportDate: new Date().toISOString(),
        songs: mySongs.map(s => {
          const { id, ...data } = s;
          return { ...data, backupId: id }; // Keep original ID for remapping setlists
        }),
        setlists: mySetlists.map(s => {
          const { id, ...data } = s;
          return data;
        })
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OpenSong_Backup_${new Date().toISOString().split('T')[0]}.osb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Error creating backup', 'error');
    } finally {
      setTimeout(() => setGlobalLoading(null), 500);
    }
  };

  const repairSetlist = async (setlist: Setlist) => {
    if (!user) return;
    const validSongIds = setlist.songIds.filter(id => songs.some(s => s.id === id));
    if (validSongIds.length === setlist.songIds.length) return;

    try {
      await updateDoc(doc(db, 'setlists', setlist.id), {
        songIds: validSongIds
      });
      showToast(t.successUpdate);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `setlists/${setlist.id}`);
    }
  };

  const handleSettingsChange = async (songId: string, settings: Partial<UserSongSettings>) => {
    if (!user) return;
    
    setIsUpdatingSettings(true);
    const settingId = `${user.uid}_${songId}`;
    const settingRef = doc(db, 'userSongSettings', settingId);

    try {
      await setDoc(settingRef, {
        ...settings,
        userId: user.uid,
        songId,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `userSongSettings/${settingId}`);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const saveCurrentSongSettings = async () => {
    const songId = selectedSong?.id || (selectedSetlist ? selectedSetlist.songIds[currentSetlistIndex] : null);
    if (songId) {
      // Deactivate autoResize when saving so the manually set (or auto-calculated) 
      // size and columns are fixed for the next session.
      setAutoResize(false);
      
      await handleSettingsChange(songId, {
        fontSize,
        columns,
        transpose,
        autoResize: false // Explicitly save as false
      });
      setHasPendingSongChanges(false);
      showToast(t.successUpdate);
    }
  };

  // Handle Share Links on mount
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const params = new URLSearchParams(window.location.search);
    const joinSongId = params.get('joinSong');
    const joinSetlistId = params.get('joinSetlist');
    const isNew = params.get('new') === 'true';

    if (isNew) {
      setIsEditing(true);
      setSelectedSong(null);
      setSelectedSetlist(null);
      // Clear the URL parameters to prevent re-triggering on re-mounts
      const newUrl = window.location.pathname;
      if (window.location.search) {
        window.history.replaceState({}, '', newUrl);
      }
    }

    const checkJoin = async () => {
      if (joinSongId) {
        const songDoc = await getDoc(doc(db, 'songs', joinSongId));
        if (songDoc.exists()) {
          const data = songDoc.data() as Song;
          if (data.ownerId !== user.uid && !data.collaborators?.includes(user.email!)) {
            setJoinModal({ isOpen: true, type: 'songs', id: joinSongId, title: data.title });
          }
        }
      } else if (joinSetlistId) {
        const setlistDoc = await getDoc(doc(db, 'setlists', joinSetlistId));
        if (setlistDoc.exists()) {
          const data = setlistDoc.data() as Setlist;
          if (data.ownerId !== user.uid && !data.collaborators?.includes(user.email!)) {
            setJoinModal({ isOpen: true, type: 'setlists', id: joinSetlistId, title: data.name });
          }
        }
      }
    };

    checkJoin();
  }, [isAuthReady, user]);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (profile && !initialLoadDone.current) {
      if (profile.sidebarPosition) setSidebarPosition(profile.sidebarPosition);
      if (profile.sidebarWidth) setSidebarWidth(profile.sidebarWidth);
      if (profile.defaultFontSize) setFontSize(profile.defaultFontSize);
      if (profile.defaultColumns) setColumns(profile.defaultColumns);
      if (profile.defaultTranspose !== undefined) setTranspose(profile.defaultTranspose);
      initialLoadDone.current = true;
    }
  }, [profile]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isDirector, setIsDirector] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [p2pOnline, setP2POnline] = useState(false);
  const [showDirectorDialog, setShowDirectorDialog] = useState(false);
  const [showShareSessionDialog, setShowShareSessionDialog] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);

  const handleSessionClosed = () => {
    setActiveSession(null);
    setIsDirector(false);
    showToast(t.sessionClosed);
  };

  const handleJoinSession = (session: Session) => {
    setActiveSession(session);
    setIsDirector(false);
  };

  // El popup falla a menudo en móvil y en la PWA instalada (la ventana no puede
  // devolverle el resultado a la que la abrió). Antes ese fallo se tragaba en
  // silencio y la app volvía al login sin decir nada. Ahora: se cae a la
  // redirección cuando el popup ni llegó a abrirse, y en el resto de los casos
  // se muestra el motivo real.
  const handleLogin = async (viaRedirect = false) => {
    setAuthError(null);
    // En la PWA instalada el popup no tiene forma de devolver el resultado a la
    // ventana que lo abrió: se va directo por redirección.
    if (viaRedirect || isStandalonePWA()) {
      try {
        recordAttempt('redirect');
        await signInWithRedirect(auth, googleProvider);
      } catch (error) {
        console.error('Redirect login failed', error);
        setAuthError(describeAuthError(error));
      }
      return;
    }
    try {
      recordAttempt('popup');
      await signInWithPopup(auth, googleProvider);
      finishAttempt('ok');
    } catch (error) {
      console.error('Login failed', error);
      finishAttempt((error as { code?: string })?.code || 'error');
      const issue = describeAuthError(error);
      setAuthError(issue);
      if (issue.autoRedirect) {
        try {
          recordAttempt('redirect');
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          console.error('Redirect fallback failed', redirectError);
          setAuthError(describeAuthError(redirectError));
        }
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddSongFromWorkshop = async (songTitle: string, songContent: string) => {
    if (!user) return;
    setGlobalLoading('Exportando...');
    try {
      const docRef = await addDoc(collection(db, 'songs'), {
        title: songTitle,
        artist: 'Composición Caninde',
        content: songContent,
        ownerId: user.uid,
        collaborators: [],
        editors: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setActiveTab('songs');
      setSelectedSong({
        id: docRef.id,
        title: songTitle,
        artist: 'Composición Caninde',
        content: songContent,
        ownerId: user.uid,
        collaborators: [],
        editors: []
      } as any);
      setSelectedSetlist(null);
      setIsEditing(false);
      showToast('¡Composición exportada exitosamente!');
    } catch (e) {
      console.error('Failed to export composition song to library:', e);
      showToast('Error al exportar la composición', 'error');
    } finally {
      setGlobalLoading(null);
    }
  };

  const saveSong = async (songData: Partial<Song>) => {
    if (!user) return;
    setGlobalLoading(t.saving || 'Saving...');
    try {
      if (selectedSong?.id) {
        const isOwner = selectedSong.ownerId === user.uid;
        const isEditor = selectedSong.editors?.includes(user.uid) || selectedSong.editors?.includes(user.email!);

        if (isOwner || isEditor) {
          // Direct edit for owners and editors
          await updateDoc(doc(db, 'songs', selectedSong.id), {
            ...songData,
            updatedAt: serverTimestamp(),
          });
          showToast(t.successUpdate);
        } else {
          // Branching on Edit (Option 3): Create a personal copy
          const { id, createdAt, updatedAt, ownerId, collaborators, editors, ...originalData } = selectedSong;
          await addDoc(collection(db, 'songs'), {
            ...originalData,
            ...songData,
            ownerId: user.uid,
            collaborators: [],
            editors: [],
            originalId: id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showToast(t.successUpdate + " (Personal copy)");
        }
      } else {
        const isDuplicate = songs.some(s => 
          s.title.toLowerCase().trim() === (songData.title || '').toLowerCase().trim() && 
          (s.artist || '').toLowerCase().trim() === (songData.artist || '').toLowerCase().trim() &&
          s.ownerId === user.uid
        );

        if (isDuplicate) {
          alert(t.duplicateSong);
          return;
        }

        await addDoc(collection(db, 'songs'), {
          ...songData,
          ownerId: user.uid,
          collaborators: [],
          editors: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast(t.successUpdate);
      }
      setIsEditing(false);
      setSelectedSong(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'songs');
    } finally {
      setGlobalLoading(null);
    }
  };

  const saveSetlist = async (setlistData: Partial<Setlist>) => {
    if (!user) return;
    setGlobalLoading(t.saving || 'Saving...');
    try {
      if (selectedSetlist?.id) {
        const isOwner = selectedSetlist.ownerId === user.uid;
        const isEditor = selectedSetlist.editors?.includes(user.uid) || selectedSetlist.editors?.includes(user.email!);

        if (!isOwner && !isEditor) {
          showToast("Permission denied: You are not an editor of this setlist.", "error");
          return;
        }

        // Auto-link songs logic (Option 2 requirement)
        // If songs are added to a shared setlist, make sure collaborators of the setlist can see the songs
        const allSetlistCollabs = Array.from(new Set([
          ...(selectedSetlist.collaborators || []),
          ...(selectedSetlist.editors || [])
        ]));

        if (setlistData.songIds && allSetlistCollabs.length > 0) {
          const batch = writeBatch(db);
          let needsBatch = false;

          for (const songId of setlistData.songIds) {
            const song = songs.find(s => s.id === songId);
            // Only auto-share my OWN songs added to a shared setlist
            if (song && song.ownerId === user.uid) {
              const currentCollabs = song.collaborators || [];
              const currentEditors = song.editors || [];
              const missingCollabs = allSetlistCollabs.filter(email => !currentCollabs.includes(email) && !currentEditors.includes(email));
              
              if (missingCollabs.length > 0) {
                batch.update(doc(db, 'songs', songId), {
                  collaborators: arrayUnion(...missingCollabs)
                });
                needsBatch = true;
              }
            }
          }
          if (needsBatch) await batch.commit();
        }

        await updateDoc(doc(db, 'setlists', selectedSetlist.id), {
          ...setlistData,
          updatedAt: serverTimestamp(),
        });
        showToast(t.successUpdate);
      } else {
        const isDuplicate = setlists.some(s => 
          s.name.toLowerCase().trim() === (setlistData.name || '').toLowerCase().trim() &&
          s.ownerId === user.uid
        );

        if (isDuplicate) {
          alert(t.duplicateSetlist);
          return;
        }

        await addDoc(collection(db, 'setlists'), {
          ...setlistData,
          ownerId: user.uid,
          collaborators: [],
          editors: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast(t.successUpdate);
      }
      setIsEditing(false);
      setSelectedSetlist(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'setlists');
    } finally {
      setGlobalLoading(null);
    }
  };

  const deleteItem = async (type: 'songs' | 'setlists', id: string, removeSongs: boolean = false) => {
    if (!user) return;
    try {
      const item = type === 'songs' 
        ? songs.find(s => s.id === id) 
        : setlists.find(s => s.id === id);
      
      if (!item) return;

      if (item.ownerId === user.uid) {
        await deleteDoc(doc(db, type, id));
      } else {
        await updateDoc(doc(db, type, id), {
          collaborators: arrayRemove(user.email)
        });
      }

      // Handle linked songs removal for setlists
      if (type === 'setlists' && removeSongs) {
        const setlist = item as Setlist;
        for (const songId of setlist.songIds) {
          const song = songs.find(s => s.id === songId);
          if (song) {
            if (song.ownerId === user.uid) {
              await deleteDoc(doc(db, 'songs', songId));
            } else if (song.collaborators?.includes(user.email!)) {
              await updateDoc(doc(db, 'songs', songId), {
                collaborators: arrayRemove(user.email)
              });
            }
          }
        }
      }

      if (type === 'songs' && selectedSong?.id === id) setSelectedSong(null);
      if (type === 'setlists' && selectedSetlist?.id === id) setSelectedSetlist(null);
      setConfirmModal(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, type);
    }
  };

  const handleAddCollaborator = async () => {
    if (!collabModal || !collabEmail) return;
    try {
      const field = collabRole === 'editor' ? 'editors' : 'collaborators';
      await updateDoc(doc(db, collabModal.type, collabModal.id), {
        [field]: arrayUnion(collabEmail)
      });
      
      // If it's a setlist, also add to all songs in it with the same role
      if (collabModal.type === 'setlists') {
        const setlist = setlists.find(s => s.id === collabModal.id);
        if (setlist) {
          for (const songId of setlist.songIds) {
            await updateDoc(doc(db, 'songs', songId), {
              [field]: arrayUnion(collabEmail)
            });
          }
        }
      }

      setCollabModal(null);
      setCollabEmail('');
      setCollabRole('viewer');
      showToast(t.successCollab);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, collabModal.type);
    }
  };

  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    if (!joinModal || !user?.email) return;
    setIsJoining(true);
    try {
      // By default, joining via share link adds as a viewer
      await updateDoc(doc(db, joinModal.type, joinModal.id), {
        collaborators: arrayUnion(user.email)
      });

      // If it's a setlist, also add to all songs in it
      if (joinModal.type === 'setlists') {
        const setlistDoc = await getDoc(doc(db, 'setlists', joinModal.id));
        if (setlistDoc.exists()) {
          const setlistData = setlistDoc.data() as Setlist;
          for (const songId of setlistData.songIds) {
            await updateDoc(doc(db, 'songs', songId), {
              collaborators: arrayUnion(user.email)
            });
          }
        }
      }

      setJoinModal(null);
      // Remove query params from URL
      window.history.replaceState({}, '', window.location.pathname);
      showToast(t.successJoin);
    } catch (error) {
      console.error('Join error:', error);
      showToast(t.failJoin, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  const copyShareLink = () => {
    if (!shareModal) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const param = shareModal.type === 'songs' ? 'joinSong' : 'joinSetlist';
    const link = `${baseUrl}?${param}=${shareModal.id}`;
    
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.artist?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSetlists = setlists.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const confirmItem = confirmModal ? (
    confirmModal.type === 'songs' 
      ? songs.find(s => s.id === confirmModal.id) 
      : setlists.find(s => s.id === confirmModal.id)
  ) : null;

  const isOwner = confirmItem?.ownerId === user?.uid;

  const currentItem = selectedSong || selectedSetlist;
  const canEdit = currentItem && (currentItem.ownerId === user?.uid || currentItem.editors?.includes(user?.email || ''));

  if (loading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-950 text-white gap-6 safe-area-top">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <div className="absolute -inset-8 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
          <img 
            src={getLogoUrl()} 
            alt="CanindeChords Logo" 
            className="w-24 h-24 rounded-3xl shadow-2xl relative z-10"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-full h-full bg-blue-600"
            />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Loading CanindeChords</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-950 text-white p-6 safe-area-top">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 max-w-sm w-full p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-zinc-100 dark:border-zinc-800"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-4 bg-blue-500/20 blur-2xl rounded-full animate-pulse" />
              <img 
                src={getLogoUrl()} 
                alt="CanindeChords Logo - Macaw with Music Note" 
                className="w-32 h-32 rounded-3xl shadow-xl relative z-10"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-white">Caninde<span className="text-blue-600">Chords</span></h1>
              <p className="text-zinc-500 font-medium mt-2">{t.welcome}</p>
            </div>
          </div>
          <button 
            onClick={() => handleLogin()}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
          >
            <LogIn size={24} />
            {t.login}
          </button>

          <button
            onClick={() => handleLogin(true)}
            className="w-full -mt-4 py-2 text-sm font-semibold text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {preferredLang() === 'es' ? '¿No funciona? Entrar con redirección' : "Not working? Sign in with a redirect"}
          </button>

          {authError && (
            <div className="text-left bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl p-4 space-y-3">
              <div className="flex gap-3">
                <AlertCircle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium break-words">{authError.message}</p>
                  <p className="text-[11px] font-mono text-red-500 dark:text-red-400/80 break-all">{authError.code}</p>
                </div>
              </div>
              {(authError.offerRedirect || authError.autoRedirect) && (
                <button
                  onClick={() => handleLogin(true)}
                  className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-95"
                >
                  <RefreshCw size={16} />
                  {preferredLang() === 'es' ? 'Probar con redirección' : 'Try with redirect'}
                </button>
              )}
            </div>
          )}

          <AuthDiagnostics authResolvedMs={authResolvedMs} />

          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
            v{APP_VERSION}
          </p>
        </motion.div>
      </div>
    );
  }

  // En móvil funcionamos como maestro-detalle: se ve la LISTA o el contenido.
  // La lista está visible mientras no haya nada seleccionado (navegando) o
  // mientras el usuario la mantenga abierta con `listVisible`.
  useEffect(() => {
    // Al cambiar de modo la bandera de "lista abierta" pierde sentido: si no se
    // resetea, rotar el teléfono con un setlist abierto deja al músico en la
    // lista y le saca la canción de la pantalla.
    setListVisible(false);
  }, [mode]);

  const canNavigateSetlist = Boolean(selectedSetlist) && !(activeSession && !isDirector);
  // El visor indexa la lista YA filtrada, así que acotar contra songIds.length
  // dejaba pasar índices sin canción y la pantalla quedaba en blanco.
  const songCount = selectedSetlist
    ? selectedSetlist.songIds.filter(id => songs.some(song => song.id === id)).length
    : 0;

  const goPrevSong = React.useCallback(() => {
    setCurrentSetlistIndex(prev => Math.max(0, prev - 1));
  }, []);
  const goNextSong = React.useCallback(() => {
    setCurrentSetlistIndex(prev => Math.min(songCount - 1, prev + 1));
  }, [songCount]);

  useEffect(() => {
    if (!canNavigateSetlist) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      // Con un diálogo abierto la navegación no debe seguir corriendo por
      // debajo: en Modo Director eso se transmite a toda la banda.
      if (typing || isEditing || document.querySelector('[data-overlay]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goNextSong();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrevSong();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canNavigateSetlist, isEditing, goNextSong, goPrevSong]);

  const listVisibleNow = activeTab !== 'utilities' && ((!selectedSong && !selectedSetlist) || listVisible);

  return (
    <div data-mode={isCompact ? 'compact' : isTablet ? 'regular' : 'desktop'} className={`fixed inset-0 flex flex-col overflow-hidden ${isDarkMode ? 'dark bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'} transition-colors duration-300`}>
      
      {/* Header */}
      {!isFullScreen && (
        <header className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-inherit z-10 safe-area-top safe-area-x">
          <div className="flex items-center gap-2">
            <img 
              src={getLogoUrl()} 
              alt="CanindeChords Logo" 
              className="w-6 h-6 rounded-lg shadow-sm"
              referrerPolicy="no-referrer"
            />
            {!isCompact && (
              <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tighter leading-none">Caninde<span className="text-blue-600">Chords</span></span>
                <span className="text-[9px] text-zinc-400 font-mono leading-none mt-0.5">v{APP_VERSION}</span>
              </div>
            )}
            {!isOnline && (
              <div className="flex items-center gap-2 text-amber-500 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-1 rounded-lg">
                <WifiOff size={12} />
                <span className="hidden sm:inline">Offline</span>
              </div>
            )}
          </div>

          {/* Setlist Navigation Center/Mobile */}
          {selectedSetlist && (
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-1 md:px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 mx-1 md:mx-4 min-w-0 flex-shrink overflow-hidden max-w-full sm:max-w-sm lg:max-w-md">
              {/* Mobile Sidebar Toggle - Only if not forced by preferences */}
              {isCompact && !listVisible && (
                <button
                  onClick={() => setListVisible(true)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg transition-colors text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  title={t.songs}
                  aria-label={t.songs}
                >
                  <List size={20} />
                </button>
              )}

              <div className="hidden sm:flex items-center gap-2 border-l md:border-l-0 md:border-r border-zinc-300 dark:border-zinc-700 pl-2 md:pl-0 md:pr-2 min-w-0">
                <span className="font-bold text-[11px] truncate whitespace-nowrap">{selectedSetlist.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">({currentSetlistIndex + 1}/{selectedSetlist.songIds.length})</span>
              </div>
              
              <div className="flex items-center gap-0.5 px-1 border-r border-zinc-300 dark:border-zinc-700 mr-1">
                <button 
                  disabled={currentSetlistIndex === 0 || (activeSession && !isDirector)}
                  onClick={goPrevSong}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg disabled:opacity-30 transition-colors"
                  aria-label={t.previous || 'Anterior'}
                >
                  <ChevronLeft size={20} />
                </button>
                <button 
                  disabled={currentSetlistIndex === selectedSetlist.songIds.length - 1 || (activeSession && !isDirector)}
                  onClick={goNextSong}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg disabled:opacity-30 transition-colors"
                  aria-label={t.next || 'Siguiente'}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Session Status Icons */}
              {activeSession && (
                <div className="flex items-center gap-1">
                  <div 
                    className="flex items-center gap-1.5 pr-1.5 border-r border-zinc-300 dark:border-zinc-700" 
                    title={isDirector ? t.directorControl : t.spectatorView}
                  >
                    <Radio size={14} className={isDirector ? 'text-blue-600 animate-pulse' : 'text-amber-500 animate-pulse'} />
                    {isDirector && (
                      <div className="flex items-center gap-0.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                        <Users size={11} />
                        <span>{viewerCount}</span>
                      </div>
                    )}
                  </div>
                  
                  {isDirector && (
                    <button 
                      onClick={() => setShowShareSessionDialog(true)}
                      className="p-1 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-full text-zinc-500 transition-colors"
                      title={t.shareSession}
                    >
                      <Share2 size={13} />
                    </button>
                  )}

                  <div 
                    className={`w-1.5 h-1.5 rounded-full mx-1 ${p2pOnline ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} 
                    title={p2pOnline ? "P2P Online" : "P2P Offline"} 
                  />
                  
                  <button 
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('session-action', { detail: isDirector ? 'stop' : 'leave' }));
                    }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-full transition-colors"
                    title={isDirector ? t.stopSession : t.leaveSession}
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
              {deferredPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="hidden sm:flex items-center gap-2 px-2 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-all"
                >
                  <Plus size={12} />
                  {t.install || 'Install'}
                </button>
              )}
              {isCompact ? (
                <>
                  <img src={user.photoURL || ''} alt="" className="w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700" />
                  <button
                    onClick={() => setActionsSheetOpen(true)}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label={t.settings}
                  >
                    <Settings2 size={20} className="text-emerald-500" />
                  </button>
                </>
              ) : (
                <>
              <button onClick={() => window.location.reload()} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" title="Actualizar" aria-label="Actualizar">
                <RefreshCw size={18} />
              </button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={isDarkMode ? (t.lightMode || 'Light mode') : (t.darkMode || 'Dark mode')}>
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <div className="flex items-center gap-1.5">
                <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700" />
                <button 
                  onClick={() => {
                    setTempProfile({
                      ...profile,
                      sidebarPosition,
                      sidebarWidth,
                      defaultFontSize: fontSize,
                      defaultColumns: columns
                    });
                    setHasPendingProfileChanges(false);
                    setPreferencesModal(true);
                  }} 
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title={t.settings}
                  aria-label={t.settings}
                >
                  <Settings size={18} className="text-emerald-500" />
                </button>
                <button onClick={handleLogout} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800" title={t.logout} aria-label={t.logout}>
                  <LogOut size={18} />
                </button>
              </div>
                </>
              )}
            </div>
          </header>
        )}

        <main className={`flex-1 min-h-0 flex ${isCompact ? 'flex-col' : 'flex-row'} ${sidebarPosition === 'right' ? 'flex-row-reverse' : ''} overflow-hidden relative`}>
          
          {/* Sidebar / List */}
          <div 
            style={{ width: isCompact ? '100%' : `clamp(13rem, ${sidebarWidth}%, 40rem)` }}
            className={`${isCompact ? 'flex-1 min-h-0' : 'flex-shrink-0'} border-zinc-200 dark:border-zinc-800 flex flex-col ${sidebarPosition === 'left' ? 'border-r' : 'border-l'} ${(isFullScreen || isEditing) ? (isCompact ? 'hidden' : 'flex') : (isCompact && !listVisibleNow) ? 'hidden' : 'flex'}`}
          >
            {selectedSetlist ? (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => { setSelectedSetlist(null); setCurrentSetlistIndex(0); }}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                      title={t.back}
                    >
                      <ChevronRight className="rotate-180" size={16} />
                    </button>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate text-xs">{selectedSetlist.name}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setListVisible(false)}
                      className={`${isCompact ? '' : 'hidden'} p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors`}
                      title={t.back}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                      title={t.edit}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => setShareModal({ isOpen: true, type: 'setlists', id: selectedSetlist.id, title: selectedSetlist.name })}
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
                      title={t.share}
                    >
                      <Share2 size={14} />
                    </button>
                    <button 
                      onClick={() => setShowDirectorDialog(true)}
                      className={`p-1.5 rounded-lg transition-all ${activeSession ? 'text-blue-600 bg-blue-600/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'}`}
                      title={t.directorMode}
                    >
                      <Radio size={14} className={activeSession ? 'animate-pulse' : ''} />
                    </button>
                  </div>
                </div>

                <div className="p-2 shrink-0 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input 
                      type="text" 
                      placeholder={`${t.search} ${t.songs}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full min-h-11 pl-9 pr-3 bg-zinc-100 dark:bg-zinc-900 border-none rounded-lg t-ui focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto touch-scrolling px-1 py-2">
                  <div className="space-y-0.5">
                    {selectedSetlist.songIds
                      .map((id, i) => ({ song: songs.find(s => s.id === id), originalIndex: i, id }))
                      .filter(item => 
                        !searchQuery || 
                        (item.song?.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.song?.artist?.toLowerCase().includes(searchQuery.toLowerCase())) ||
                        (!item.song && t.missingSong.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .map((item) => (
                        <button
                          key={`${item.id}-${item.originalIndex}`}
                          disabled={!item.song}
                          onClick={() => { 
                            setCurrentSetlistIndex(item.originalIndex); 
                            setSelectedSong(null); 
                            setIsEditing(false); 
                            setListVisible(false);
                          }}
                          className={`w-full ${isCompact && isLandscape ? 'min-h-11 py-1.5' : 'min-h-[3.25rem] py-2'} px-3 rounded-xl text-left flex items-center justify-between group transition-all ${currentSetlistIndex === item.originalIndex && !selectedSong ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : item.song ? 'hover:bg-zinc-100 dark:hover:bg-zinc-900' : 'opacity-50 cursor-not-allowed bg-red-50/30 dark:bg-red-900/10'}`}
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className={`text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full ${currentSetlistIndex === item.originalIndex && !selectedSong ? 'bg-white/20' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
                              {item.originalIndex + 1}
                            </span>
                            <div className="truncate">
                              <p className="font-bold truncate t-title">{item.song?.title || t.missingSong}</p>
                              <p className={`t-meta truncate ${currentSetlistIndex === item.originalIndex && !selectedSong ? 'text-blue-100' : 'text-zinc-500'}`}>
                                {item.song?.artist || (item.song ? 'Unknown Artist' : 'ID: ' + item.id.substring(0, 8) + '...')}
                              </p>
                            </div>
                          </div>
                          {item.song ? (
                            <ChevronRight size={14} className={currentSetlistIndex === item.originalIndex && !selectedSong ? 'text-white' : 'text-zinc-400 opacity-60 group-hover:opacity-100'} />
                          ) : (
                            <X size={14} className="text-red-500" />
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                {pendingShares.length > 0 && (
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail size={14} className="text-blue-600" />
                      <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t.pendingInvitations}</h4>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                      {pendingShares.map(share => (
                        <div key={share.id} className="p-2 bg-white dark:bg-zinc-800 rounded-xl border border-blue-100 dark:border-blue-900/30 shadow-sm">
                          <p className="text-[10px] font-bold truncate">{share.title}</p>
                          <p className="text-[8px] text-zinc-500 truncate mb-2">De: {share.senderName}</p>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleAcceptShare(share)}
                              className="flex-1 py-1 bg-blue-600 text-white rounded-lg text-[9px] font-bold hover:bg-blue-700 transition-all"
                            >
                              {t.accept}
                            </button>
                            <button 
                              onClick={() => handleRejectShare(share.id)}
                              className="flex-1 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg text-[9px] font-bold hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-all"
                            >
                              {t.reject}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="p-2 space-y-2">
                  <div className="flex bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg">
                    <button 
                      onClick={() => { setActiveTab('songs'); setSelectedSong(null); setSelectedSetlist(null); setIsEditing(false); }}
                      className={`flex-1 min-h-11 rounded-md t-ui font-bold transition-all ${activeTab === 'songs' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
                    >
                      {t.songs}
                    </button>
                    <button 
                      onClick={() => { setActiveTab('setlists'); setSelectedSong(null); setSelectedSetlist(null); setIsEditing(false); }}
                      className={`flex-1 min-h-11 rounded-md t-ui font-bold transition-all ${activeTab === 'setlists' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
                    >
                      {t.setlists}
                    </button>
                    <button 
                      onClick={() => { setActiveTab('utilities'); setSelectedSong(null); setSelectedSetlist(null); setIsEditing(false); }}
                      className={`flex-1 min-h-11 rounded-md t-ui font-bold transition-all ${activeTab === 'utilities' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-zinc-500'}`}
                    >
                      {t.utilities}
                    </button>
                  </div>
 
                  {activeTab !== 'utilities' && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                      <input 
                        type="text" 
                        placeholder={`${t.search} ${activeTab === 'songs' ? t.songs : t.setlists}...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full min-h-11 pl-9 pr-3 bg-zinc-100 dark:bg-zinc-900 border-none rounded-lg t-ui focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  )}
                </div>
 
                <div className={`flex-1 min-h-0 overflow-auto touch-scrolling px-1 ${isCompact ? 'pb-20' : 'pb-4'}`}>
                  {activeTab === 'songs' ? (
                    <div className="space-y-0.5">
                      {filteredSongs.map(song => (
                        <button
                          key={song.id}
                          onClick={() => { 
                            setSelectedSong(song); 
                            setSelectedSetlist(null); 
                            setIsEditing(false); 
                            setListVisible(false);
                          }}
                          className={`w-full ${isCompact && isLandscape ? 'min-h-11 py-1.5' : 'min-h-[3.25rem] py-2'} px-3 rounded-xl text-left flex items-center justify-between group transition-all ${selectedSong?.id === song.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate t-title">{song.title}</p>
                            <p className={`t-meta truncate ${selectedSong?.id === song.id ? 'text-blue-100' : 'text-zinc-500'}`}>
                              {song.artist || 'Unknown Artist'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {song.collaborators && song.collaborators.length > 0 && <Users size={12} className="opacity-50" />}
                            <ChevronRight size={14} className={selectedSong?.id === song.id ? 'text-white' : 'text-zinc-400 opacity-60 group-hover:opacity-100'} />
                          </div>
                        </button>
                      ))}
                      <div className="flex gap-1.5 mt-2">
                        <button 
                          onClick={() => { setSelectedSong(null); setSelectedSetlist(null); setIsEditing(true); }}
                          className="flex-1 p-2 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 text-zinc-500 hover:border-blue-500 hover:text-blue-500 transition-all text-xs"
                        >
                          <Plus size={16} />
                          {t.newSong}
                        </button>
                        <button 
                          onClick={() => setIsImportModalOpen(true)}
                          className="p-2 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 text-zinc-500 hover:border-blue-500 hover:text-blue-500 transition-all"
                          title={t.import}
                        >
                          <Upload size={16} />
                        </button>
                      </div>
                    </div>
                  ) : activeTab === 'setlists' ? (
                    <div className="space-y-0.5">
                      {filteredSetlists.map(setlist => (
                        <button
                          key={setlist.id}
                          onClick={() => { 
                            setSelectedSetlist(setlist);
                            setSelectedSong(null);
                            setCurrentSetlistIndex(0);
                            setIsEditing(false);
                            setListVisible(isCompact);
                          }}
                          className={`w-full ${isCompact && isLandscape ? 'min-h-11 py-1.5' : 'min-h-[3.25rem] py-2'} px-3 rounded-xl text-left flex items-center justify-between group transition-all ${selectedSetlist?.id === setlist.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate t-title">{setlist.name}</p>
                            <p className={`t-meta truncate ${selectedSetlist?.id === setlist.id ? 'text-blue-100' : 'text-zinc-500'}`}>
                              {setlist.songIds.length} {t.songs.toLowerCase()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {setlist.collaborators && setlist.collaborators.length > 0 && <Users size={12} className="opacity-50" />}
                            <ChevronRight size={14} className={selectedSetlist?.id === setlist.id ? 'text-white' : 'text-zinc-400 opacity-60 group-hover:opacity-100'} />
                          </div>
                        </button>
                      ))}
                      <button 
                        onClick={() => { setSelectedSetlist(null); setSelectedSong(null); setIsEditing(true); }}
                        className="w-full p-2 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center gap-1.5 text-zinc-500 hover:border-blue-500 hover:text-blue-500 transition-all mt-2 text-xs"
                      >
                        <Plus size={16} />
                        {t.newSetlist}
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 text-center space-y-4 flex flex-col items-center">
                      <Compass className="text-blue-600 shrink-0 mt-8 animate-spin" style={{ animationDuration: '6s' }} size={40} />
                      <div>
                        <p className="font-extrabold text-sm text-zinc-800 dark:text-zinc-100">{t.utilities}</p>
                        <p className="text-[10px] text-zinc-400 max-w-[150px] leading-relaxed mx-auto mt-1.5">
                          Herramientas para afinar instrumentos y componer arcos armónicos desde el Yggdrasil.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className={`flex-1 relative flex flex-col overflow-hidden ${(isFullScreen || isEditing || activeTab === 'utilities') ? 'flex' : (isCompact && listVisibleNow) ? 'hidden' : (selectedSong || selectedSetlist) ? 'flex' : (isCompact ? 'hidden' : 'flex')}`}>
            <AnimatePresence mode="wait">
              {activeTab === 'utilities' ? (
                <motion.div
                  key="utilities-workspace"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-4 md:p-6"
                >
                  <UtilitariosHub
                    onExportToSong={handleAddSongFromWorkshop}
                    lang={(profile?.language || 'en') as 'es' | 'en'}
                  />
                </motion.div>
              ) : isEditing ? (
                <motion.div 
                  key="editor"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  {activeTab === 'songs' ? (
                    <SongEditor 
                      initialSong={selectedSong || {}} 
                      onSave={saveSong} 
                      onCancel={() => setIsEditing(false)} 
                    />
                  ) : (
                    <SetlistEditor 
                      initialSetlist={selectedSetlist || {}} 
                      availableSongs={songs}
                      onSave={saveSetlist} 
                      onCancel={() => setIsEditing(false)} 
                    />
                  )}
                </motion.div>
              ) : (selectedSong || selectedSetlist) ? (
                <motion.div 
                  key="viewer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col"
                >
                  {/* Toolbar */}
                  <div className={`p-1 border-b border-zinc-200 dark:border-zinc-800 flex ${isCompact ? 'flex-col' : 'flex-row'} items-center justify-between gap-1 bg-white dark:bg-zinc-950`}>
                    <div className={`flex items-center justify-between gap-0.5 ${isCompact ? 'w-full' : 'w-auto'}`}>
                      <div className="flex items-center gap-0.5">
                        <button 
                          onClick={() => { setSelectedSong(null); setSelectedSetlist(null); }} 
                          className={`${isCompact ? '' : 'hidden'} p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg`}
                        >
                          <ChevronRight className="rotate-180" size={18} />
                        </button>
                        <button 
                          onClick={() => setIsEditing(true)} 
                          disabled={!canEdit}
                          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed" 
                          title={t.edit}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => setCollabModal({ isOpen: true, type: activeTab, id: (selectedSong?.id || selectedSetlist?.id)! })} 
                          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg" 
                          title={t.addCollaborator}
                        >
                          <UserPlus size={16} />
                        </button>
                        <button 
                          onClick={() => setShareModal({ 
                            isOpen: true, 
                            type: activeTab, 
                            id: (selectedSong?.id || selectedSetlist?.id)!,
                            title: selectedSong?.title || selectedSetlist?.name || ''
                          })} 
                          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg" 
                          title={t.share}
                        >
                          <Share2 size={16} />
                        </button>
                        <button 
                          onClick={() => setConfirmModal({ type: activeTab, id: (selectedSong?.id || selectedSetlist?.id)! })} 
                          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-red-500" 
                          title={((selectedSong?.ownerId === user?.uid) || (selectedSetlist?.ownerId === user?.uid)) ? t.delete : t.remove}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
 
                      <button
                        onClick={toggleFullScreen}
                        className={`p-1.5 rounded-lg transition-all ${isFullScreen ? 'bg-blue-600 text-white' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        title={t.fullscreen}
                        aria-label={t.fullscreen}
                      >
                        {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                      </button>

                      <button 
                        onClick={() => setIsToolbarExpanded(!isToolbarExpanded)}
                        className={`p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg ${isCompact ? '' : 'hidden'}`}
                      >
                        <ChevronDown size={16} className={`transition-transform duration-200 ${isToolbarExpanded ? 'rotate-180 text-blue-500' : ''}`} />
                      </button>
                    </div>
 
                    <div className={`${!isCompact || isToolbarExpanded ? 'flex' : 'hidden'} items-center gap-1 flex-wrap justify-center`}>
                        {/* Transpose */}
                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-lg p-0.5" title={t.transpose}>
                          <button onClick={() => {
                            setTranspose(prev => prev - 1);
                            setHasPendingSongChanges(true);
                          }} className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm text-[10px] font-bold">-</button>
                          <div className="flex items-center gap-1 px-1 text-blue-600">
                            <Music size={12} />
                            <span className="text-[9px] font-mono w-6 text-center">{transpose > 0 ? `+${transpose}` : transpose}</span>
                          </div>
                          <button onClick={() => {
                            setTranspose(prev => prev + 1);
                            setHasPendingSongChanges(true);
                          }} className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm text-[10px] font-bold">+</button>
                        </div>

                        {/* Auto Resize Toggle */}
                        <button 
                          onClick={() => {
                            const newVal = !autoResize;
                            setAutoResize(newVal);
                            setHasPendingSongChanges(true);
                            if (newVal) window.dispatchEvent(new CustomEvent('fit-to-screen'));
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all font-bold text-[10px] ${autoResize ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                          title={t.autoResize}
                        >
                          <Maximize size={14} />
                          <div className={`w-6 h-3 rounded-full transition-all relative ${autoResize ? 'bg-blue-400' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                            <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${autoResize ? 'left-3.5' : 'left-0.5'}`} />
                          </div>
                        </button>

                        {/* Font Size */}
                        <div className={`flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-lg p-0.5 transition-opacity ${autoResize ? 'opacity-50 pointer-events-none' : ''}`} title={t.fontSize}>
                          <button onClick={() => {
                            setFontSize(prev => Math.max(8, prev - 1));
                            setHasPendingSongChanges(true);
                          }} className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm text-[10px]">-</button>
                          <span className="px-1.5 text-[10px] font-mono">{fontSize}</span>
                          <button onClick={() => {
                            setFontSize(prev => Math.min(48, prev + 1));
                            setHasPendingSongChanges(true);
                          }} className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm text-[10px]">+</button>
                        </div>
                        
                        {/* Columns */}
                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-lg p-0.5" title={t.columns}>
                          <button 
                            onClick={() => {
                              setColumns(prev => Math.max(1, prev - 1));
                              setHasPendingSongChanges(true);
                              if (autoResize) window.dispatchEvent(new CustomEvent('fit-to-screen'));
                            }} 
                            className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm text-[10px]"
                          >
                            -
                          </button>
                          <span className="px-1.5 text-[10px] font-mono">{columns}</span>
                          <button 
                            onClick={() => {
                              setColumns(prev => Math.min(4, prev + 1));
                              setHasPendingSongChanges(true);
                              if (autoResize) window.dispatchEvent(new CustomEvent('fit-to-screen'));
                            }} 
                            className="px-1.5 py-0.5 hover:bg-white dark:hover:bg-zinc-800 rounded shadow-sm text-[10px]"
                          >
                            +
                          </button>
                        </div>

                        {/* Save Button */}
                        <button 
                          onClick={saveCurrentSongSettings}
                          disabled={!hasPendingSongChanges}
                          className={`p-1.5 rounded-lg transition-all ${hasPendingSongChanges ? 'bg-green-600 text-white shadow-lg shadow-green-600/20' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 opacity-50 cursor-not-allowed'}`}
                          title={t.save}
                        >
                          <Save size={16} />
                        </button>
 
                      {isFullScreen && wakeLockRef.current && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-500 rounded-lg text-[10px] font-bold uppercase animate-pulse">
                          <Sun size={12} />
                          <span className="hidden sm:inline">Wake Lock</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    {selectedSong ? (
                      <SongViewer 
                        song={selectedSong} 
                        fontSize={fontSize} 
                        columns={columns} 
                        transpose={transpose} 
                        notation={profile?.chordNotation || 'scientific'} 
                        chordFontSize={profile?.chordFontSize || 90}
                        showCapo={profile?.showCapo ?? true}
                        minFontSize={profile?.minFontSize}
                        maxFontSize={profile?.maxFontSize}
                        autoResize={autoResize}
                        songSettings={userSongSettings[selectedSong.id]}
                        onFontSizeChange={(newSize, origin) => {
                          setFontSize(newSize);
                          // Un reajuste inducido por el layout no es una edición del usuario.
                          if (origin === 'user') setHasPendingSongChanges(true);
                        }}
                        onColumnsChange={(newCols) => {
                          setColumns(newCols);
                          setHasPendingSongChanges(true);
                        }}
                        onSettingsChange={(settings) => handleSettingsChange(selectedSong.id, settings)}
                        t={t}
                      />
                    ) : selectedSetlist ? (
                      <SetlistViewer 
                        setlist={selectedSetlist} 
                        songs={songs} 
                        fontSize={fontSize} 
                        columns={columns} 
                        transpose={transpose}
                        notation={profile?.chordNotation || 'scientific'}
                        chordFontSize={profile?.chordFontSize || 90}
                        showCapo={profile?.showCapo ?? true}
                        userSongSettings={userSongSettings}
                        onSettingsChange={handleSettingsChange}
                        onRepairSetlist={repairSetlist}
                        minFontSize={profile?.minFontSize}
                        maxFontSize={profile?.maxFontSize}
                        autoResize={autoResize}
                        onFontSizeChange={(newSize, origin) => {
                          setFontSize(newSize);
                          // Un reajuste inducido por el layout no es una edición del usuario.
                          if (origin === 'user') setHasPendingSongChanges(true);
                        }}
                        onColumnsChange={(newCols) => {
                          setColumns(newCols);
                          setHasPendingSongChanges(true);
                        }}
                        currentIndex={currentSetlistIndex}
                        onIndexChange={setCurrentSetlistIndex}
                        activeSession={activeSession}
                        isDirector={isDirector}
                        onStartSession={(session) => {
                          setActiveSession(session);
                          setIsDirector(true);
                        }}
                        onJoinSession={(session) => {
                          setActiveSession(session);
                          setIsDirector(false);
                        }}
                        onViewerCountChange={setViewerCount}
                        onP2PStatusChange={setP2POnline}
                        showDirectorDialog={showDirectorDialog}
                        onDirectorDialogClose={() => setShowDirectorDialog(false)}
                        showShareSession={showShareSessionDialog}
                        onShareSessionClose={() => setShowShareSessionDialog(false)}
                        isFullScreen={isFullScreen}
                        onSessionClosed={handleSessionClosed}
                        t={t}
                      />
                    ) : null}
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-6">
                  <div className="relative">
                    <div className="absolute -inset-8 bg-blue-500/5 blur-3xl rounded-full" />
                    <img 
                      src="https://picsum.photos/seed/canindechords-logo/256/256" 
                      alt="" 
                      className="w-32 h-32 rounded-3xl opacity-10 grayscale relative z-10"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <p className="font-medium tracking-wide uppercase text-xs opacity-30">{t.noSelection}</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>

      {/* Mobile Bottom Nav */}
      {!isFullScreen && (
        <nav className={`${isCompact ? 'flex' : 'hidden'} flex-none border-t border-zinc-200 dark:border-zinc-800 p-2 justify-around bg-white dark:bg-zinc-950 safe-area-x pb-[max(0.5rem,env(safe-area-inset-bottom))]`}>
            <button 
              onClick={() => { setActiveTab('songs'); setSelectedSong(null); setSelectedSetlist(null); setIsEditing(false); }}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'songs' && !selectedSong && !selectedSetlist && !isEditing ? 'text-blue-500' : 'text-zinc-500'}`}
            >
              <Music size={24} />
              <span className="t-ui-sm font-bold mt-1">{t.songs}</span>
            </button>
            <button 
              onClick={() => { setActiveTab('setlists'); setSelectedSong(null); setSelectedSetlist(null); setIsEditing(false); }}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'setlists' && !selectedSong && !selectedSetlist && !isEditing ? 'text-blue-500' : 'text-zinc-500'}`}
            >
              <List size={24} />
              <span className="t-ui-sm font-bold mt-1">{t.setlists}</span>
            </button>
            <button 
              onClick={() => { setActiveTab('utilities'); setSelectedSong(null); setSelectedSetlist(null); setIsEditing(false); }}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${activeTab === 'utilities' ? 'text-blue-500' : 'text-zinc-500'}`}
            >
              <Compass size={24} />
              <span className="t-ui-sm font-bold mt-1">{t.utilities}</span>
            </button>
            <button 
              onClick={() => { setSelectedSong(null); setSelectedSetlist(null); setIsEditing(true); }}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${isEditing ? 'text-blue-500' : 'text-zinc-500'}`}
            >
              <Plus size={24} />
              <span className="t-ui-sm font-bold mt-1">{t.new}</span>
            </button>
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="flex flex-col items-center p-2 text-blue-600 animate-pulse"
              >
                <Plus size={24} className="bg-blue-600 text-white rounded-full p-1" />
                <span className="t-ui-sm font-bold mt-1">{t.install || 'Install'}</span>
              </button>
            )}
          </nav>
        )}

        {actionsSheetOpen && (
          <div
            data-overlay
            className="fixed inset-0 z-[60] bg-black/50 flex items-end"
            onClick={() => setActionsSheetOpen(false)}
          >
            <div
              className="w-full bg-white dark:bg-zinc-900 rounded-t-3xl p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] safe-area-x"
              onClick={(e) => e.stopPropagation()}
            >
              {[
                { icon: <RefreshCw size={20} />, label: t.refresh || 'Actualizar', run: () => window.location.reload() },
                { icon: isDarkMode ? <Sun size={20} /> : <Moon size={20} />, label: isDarkMode ? (t.lightMode || 'Modo claro') : (t.darkMode || 'Modo oscuro'), run: () => setIsDarkMode(!isDarkMode) },
                { icon: <Settings size={20} className="text-emerald-500" />, label: t.settings, run: () => {
                  setTempProfile({ ...profile, sidebarPosition, sidebarWidth, defaultFontSize: fontSize, defaultColumns: columns });
                  setHasPendingProfileChanges(false);
                  setPreferencesModal(true);
                } },
                { icon: <LogOut size={20} />, label: t.logout, run: handleLogout },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => { setActionsSheetOpen(false); item.run(); }}
                  className="w-full min-h-12 px-4 flex items-center gap-3 rounded-xl t-ui font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modals */}
        <Modal 
          isOpen={!!collabModal} 
          onClose={() => setCollabModal(null)} 
          title={t.addCollaborator}
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">{t.collabEmail}</p>
            <input 
              type="email" 
              value={collabEmail}
              onChange={(e) => setCollabEmail(e.target.value)}
              placeholder="email@gmail.com"
              className="w-full p-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t.role}</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setCollabRole('viewer')}
                  className={`py-2 rounded-xl font-bold border-2 transition-all ${collabRole === 'viewer' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  {t.viewer}
                </button>
                <button 
                  onClick={() => setCollabRole('editor')}
                  className={`py-2 rounded-xl font-bold border-2 transition-all ${collabRole === 'editor' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  {t.editor}
                </button>
              </div>
            </div>

            <button 
              onClick={handleAddCollaborator}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
            >
              {t.add}
            </button>
          </div>
        </Modal>

        <Modal 
          isOpen={!!shareModal} 
          onClose={() => {
            setShareModal(null);
            setShareEmail('');
            setSelectedContacts([]);
          }} 
          title={`${t.share}: ${shareModal?.title}`}
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.shareLink}</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={`${window.location.origin}${window.location.pathname}?${shareModal?.type === 'songs' ? 'joinSong' : 'joinSetlist'}=${shareModal?.id}`}
                  className="flex-1 p-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl outline-none text-xs font-mono"
                />
                <button 
                  onClick={copyShareLink}
                  className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">{t.shareInfo}</p>
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.email || 'Email'}</label>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="ejemplo@gmail.com"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    className="flex-1 p-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.contacts}</label>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {contacts.length > 0 ? (
                    contacts.map(contact => (
                      <button
                        key={contact.id}
                        onClick={() => {
                          setSelectedContacts(prev => 
                            prev.includes(contact.email) 
                              ? prev.filter(e => e !== contact.email)
                              : [...prev, contact.email]
                          );
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all ${selectedContacts.includes(contact.email) ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 border-transparent'} border`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold">
                            {contact.name?.[0].toUpperCase() || contact.email[0].toUpperCase()}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold truncate max-w-[150px]">{contact.name}</p>
                            <p className="text-[10px] text-zinc-500 truncate max-w-[150px]">{contact.email}</p>
                          </div>
                        </div>
                        {selectedContacts.includes(contact.email) && <Check size={16} className="text-blue-600" />}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500 text-center py-4">{t.noContacts}</p>
                  )}
                </div>
              </div>

              <button 
                onClick={handleSendInvitations}
                disabled={isSendingShare || (!shareEmail && selectedContacts.length === 0)}
                className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-bold hover:opacity-90 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              >
                {isSendingShare ? t.adding : t.sendInvitations}
              </button>
            </div>
          </div>
        </Modal>

        <Modal 
          isOpen={!!joinModal} 
          onClose={() => {
            setJoinModal(null);
            window.history.replaceState({}, '', window.location.pathname);
          }} 
          title={t.joinTitle}
        >
          <div className="space-y-4">
            <p className="text-zinc-600 dark:text-zinc-400 text-center">
              {t.joinInvite} <span className="font-bold text-zinc-900 dark:text-white">"{joinModal?.title}"</span>.
            </p>
            <button 
              onClick={handleJoin}
              disabled={isJoining}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isJoining ? (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Plus size={20} />
                  </motion.div>
                  {t.adding}
                </>
              ) : t.add}
            </button>
          </div>
        </Modal>

        <Modal 
          isOpen={!!shareConfirmModal} 
          onClose={() => shareConfirmModal?.onCancel()} 
          title={shareConfirmModal?.title || ''}
        >
          <div className="space-y-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {shareConfirmModal?.message}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => shareConfirmModal?.onCancel()}
                className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
              >
                No
              </button>
              <button 
                onClick={() => shareConfirmModal?.onConfirm()}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
              >
                {t.yes || 'Sí'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal 
          isOpen={!!confirmModal} 
          onClose={() => { setConfirmModal(null); setRemoveSongsCheck(false); }} 
          title={isOwner ? t.delete : t.remove}
        >
          <div className="space-y-4">
            <p className="text-center">{isOwner ? t.confirmDelete : t.confirmRemove}</p>
            
            {confirmModal?.type === 'setlists' && (
              <label className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <input 
                  type="checkbox" 
                  checked={removeSongsCheck}
                  onChange={(e) => setRemoveSongsCheck(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t.removeLinkedSongs}
                </span>
              </label>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => { setConfirmModal(null); setRemoveSongsCheck(false); }}
                className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold"
              >
                {t.cancel}
              </button>
              <button 
                onClick={() => {
                  deleteItem(confirmModal!.type, confirmModal!.id, removeSongsCheck);
                  setRemoveSongsCheck(false);
                }}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold"
              >
                {isOwner ? t.delete : t.remove}
              </button>
            </div>
          </div>
        </Modal>

        <Modal 
          isOpen={preferencesModal} 
          onClose={() => setPreferencesModal(false)} 
          title={t.settings}
        >
          <div className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.language}</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setTempProfile(prev => ({ ...prev, language: 'en' }));
                    setHasPendingProfileChanges(true);
                  }}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${tempProfile?.language === 'en' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  English
                </button>
                <button 
                  onClick={() => {
                    setTempProfile(prev => ({ ...prev, language: 'es' }));
                    setHasPendingProfileChanges(true);
                  }}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${tempProfile?.language === 'es' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  Español
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.showCapo}</label>
              <button 
                onClick={() => {
                  setTempProfile(prev => ({ ...prev, showCapo: !(prev?.showCapo ?? true) }));
                  setHasPendingProfileChanges(true);
                }}
                className="w-full py-3 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-between font-bold"
              >
                <div className="flex items-center gap-3">
                  <Hash size={20} />
                  <span>{t.showCapo}</span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-all relative ${(tempProfile?.showCapo ?? true) ? 'bg-blue-600' : 'bg-zinc-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${(tempProfile?.showCapo ?? true) ? 'left-5' : 'left-1'}`} />
                </div>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.theme}</label>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="w-full py-3 px-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-between font-bold"
              >
                <div className="flex items-center gap-3">
                  {isDarkMode ? <Moon size={20} /> : <Sun size={20} />}
                  <span>{isDarkMode ? t.darkMode : t.lightMode}</span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-all relative ${isDarkMode ? 'bg-blue-600' : 'bg-zinc-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isDarkMode ? 'left-5' : 'left-1'}`} />
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.minFontSize}</label>
                <input 
                  type="number" 
                  min="8" 
                  max="30" 
                  value={tempProfile?.minFontSize || 12}
                  onChange={(e) => {
                    setTempProfile(prev => ({ ...prev, minFontSize: parseInt(e.target.value) }));
                    setHasPendingProfileChanges(true);
                  }}
                  className="w-full p-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.maxFontSize}</label>
                <input 
                  type="number" 
                  min="20" 
                  max="100" 
                  value={tempProfile?.maxFontSize || 48}
                  onChange={(e) => {
                    setTempProfile(prev => ({ ...prev, maxFontSize: parseInt(e.target.value) }));
                    setHasPendingProfileChanges(true);
                  }}
                  className="w-full p-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.sidebarPosition}</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setTempProfile(prev => ({ ...prev, sidebarPosition: 'left' }));
                    setHasPendingProfileChanges(true);
                  }}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${tempProfile?.sidebarPosition === 'left' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  {t.left}
                </button>
                <button 
                  onClick={() => {
                    setTempProfile(prev => ({ ...prev, sidebarPosition: 'right' }));
                    setHasPendingProfileChanges(true);
                  }}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${tempProfile?.sidebarPosition === 'right' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  {t.right}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.sidebarWidth}</label>
                <span className="text-xs font-mono font-bold text-blue-600">{tempProfile?.sidebarWidth}%</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="50" 
                step="5"
                value={tempProfile?.sidebarWidth || 30}
                onChange={(e) => {
                  setTempProfile(prev => ({ ...prev, sidebarWidth: parseInt(e.target.value) }));
                  setHasPendingProfileChanges(true);
                }}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.chordNotation}</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setTempProfile(prev => ({ ...prev, chordNotation: 'scientific' }));
                    setHasPendingProfileChanges(true);
                  }}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${tempProfile?.chordNotation === 'scientific' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  {t.scientific}
                </button>
                <button 
                  onClick={() => {
                    setTempProfile(prev => ({ ...prev, chordNotation: 'solfege' }));
                    setHasPendingProfileChanges(true);
                  }}
                  className={`py-3 rounded-xl font-bold border-2 transition-all ${tempProfile?.chordNotation === 'solfege' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-200'}`}
                >
                  {t.solfege}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">{t.chordSize}</label>
                <span className="text-xs font-mono font-bold text-blue-600">{tempProfile?.chordFontSize || 90}%</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="150" 
                step="5"
                value={tempProfile?.chordFontSize || 90}
                onChange={(e) => {
                  setTempProfile(prev => ({ ...prev, chordFontSize: parseInt(e.target.value) }));
                  setHasPendingProfileChanges(true);
                }}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
              <button 
                onClick={handleBackup}
                className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center gap-3 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
              >
                <Upload size={20} className="text-blue-600" />
                <span>{t.backup}</span>
              </button>

              {showResetConfirm ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-2xl space-y-4 animate-in fade-in zoom-in duration-200">
                  <div className="flex gap-3 text-red-700 dark:text-red-400">
                    <div className="p-2 bg-red-100 dark:bg-red-800/40 rounded-full h-fit">
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{t.resetData}</p>
                      <p className="text-xs opacity-80">{t.resetDataConfirm}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 py-2 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={handleResetData}
                      className="flex-1 py-2 text-xs font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                    >
                      {t.resetData}
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setShowResetConfirm(true)}
                  disabled={!!globalLoading}
                  className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 rounded-2xl flex items-center justify-center gap-3 font-bold hover:bg-red-100 dark:hover:bg-red-900/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Trash2 size={20} />
                  <span>{t.resetData}</span>
                </button>
              )}
            </div>

            <button 
              onClick={async () => {
                const updates = { ...tempProfile };
                delete updates.id;
                await updateProfile(updates);
                
                // Sync local state
                if (updates.sidebarPosition) setSidebarPosition(updates.sidebarPosition);
                if (updates.sidebarWidth) setSidebarWidth(updates.sidebarWidth);
                if (updates.defaultFontSize) setFontSize(updates.defaultFontSize);
                if (updates.defaultColumns) setColumns(updates.defaultColumns);
                
                setHasPendingProfileChanges(false);
                setPreferencesModal(false);
                showToast(t.successUpdate);
              }}
              disabled={!hasPendingProfileChanges}
              className={`w-full py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg ${hasPendingProfileChanges ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 opacity-50 cursor-not-allowed'}`}
            >
              {t.save}
            </button>
          </div>
        </Modal>

        <Modal 
          isOpen={isImportModalOpen} 
          onClose={() => setIsImportModalOpen(false)} 
          title={t.importOpenSong}
        >
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl gap-4">
            <Upload size={48} className="text-zinc-400" />
            <div className="text-center">
              <p className="font-bold mb-1">{t.importOpenSong}</p>
              <p className="text-xs text-zinc-500">.ost (songs) or .osb (backups)</p>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id="overwriteOnImport"
                checked={overwriteOnImport}
                onChange={(e) => setOverwriteOnImport(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
              />
              <label htmlFor="overwriteOnImport" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                {t.importOverwrite}
              </label>
            </div>

            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold transition-all disabled:opacity-50">
              {globalLoading === t.importing ? t.adding : t.selectItem}
              <input 
                type="file" 
                className="hidden" 
                accept=".ost,.osb" 
                multiple 
                onChange={handleImport}
                disabled={!!globalLoading}
              />
            </label>
          </div>
        </Modal>

        {/* Global Loading Overlay */}
        <AnimatePresence>
          {globalLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            >
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-20 h-20 border-4 border-white/5 border-t-white rounded-full shadow-2xl"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-blue-600 blur-xl animate-pulse" />
                </div>
              </div>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 text-white font-bold tracking-[0.2em] uppercase text-xs"
              >
                {globalLoading}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-50 font-bold text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
}
