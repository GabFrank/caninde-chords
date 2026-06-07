import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthProvider';
import { translations } from '../translations';
import { Session, Setlist } from '../types';
import { Users, Play, X, User, LogIn, RefreshCw, Camera } from 'lucide-react';
import { QRScanner } from './QRScanner';
import { motion, AnimatePresence } from 'motion/react';

interface DirectorModeDialogProps {
  setlist: Setlist;
  initialSongId?: string;
  onClose: () => void;
  onStartSession: (session: Session) => void;
  onJoinSession: (session: Session) => void;
}

export const DirectorModeDialog: React.FC<DirectorModeDialogProps> = ({ 
  setlist, 
  initialSongId,
  onClose, 
  onStartSession, 
  onJoinSession 
}) => {
  const { user, profile } = useAuth();
  const t = translations[profile?.language || 'en'];
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'sessions'), 
      where('active', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;

      const sessions = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Session))
        .filter(s => {
          if (!s.active) return false;
          
          const canonicalId = setlist.originalId || setlist.id;
          const isCorrectSetlist = s.setlistId === canonicalId || s.setlistId === setlist.id || (setlist.originalId && s.setlistId === setlist.originalId);
          if (!isCorrectSetlist) return false;

          // Heartbeat check: must have been updated in the last 10 minutes (lenient with clock skew)
          // OR be the current user's session (so they can rejoin/cleanup)
          const lastUpdate = s.updatedAt?.toMillis() || 0;
          return lastUpdate > tenMinutesAgo || s.directorId === user?.uid;
        });
      
      setActiveSessions(sessions);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'sessions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setlist.id, setlist.originalId, refreshKey]);

  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleStartSession = async () => {
    if (!user) return;

    // Check if user already has an active session for this setlist
    const existing = activeSessions.find(s => s.directorId === user.uid);
    if (existing) {
      onStartSession(existing);
      onClose();
      return;
    }

    const otherDirectors = activeSessions.filter(s => s.directorId !== user.uid);
    if (otherDirectors.length > 0 && !showConflictWarning) {
      setShowConflictWarning(true);
      return;
    }

    try {
      const canonicalId = setlist.originalId || setlist.id;
      const sessionData = {
        setlistId: canonicalId,
        directorId: user.uid,
        directorName: user.displayName || 'Anonymous',
        currentSongIndex: 0,
        currentSongId: initialSongId || '',
        active: true,
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      onStartSession({ id: docRef.id, ...sessionData } as Session);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sessions');
    }
  };

  const handleManualJoin = async () => {
    if (!joinId.trim()) return;
    setIsJoining(true);
    try {
      const sessionDoc = await getDoc(doc(db, 'sessions', joinId.trim()));
      if (sessionDoc.exists()) {
        const session = { id: sessionDoc.id, ...sessionDoc.data() } as Session;
        if (session.active) {
          onJoinSession(session);
          onClose();
        } else {
          alert(t.invalidSession);
        }
      } else {
        alert(t.invalidSession);
      }
    } catch (err) {
      console.error(err);
      alert(t.invalidSession);
    } finally {
      setIsJoining(false);
    }
  };

  const handleStartLocalSession = () => {
    const canonicalId = setlist.originalId || setlist.id;
    const sessionData: Session = {
      id: `local-${canonicalId}`,
      setlistId: canonicalId,
      directorId: user?.uid || 'local-director',
      directorName: profile?.displayName || 'Local Director',
      currentSongIndex: 0,
      currentSongId: initialSongId || '',
      active: true,
      isOffline: true,
      updatedAt: new Date()
    };
    onStartSession(sessionData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 rounded-xl">
              <Users className="text-blue-600" size={24} />
            </div>
            <h2 className="text-xl font-bold">{t.directorMode}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setRefreshKey(prev => prev + 1)}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-all active:rotate-180"
              title={t.refresh || 'Refresh'}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            {showConflictWarning ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-4 animate-in fade-in zoom-in duration-200">
                <div className="flex gap-3 text-amber-700 dark:text-amber-400">
                  <div className="p-2 bg-amber-100 dark:bg-amber-800/40 rounded-full h-fit">
                    <Users size={16} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{t.directorConflict}</p>
                    <p className="text-xs opacity-80">{t.directorConflictConfirm}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConflictWarning(false)}
                    className="flex-1 py-2 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleStartSession}
                    className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                  >
                    {t.beDirector}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleStartSession}
                className="w-full flex items-center gap-4 p-6 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
              >
                <div className="p-3 bg-white/20 rounded-xl">
                  <Play size={24} fill="currentColor" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-lg">{t.beDirector}</p>
                  <p className="text-blue-100 text-xs">{t.directorControl}</p>
                </div>
              </button>
            )}

            {/* Local Session Button */}
            <button
              onClick={handleStartLocalSession}
              className="w-full flex items-center gap-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95 border border-zinc-200 dark:border-zinc-700"
            >
              <div className="p-2 bg-zinc-200 dark:bg-zinc-700 rounded-xl text-zinc-600 dark:text-zinc-400">
                <RefreshCw size={20} />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">{t.startLocalSession}</p>
                <p className="text-zinc-500 text-[10px]">{t.localSessionDesc}</p>
              </div>
            </button>

            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t.joinSession}</span>
                <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder={t.enterSessionId}
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                />
                <button
                  onClick={() => setShowScanner(true)}
                  className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-500"
                  title="Scan QR"
                >
                  <Camera size={20} />
                </button>
                <button
                  onClick={handleManualJoin}
                  disabled={isJoining || !joinId.trim()}
                  className="bg-blue-600 text-white px-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                  title={t.join}
                >
                  {isJoining ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <LogIn size={20} />
                  )}
                </button>
              </div>
            </div>

            {showScanner && (
              <QRScanner 
                onScan={(id) => {
                  setJoinId(id);
                  setShowScanner(false);
                }} 
                onClose={() => setShowScanner(false)} 
              />
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">{t.activeSessions}</h3>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${activeSessions.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'}`} />
                <span className="text-[10px] font-bold text-zinc-400">{activeSessions.length}</span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activeSessions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-auto pr-2 custom-scrollbar">
                {activeSessions
                  .map(session => (
                    <div key={session.id} className="group relative">
                      <button
                        onClick={() => { 
                          if (session.directorId === user?.uid) {
                            onStartSession(session);
                          } else {
                            onJoinSession(session);
                          }
                          onClose(); 
                        }}
                        className="w-full p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-blue-600/30 rounded-2xl flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${session.directorId === user?.uid ? 'bg-blue-600' : 'bg-blue-600/10 group-hover:bg-blue-600'}`}>
                            <User size={24} className={session.directorId === user?.uid ? 'text-white' : 'text-blue-600 group-hover:text-white transition-colors'} />
                          </div>
                          <div className="text-left">
                            <p className="font-bold">{session.directorId === user?.uid ? `${t.director} (${t.you})` : session.directorName}</p>
                            <p className="text-xs text-zinc-500">{session.directorId === user?.uid ? t.rejoinSession : t.beSpectator}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs font-bold">{session.directorId === user?.uid ? t.rejoin : t.add}</span>
                          <LogIn size={18} />
                        </div>
                      </button>
                      
                      {session.directorId === user?.uid && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await updateDoc(doc(db, 'sessions', session.id), { active: false });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `sessions/${session.id}`);
                            }
                          }}
                          className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                          title={t.stopSession}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="py-12 text-center bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
                <Users size={32} className="mx-auto mb-3 text-zinc-300" />
                <p className="text-sm text-zinc-500">{t.noActiveSessions}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
