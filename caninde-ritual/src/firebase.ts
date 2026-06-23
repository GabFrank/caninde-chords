// Scaffold de Firebase (Fase 2/8) — mismas convenciones que CanindéChords.
//
// La persistencia (Firestore) y el deploy a Hosting son fases posteriores; este módulo
// queda preparado pero NO se inicializa en el arranque de la app todavía. Lee la config
// de variables de entorno Vite (import.meta.env) en vez de un JSON commiteado.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function isFirebaseConfigured(): boolean {
  return !!import.meta.env.VITE_FIREBASE_PROJECT_ID && !!import.meta.env.VITE_FIREBASE_API_KEY;
}

/** Inicializa Firebase de forma perezosa. Lanza si falta configuración. */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase no configurado: definí las variables VITE_FIREBASE_* (Fase 2/8).');
  }
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  return app;
}

export function getDb(): Firestore {
  if (dbInstance) return dbInstance;
  const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
  dbInstance = databaseId
    ? getFirestore(getFirebaseApp(), databaseId)
    : getFirestore(getFirebaseApp());
  return dbInstance;
}
