import React, { useState, useEffect, useMemo } from 'react';
import { Song, Setlist, Session, UserSongSettings } from '../types';
import { ChevronLeft, ChevronRight, List, Users, Radio, XCircle } from 'lucide-react';
import { SongViewer } from './SongViewer';
import { useAuth } from './AuthProvider';
import { DirectorModeDialog } from './DirectorModeDialog';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc, onSnapshot, serverTimestamp, collection, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { P2PManager } from '../services/p2pService';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Link as LinkIcon, Check } from 'lucide-react';

interface SetlistViewerProps {
  setlist: Setlist;
  songs: Song[];
  fontSize: number;
  columns: number;
  transpose?: number;
  notation?: 'scientific' | 'solfege';
  chordFontSize?: number;
  showCapo?: boolean;
  onFontSizeChange?: (size: number) => void;
  onColumnsChange?: (cols: number) => void;
  userSongSettings?: Record<string, UserSongSettings>;
  onSettingsChange?: (songId: string, settings: Partial<UserSongSettings>) => void;
  onRepairSetlist?: (setlist: Setlist) => void;
  minFontSize?: number;
  maxFontSize?: number;
  autoResize?: boolean;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isFullScreen?: boolean;
  onSessionClosed?: () => void;
  activeSession: Session | null;
  isDirector: boolean;
  onStartSession: (session: Session) => void;
  onJoinSession: (session: Session) => void;
  onViewerCountChange?: (count: number) => void;
  onP2PStatusChange?: (online: boolean) => void;
  showDirectorDialog?: boolean;
  onDirectorDialogClose?: () => void;
  showShareSession?: boolean;
  onShareSessionClose?: () => void;
  t: any;
}

export const SetlistViewer: React.FC<SetlistViewerProps> = ({ 
  setlist, 
  songs, 
  fontSize, 
  columns, 
  transpose = 0,
  notation = 'scientific',
  chordFontSize = 90,
  showCapo = true,
  onFontSizeChange,
  onColumnsChange,
  userSongSettings,
  onSettingsChange,
  onRepairSetlist,
  minFontSize,
  maxFontSize,
  autoResize = true,
  currentIndex,
  onIndexChange,
  isFullScreen = false,
  onSessionClosed,
  activeSession,
  isDirector,
  onStartSession,
  onJoinSession,
  onViewerCountChange,
  onP2PStatusChange,
  showDirectorDialog: externalShowDirectorDialog = false,
  onDirectorDialogClose,
  showShareSession: externalShowShareSession = false,
  onShareSessionClose,
  t
}) => {
  const { profile } = useAuth();
  const [showIndex, setShowIndex] = useState(false);
  const [showDirectorDialog, setShowDirectorDialog] = useState(false);
  
  // Sync internal state with external props if provided
  useEffect(() => {
    if (externalShowDirectorDialog) setShowDirectorDialog(true);
  }, [externalShowDirectorDialog]);

  useEffect(() => {
    if (externalShowShareSession) setShowShareDialog(true);
  }, [externalShowShareSession]);

  const currentIndexRef = React.useRef(currentIndex);
  const wakeLockRef = React.useRef<any>(null);
  const songsRef = React.useRef(songs);
  const setlistSongsRef = React.useRef<Song[]>([]);
  const channelRef = React.useRef<BroadcastChannel | null>(null);

  // Setup BroadcastChannel for local/offline sync
  useEffect(() => {
    const channelName = `opensong-session-${setlist.originalId || setlist.id}`;
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    // Listen for messages if we are NOT a director or if we are in an offline session
    channel.onmessage = (event) => {
      const { type, data } = event.data;

      if (type === 'SESSION_UPDATE' && !isDirector) {
        // If we are already following an online session, only follow local if it's the same director or if NO online session is active
        // But for simplicity: if we have NO online session, or the incoming message is more recent/relevant
        const targetSongId = data.currentSongId;
        const targetIndex = data.currentSongIndex;
        const currentList = setlistSongsRef.current;

        if (targetSongId) {
          let localIndex = currentList.findIndex(s => 
            s.id === targetSongId || 
            s.originalId === targetSongId || 
            (s.originalId && targetSongId === s.originalId)
          );
          
          if (localIndex === -1) {
            const songInLib = songsRef.current.find(s => s.id === targetSongId || s.originalId === targetSongId);
            if (songInLib) {
              const canonicalId = songInLib.originalId || songInLib.id;
              localIndex = currentList.findIndex(s => s.id === canonicalId || s.originalId === canonicalId);
            }
          }

          if (localIndex !== -1) {
            if (localIndex !== currentIndexRef.current) {
              onIndexChange(localIndex);
            }
          } else if (targetIndex !== currentIndexRef.current && targetIndex < currentList.length) {
            onIndexChange(targetIndex);
          }
        } else if (targetIndex !== currentIndexRef.current && targetIndex < currentList.length) {
          onIndexChange(targetIndex);
        }

        // If we are a spectator, we should probably show we are following someone locally
        if (!activeSession) {
          onJoinSession({
            id: `local-joined-${setlist.id}`,
            setlistId: setlist.originalId || setlist.id,
            directorId: data.directorId || 'local-director',
            directorName: data.directorName || 'Local',
            currentSongIndex: targetIndex,
            currentSongId: targetSongId,
            active: true,
            isOffline: true,
            updatedAt: new Date()
          });
        }
      }

      if (type === 'SESSION_CLOSED' && !isDirector && activeSession?.isOffline) {
        onSessionClosed?.();
      }

      if (type === 'VIEWER_PING' && isDirector) {
        // A viewer just said they are here
        setViewerCount(prev => prev + 1);
        // We'll reset the viewer count periodically and let pings fill it back up for "offline" count
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [setlist.id, setlist.originalId, isDirector, onJoinSession, activeSession?.id]);

  // Offline Viewer Heartbeat (ping back to director)
  useEffect(() => {
    if (!isDirector && activeSession && channelRef.current) {
      const interval = setInterval(() => {
        channelRef.current?.postMessage({ type: 'VIEWER_PING' });
      }, 30000); // Ping every 30s
      return () => clearInterval(interval);
    }
  }, [isDirector, activeSession?.id]);

  // Director: Reset offline viewer count occasionally to refresh
  useEffect(() => {
    if (isDirector && activeSession?.isOffline) {
      const interval = setInterval(() => {
        setViewerCount(0);
      }, 65000); // Reset every ~minute
      return () => clearInterval(interval);
    }
  }, [isDirector, activeSession?.isOffline]);

  // Update refs to avoid frequent listener restarts
  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const setlistSongs = useMemo(() => setlist.songIds
    .map(id => songs.find(s => s.id === id))
    .filter(Boolean) as Song[], [setlist.songIds, songs]);

  useEffect(() => {
    setlistSongsRef.current = setlistSongs;
  }, [setlistSongs]);

  const currentSong = setlistSongs[currentIndex];

  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && activeSession && isDirector) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          console.debug('Wake Lock failed:', err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (err: any) {
          console.debug('Wake Lock release failed:', err);
        }
      }
    };

    if (activeSession && isDirector) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [activeSession?.id, isDirector]);

  const [isStale, setIsStale] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [p2pManager, setP2PManager] = useState<P2PManager | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Initialize P2P Manager
  useEffect(() => {
    if (activeSession && profile?.uid) {
      const manager = new P2PManager(
        activeSession.id, 
        profile.uid, 
        isDirector,
        (update) => {
          // Callback for spectator: when song changes via P2P
          const targetSongId = update.data.currentSongId;
          const targetIndex = update.data.currentSongIndex;
          const currentList = setlistSongsRef.current;

          if (targetSongId) {
            let localIndex = currentList.findIndex(s => 
              s.id === targetSongId || 
              s.originalId === targetSongId || 
              (s.originalId && targetSongId === s.originalId)
            );
            if (localIndex !== -1) {
              if (localIndex !== currentIndexRef.current) {
                onIndexChange(localIndex);
              }
            } else if (targetIndex !== currentIndexRef.current && targetIndex < currentList.length) {
              onIndexChange(targetIndex);
            }
          } else if (targetIndex !== currentIndexRef.current && targetIndex < currentList.length) {
            onIndexChange(targetIndex);
          }
        }
      );

      manager.start();
      setP2PManager(manager);
      onP2PStatusChange?.(true);

      return () => {
        manager.destroy();
        setP2PManager(null);
        onP2PStatusChange?.(false);
      };
    }
  }, [activeSession?.id, isDirector, profile?.uid, onIndexChange]);

  // Sync viewerCount to parent
  useEffect(() => {
    onViewerCountChange?.(viewerCount);
  }, [viewerCount, onViewerCountChange]);

  // Handle external session actions
  useEffect(() => {
    const handleSessionAction = (e: any) => {
      if (e.detail === 'stop') handleStopSession();
      if (e.detail === 'leave') handleLeaveSession();
    };
    window.addEventListener('session-action', handleSessionAction);
    return () => window.removeEventListener('session-action', handleSessionAction);
  }, [activeSession, isDirector]);

  // Spectator Heartbeat
  useEffect(() => {
    if (!isDirector && activeSession && profile?.uid) {
      const participantRef = doc(db, 'sessions', activeSession.id, 'participants', profile.uid);
      
      const updateHeartbeat = async () => {
        try {
          await setDoc(participantRef, {
            updatedAt: serverTimestamp(),
            name: profile.displayName || profile.email.split('@')[0]
          });
        } catch (err) {
          console.error('Heartbeat error:', err);
        }
      };

      updateHeartbeat();
      const interval = setInterval(updateHeartbeat, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isDirector, activeSession?.id, profile?.uid]);

  // Director: Listen to participant count
  useEffect(() => {
    if (isDirector && activeSession) {
      const participantsRef = collection(db, 'sessions', activeSession.id, 'participants');
      
      const unsubscribe = onSnapshot(participantsRef, (snapshot) => {
        const now = Date.now();
        // Count only those who updated in the last 2 minutes
        const activeViewers = snapshot.docs.filter(doc => {
          const data = doc.data();
          // If updatedAt is not yet available from server, assume it's fresh if it's a local write
          const updatedAt = data.updatedAt?.toMillis();
          
          if (!updatedAt) {
            // If it's a very new document without a server timestamp yet, treat it as active
            return true;
          }
          
          return (now - updatedAt) < 120000; 
        });
        setViewerCount(activeViewers.length);
      });

      return () => unsubscribe();
    } else {
      setViewerCount(0);
    }
  }, [isDirector, activeSession?.id]);

  useEffect(() => {
    if (!isDirector && activeSession) {
      const checkStale = () => {
        const lastUpdate = activeSession.updatedAt?.toMillis() || Date.now();
        setIsStale(Date.now() - lastUpdate > 300000); // 5 minutes stale
      };
      const interval = setInterval(checkStale, 10000);
      return () => clearInterval(interval);
    } else {
      setIsStale(false);
    }
  }, [activeSession?.updatedAt, isDirector]);

  // Sync director's index to Firestore and heartbeat
  useEffect(() => {
    if (isDirector && activeSession) {
      const updateSession = async (isHeartbeat = false) => {
        try {
          // Get fresh state from currentSong
          const targetSong = setlistSongsRef.current[currentIndex];
          if (!targetSong && !isHeartbeat) return;

          const canonicalSongId = targetSong?.originalId || targetSong?.id || '';
          
          // Broadcast locally immediately (works for both online/offline)
          if (channelRef.current) {
            channelRef.current.postMessage({
              type: 'SESSION_UPDATE',
              data: {
                currentSongIndex: currentIndex,
                currentSongId: canonicalSongId,
                directorId: activeSession.directorId,
                directorName: activeSession.directorName,
                updatedAt: Date.now()
              }
            });
          }

          // If session is NOT offline, also sync to Firestore
          if (!activeSession.isOffline) {
            const sessionRef = doc(db, 'sessions', activeSession.id);
            await updateDoc(sessionRef, {
              currentSongIndex: currentIndex,
              currentSongId: canonicalSongId,
              updatedAt: serverTimestamp(),
              active: true
            });
          }

          // Broadcast via P2P
          if (p2pManager && isDirector) {
            p2pManager.broadcast({
              type: 'SONG_CHANGE',
              data: {
                currentSongIndex: currentIndex,
                currentSongId: canonicalSongId,
                updatedAt: Date.now(),
                directorId: profile?.uid || ''
              }
            });
          }
        } catch (err: any) {
          if (err.code === 'not-found') {
            onSessionClosed?.();
          } else if (!isHeartbeat) {
            handleFirestoreError(err, OperationType.UPDATE, `sessions/${activeSession.id}`);
          }
        }
      };

      // Debounce the immediate update on song change
      // Using a slightly shorter debounce (100ms) to be more responsive but still grouping rapid clicks
      const timeout = setTimeout(() => {
        updateSession();
      }, 100);

      // Heartbeat interval
      const interval = setInterval(() => {
        updateSession(true);
      }, 15000);

      return () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    }
  }, [currentIndex, isDirector, activeSession?.id]);

  // Sync spectator's index from Firestore
  useEffect(() => {
    if (!isDirector && activeSession?.id && !activeSession.isOffline) {
      const sessionRef = doc(db, 'sessions', activeSession.id);
      const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Session;
          if (data.active) {
            // Robust matching using current refs to avoid listener restarts
            const targetSongId = data.currentSongId;
            const targetIndex = data.currentSongIndex;
            const currentList = setlistSongsRef.current;

            if (targetSongId) {
              let localIndex = currentList.findIndex(s => 
                s.id === targetSongId || 
                s.originalId === targetSongId || 
                (s.originalId && targetSongId === s.originalId)
              );
              
              if (localIndex === -1) {
                const songInLib = songsRef.current.find(s => s.id === targetSongId || s.originalId === targetSongId);
                if (songInLib) {
                  const canonicalId = songInLib.originalId || songInLib.id;
                  localIndex = currentList.findIndex(s => s.id === canonicalId || s.originalId === canonicalId);
                }
              }

              if (localIndex !== -1) {
                if (localIndex !== currentIndexRef.current) {
                  onIndexChange(localIndex);
                }
              } else if (targetIndex !== currentIndexRef.current && targetIndex < currentList.length) {
                onIndexChange(targetIndex);
              }
            } else if (targetIndex !== currentIndexRef.current && targetIndex < currentList.length) {
              onIndexChange(targetIndex);
            }
          } else {
            onSessionClosed?.();
          }
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, `sessions/${activeSession.id}`);
      });

      return () => unsubscribe();
    }
  }, [isDirector, activeSession?.id, onIndexChange, onSessionClosed]);

  const handleStopSession = async () => {
    if (activeSession && isDirector) {
      try {
        if (activeSession.isOffline) {
          channelRef.current?.postMessage({ type: 'SESSION_CLOSED' });
        } else {
          const sessionRef = doc(db, 'sessions', activeSession.id);
          await updateDoc(sessionRef, { active: false });
        }
        onSessionClosed?.();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `sessions/${activeSession.id}`);
      }
    }
  };

  const handleLeaveSession = () => {
    onSessionClosed?.();
  };

  const missingCount = setlist.songIds.length - setlistSongs.length;

  if (setlistSongs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
        <List size={48} className="mb-4 opacity-20" />
        <p>{t.noSongs}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Missing Songs Warning */}
      {!isFullScreen && missingCount > 0 && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <XCircle size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {missingCount} {t.missingSongsWarning}
            </span>
          </div>
          <button 
            onClick={() => onRepairSetlist?.(setlist)}
            className="text-[10px] font-bold bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors"
          >
            {t.removeMissing}
          </button>
        </div>
      )}

      {/* Song Content */}
      <div className="flex-1 overflow-hidden relative">
        {currentSong && (
          <SongViewer 
            song={currentSong} 
            fontSize={fontSize} 
            columns={columns} 
            transpose={transpose} 
            notation={notation} 
            chordFontSize={chordFontSize}
            showCapo={showCapo}
            minFontSize={minFontSize}
            maxFontSize={maxFontSize}
            autoResize={autoResize}
            songSettings={userSongSettings?.[currentSong.id]}
            onFontSizeChange={(newSize) => onFontSizeChange?.(newSize)}
            onColumnsChange={(newCols) => onColumnsChange?.(newCols)}
            onSettingsChange={(settings) => onSettingsChange?.(currentSong.id, settings)}
            t={t}
          />
        )}

        {/* Floating Navigation for Fullscreen - Now simplified or removed as per user preference if top bar works */}
        {isFullScreen && (
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-3 z-30">
            <div className="flex items-center gap-2">
              <button 
                disabled={currentIndex === 0 || (activeSession && !isDirector)}
                onClick={() => onIndexChange(currentIndex - 1)}
                className="p-4 bg-zinc-900/80 text-white rounded-full shadow-lg disabled:opacity-30 backdrop-blur-sm hover:bg-zinc-800 transition-all"
              >
                <ChevronLeft size={24} />
              </button>
              <div className="px-4 py-2 bg-zinc-900/80 text-white rounded-full shadow-lg text-xs font-bold backdrop-blur-sm border border-white/10">
                {currentIndex + 1} / {setlistSongs.length}
              </div>
              <button 
                disabled={currentIndex === setlistSongs.length - 1 || (activeSession && !isDirector)}
                onClick={() => onIndexChange(currentIndex + 1)}
                className="p-4 bg-zinc-900/80 text-white rounded-full shadow-lg disabled:opacity-30 backdrop-blur-sm hover:bg-zinc-800 transition-all"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showDirectorDialog && (
          <DirectorModeDialog 
            setlist={setlist}
            initialSongId={currentSong?.originalId || currentSong?.id}
            onClose={() => {
              setShowDirectorDialog(false);
              onDirectorDialogClose?.();
            }}
            onStartSession={(session) => {
              onStartSession(session);
              setShowDirectorDialog(false);
              onDirectorDialogClose?.();
            }}
            onJoinSession={(session) => {
              onJoinSession(session);
              setShowDirectorDialog(false);
              onDirectorDialogClose?.();
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showShareDialog && activeSession && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-xl font-bold">{t.shareSession}</h2>
                <button 
                  onClick={() => {
                    setShowShareDialog(false);
                    onShareSessionClose?.();
                  }}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="p-8 flex flex-col items-center gap-6">
                <div className="p-4 bg-white rounded-2xl shadow-inner border border-zinc-100">
                  <QRCodeSVG 
                    value={`${window.location.origin}/?join=${activeSession.id}`} 
                    size={200}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                
                <div className="text-center w-full space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{t.scanToJoin}</p>
                    <p className="text-xs text-zinc-400">ID de Sesión:</p>
                  </div>
                  <div className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-xl font-mono text-xl font-bold tracking-wider text-blue-600 dark:text-blue-400 border border-zinc-200 dark:border-zinc-700 select-all">
                    {activeSession.id}
                  </div>
                </div>

                <div className="w-full space-y-2">
                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/?join=${activeSession.id}`;
                      navigator.clipboard.writeText(link);
                      setIsCopied(true);
                      setTimeout(() => setIsCopied(false), 2000);
                    }}
                    className="w-full p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-between hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all font-bold text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <LinkIcon size={18} className="text-blue-600" />
                      <span>{isCopied ? t.successCopied : t.copyJoinLink}</span>
                    </div>
                    {isCopied && <Check size={18} className="text-green-500" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
