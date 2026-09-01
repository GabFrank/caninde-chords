import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, getRedirectResult, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { AuthIssue, describeAuthError } from '../lib/authErrors';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  /** Último fallo de acceso, para mostrarlo en pantalla en vez de volver mudo al login. */
  authError: AuthIssue | null;
  setAuthError: (issue: AuthIssue | null) => void;
  /** Milisegundos que tardó Firebase en resolver el estado de acceso; null si nunca lo hizo. */
  authResolvedMs: number | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<AuthIssue | null>(null);
  /** Se marca en cuanto el estado de acceso queda resuelto, para desarmar el vigilante. */
  const settled = useRef(false);
  const startedAt = useRef(Date.now());
  const [authResolvedMs, setAuthResolvedMs] = useState<number | null>(null);

  const updateProfile = React.useCallback(async (updates: Partial<UserProfile>) => {
    if (!user) return;
    const newProfile = { ...profile, ...updates } as UserProfile;
    await setDoc(doc(db, 'users', user.uid), newProfile, { merge: true });
    setProfile(newProfile);
  }, [user, profile]);

  // La pantalla de carga no puede ser eterna. Un try/finally no protege contra una
  // promesa que nunca se resuelve, y eso es justo lo que pasa cuando el navegador
  // corta el intercambio entre web.app y el authDomain (firebaseapp.com), o cuando
  // Firestore no contesta. Pasado el plazo mostramos la app y decimos qué pasó.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (settled.current) return;
      const signedIn = Boolean(auth.currentUser);
      console.warn('Auth resolution timed out', { signedIn });
      setAuthError(describeAuthError({ code: signedIn ? 'app/profile-timeout' : 'app/auth-timeout' }));
      setLoading(false);
      setIsAuthReady(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  // Al volver de signInWithRedirect, el resultado (o el error real de Google)
  // aparece aquí. Sin esto un fallo de redirección era invisible.
  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error('Redirect sign-in failed', error);
      setAuthError(describeAuthError(error));
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      try {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Anonymous',
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || undefined,
              role: 'user',
              language: 'en',
              chordNotation: 'scientific',
              chordFontSize: 90,
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
          setAuthError(null);
        } else {
          setProfile(null);
        }
      } catch (error) {
        // Un fallo de Firestore (reglas, red) no debe dejar la app clavada en la
        // pantalla de carga: se reporta y se sigue, aunque sea sin perfil.
        console.error('Profile load failed', error);
        setProfile(null);
        setAuthError(describeAuthError(error));
      } finally {
        settled.current = true;
        setAuthResolvedMs(Date.now() - startedAt.current);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady, updateProfile, authError, setAuthError, authResolvedMs }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
