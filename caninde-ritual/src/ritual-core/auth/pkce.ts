// PKCE — Proof Key for Code Exchange (ver doc §8).
//
// OAuth 2.0 Authorization Code + PKCE para clientes públicos (sin client secret).
// Usa Web Crypto (disponible en navegador y en Node 22+ vía globalThis.crypto).

/** Codifica bytes en base64url (sin padding). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function' ? btoa(str) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto no disponible: se requiere navegador o Node 22+.');
  }
  return c;
}

/** Genera un code_verifier aleatorio (43–128 chars, base64url). */
export function generateVerifier(length = 64): string {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, Math.max(43, Math.min(128, length)));
}

/** Deriva el code_challenge (S256) a partir del verifier. */
export async function challengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await getCrypto().subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** Estado anti-CSRF aleatorio para el flujo OAuth. */
export function generateState(length = 16): string {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = generateVerifier();
  const challenge = await challengeFromVerifier(verifier);
  return { verifier, challenge, method: 'S256' };
}
