// Traduce los errores de Firebase Auth / Firestore a algo que el músico pueda
// leer en pantalla. Antes estos errores sólo iban a console.error y el usuario
// veía la pantalla de login otra vez, sin explicación (el "bucle" de login).

export interface AuthIssue {
  /** Código crudo de Firebase, p. ej. `auth/popup-blocked`. Se muestra para poder diagnosticar. */
  code: string;
  message: string;
  /** El popup nunca llegó a abrirse: reintentar con redirección tiene sentido y es automático. */
  autoRedirect: boolean;
  /** Reintentar con redirección puede resolverlo, pero lo decide el usuario. */
  offerRedirect: boolean;
}

type Copy = { es: string; en: string };

const MESSAGES: Record<string, Copy> = {
  'auth/popup-blocked': {
    es: 'El navegador bloqueó la ventana de Google. Reintentando con redirección...',
    en: 'The browser blocked the Google window. Retrying with a redirect...',
  },
  'auth/operation-not-supported-in-this-environment': {
    es: 'Este navegador no admite la ventana emergente. Reintentando con redirección...',
    en: 'This browser does not support the popup. Retrying with a redirect...',
  },
  'auth/web-storage-unsupported': {
    es: 'El navegador tiene el almacenamiento bloqueado (¿modo incógnito o cookies de terceros bloqueadas?). Reintentando con redirección...',
    en: 'Storage is blocked in this browser (incognito or third-party cookies blocked?). Retrying with a redirect...',
  },
  'auth/popup-closed-by-user': {
    es: 'La ventana de Google se cerró antes de terminar. Si no la cerraste vos, probá con la redirección.',
    en: 'The Google window closed before finishing. If you did not close it, try the redirect.',
  },
  'auth/cancelled-popup-request': {
    es: 'Se canceló el intento anterior. Probá de nuevo, o con la redirección.',
    en: 'The previous attempt was cancelled. Try again, or use the redirect.',
  },
  'auth/timeout': {
    es: 'Google tardó demasiado en responder. Probá con la redirección.',
    en: 'Google took too long to respond. Try the redirect.',
  },
  'auth/unauthorized-domain': {
    es: 'Este dominio no está autorizado en Firebase Authentication. Hay que agregarlo en Authentication → Settings → Authorized domains.',
    en: 'This domain is not authorized in Firebase Authentication. Add it under Authentication → Settings → Authorized domains.',
  },
  'auth/operation-not-allowed': {
    es: 'El inicio de sesión con Google está deshabilitado en este proyecto de Firebase.',
    en: 'Google sign-in is disabled in this Firebase project.',
  },
  'auth/admin-restricted-operation': {
    es: 'Una restricción del proyecto (blocking function o política de administrador) rechazó el inicio de sesión.',
    en: 'A project restriction (blocking function or admin policy) rejected the sign-in.',
  },
  'auth/internal-error': {
    es: 'Google rechazó el inicio de sesión. Suele ser la pantalla de consentimiento OAuth (en modo Prueba, o pendiente de verificación) o una blocking function del proyecto.',
    en: 'Google rejected the sign-in. This is usually the OAuth consent screen (in Testing mode or pending verification) or a project blocking function.',
  },
  'auth/network-request-failed': {
    es: 'No hay conexión con Google. Revisá tu internet e intentá de nuevo.',
    en: 'No connection to Google. Check your internet and try again.',
  },
  'auth/user-disabled': {
    es: 'Esta cuenta está deshabilitada en el proyecto.',
    en: 'This account is disabled in the project.',
  },
  'auth/account-exists-with-different-credential': {
    es: 'Ya existe una cuenta con este email usando otro método de acceso.',
    en: 'An account with this email already exists using another sign-in method.',
  },
  'permission-denied': {
    es: 'Entraste, pero la base de datos rechazó la lectura de tu perfil. Revisá las reglas de Firestore.',
    en: 'You signed in, but the database rejected reading your profile. Check the Firestore rules.',
  },
  unavailable: {
    es: 'No se pudo contactar la base de datos. Puede ser falta de conexión.',
    en: 'Could not reach the database. You may be offline.',
  },
};

/** Errores en los que el popup ni siquiera llegó a abrirse: la redirección va sola. */
const AUTO_REDIRECT = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

/** Errores en los que la redirección es un plan B razonable, pero lo elige el usuario. */
const OFFER_REDIRECT = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/timeout',
  'auth/internal-error',
]);

export function preferredLang(): 'es' | 'en' {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function describeAuthError(error: unknown): AuthIssue {
  const code = (error as { code?: string })?.code || 'unknown';
  const copy = MESSAGES[code];
  const lang = preferredLang();
  const fallback = (error as { message?: string })?.message || String(error);

  return {
    code,
    message: copy ? copy[lang] : fallback,
    autoRedirect: AUTO_REDIRECT.has(code),
    offerRedirect: OFFER_REDIRECT.has(code),
  };
}
