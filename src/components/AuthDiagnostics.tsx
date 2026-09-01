import React, { useState } from 'react';
import { Stethoscope, Copy, Check, Loader2 } from 'lucide-react';
import { auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { preferredLang } from '../lib/authErrors';

declare const __APP_VERSION__: string;

interface Check {
  label: string;
  value: string;
}

/** Corre una promesa con tope de tiempo: un chequeo colgado no puede colgar el diagnóstico. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function timed(fn: () => Promise<unknown>, ms = 8000): Promise<string> {
  const started = Date.now();
  try {
    await withTimeout(fn(), ms);
    return `ok (${Date.now() - started}ms)`;
  } catch (error) {
    return `FALLO (${Date.now() - started}ms): ${(error as Error).message}`;
  }
}

function storageCheck(store: Storage | undefined): string {
  try {
    if (!store) return 'no disponible';
    store.setItem('__cc_probe', '1');
    store.removeItem('__cc_probe');
    return 'ok';
  } catch (error) {
    return `bloqueado: ${(error as Error).name}`;
  }
}

/** ¿Quedó una redirección a medias? Firebase guarda la marca en sessionStorage. */
function pendingRedirect(): string {
  try {
    const keys = Object.keys(window.sessionStorage).filter((k) => k.toLowerCase().includes('pendingredirect'));
    return keys.length ? `SÍ (${keys.length})` : 'no';
  } catch {
    return 'no se pudo leer';
  }
}

export const AuthDiagnostics: React.FC<{ authResolvedMs: number | null }> = ({ authResolvedMs }) => {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const es = preferredLang() === 'es';

  const run = async () => {
    setRunning(true);
    const authDomain = firebaseConfig.authDomain;

    // ¿Responde el backend de Identity Toolkit desde ESTE dispositivo? Es la misma
    // llamada que hace el acceso con Google, así que un fallo aquí es la causa.
    const identityToolkit = await timed(async () => {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: 'google.com',
            continueUri: `https://${authDomain}/__/auth/handler`,
          }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.authUri) throw new Error('sin authUri');
    });

    // El iframe del authDomain: si no carga, Firebase nunca resuelve el acceso.
    const authIframe = await timed(async () => {
      await fetch(`https://${authDomain}/__/auth/iframe`, { mode: 'no-cors' });
    });

    const indexedDb = await timed(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = window.indexedDB.open('__cc_probe', 1);
          req.onsuccess = () => {
            req.result.close();
            resolve();
          };
          req.onerror = () => reject(new Error('onerror'));
          req.onblocked = () => reject(new Error('blocked'));
        }),
      5000,
    );

    setChecks([
      { label: 'versión', value: __APP_VERSION__ },
      { label: 'origen', value: window.location.origin },
      { label: 'authDomain', value: authDomain },
      { label: 'mismo origen', value: window.location.hostname === authDomain ? 'sí' : 'NO' },
      { label: 'sesión activa', value: auth.currentUser?.email || 'ninguna' },
      { label: 'acceso resuelto en', value: authResolvedMs === null ? 'NUNCA' : `${authResolvedMs}ms` },
      { label: 'redirección pendiente', value: pendingRedirect() },
      { label: 'identitytoolkit', value: identityToolkit },
      { label: 'iframe authDomain', value: authIframe },
      { label: 'cookies', value: navigator.cookieEnabled ? 'ok' : 'BLOQUEADAS' },
      { label: 'localStorage', value: storageCheck(window.localStorage) },
      { label: 'sessionStorage', value: storageCheck(window.sessionStorage) },
      { label: 'indexedDB', value: indexedDb },
      { label: 'navegador', value: navigator.userAgent },
    ]);
    setRunning(false);
  };

  const copy = async () => {
    if (!checks) return;
    try {
      await navigator.clipboard.writeText(checks.map((c) => `${c.label}: ${c.value}`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles queda la lectura en pantalla.
    }
  };

  return (
    <div className="text-left">
      {!checks && (
        <button
          onClick={run}
          disabled={running}
          className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />}
          {running
            ? es ? 'Analizando...' : 'Running...'
            : es ? 'Ejecutar diagnóstico' : 'Run diagnostics'}
        </button>
      )}

      {checks && (
        <div className="space-y-3">
          <div className="bg-zinc-100 dark:bg-zinc-800/70 rounded-xl p-3 space-y-1 max-h-72 overflow-y-auto">
            {checks.map((c) => (
              <div key={c.label} className="text-[11px] font-mono leading-relaxed break-all">
                <span className="text-zinc-500">{c.label}: </span>
                <span
                  className={
                    /FALLO|NUNCA|BLOQUEAD|^NO$|bloqueado/.test(c.value)
                      ? 'text-red-600 dark:text-red-400 font-bold'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }
                >
                  {c.value}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={copy}
            className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? (es ? 'Copiado' : 'Copied') : es ? 'Copiar resultado' : 'Copy result'}
          </button>
        </div>
      )}
    </div>
  );
};
