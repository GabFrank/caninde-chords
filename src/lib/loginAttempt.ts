// Registro del último intento de acceso. La redirección saca al usuario de la
// app y lo trae de vuelta con la página recargada: sin dejar rastro en disco no
// hay forma de saber, al volver, si Google devolvió algo o no.

export interface LoginAttempt {
  at: number;
  method: 'popup' | 'redirect';
  /** 'pendiente' mientras está en curso; 'ok', o el código de lo que fallo. */
  outcome: string;
}

const KEY = 'cc:lastLoginAttempt';

export function recordAttempt(method: LoginAttempt['method']) {
  try {
    const attempt: LoginAttempt = { at: Date.now(), method, outcome: 'pendiente' };
    window.localStorage.setItem(KEY, JSON.stringify(attempt));
  } catch {
    // Sin almacenamiento seguimos igual: esto es telemetría, no parte del acceso.
  }
}

export function readAttempt(): LoginAttempt | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LoginAttempt) : null;
  } catch {
    return null;
  }
}

export function finishAttempt(outcome: string) {
  try {
    const attempt = readAttempt();
    if (!attempt || attempt.outcome !== 'pendiente') return;
    window.localStorage.setItem(KEY, JSON.stringify({ ...attempt, outcome }));
  } catch {
    // idem
  }
}

export function describeAttempt(attempt: LoginAttempt): string {
  const mins = Math.round((Date.now() - attempt.at) / 60000);
  const ago = mins < 1 ? 'recién' : `hace ${mins} min`;
  return `${attempt.method} · ${attempt.outcome} · ${ago}`;
}
