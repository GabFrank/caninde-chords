// Almacén de tokens (ver doc §8).
//
// Interfaz `TokenStore`: en web/Firebase se persiste del lado cliente; en Electron, en
// el llavero del SO. En memoria para tests. El núcleo sólo conoce la interfaz.

import type { OAuthToken } from './oauth';

export interface TokenStore {
  get(provider: string): Promise<OAuthToken | null>;
  set(provider: string, token: OAuthToken): Promise<void>;
  clear(provider: string): Promise<void>;
}

/** Implementación en memoria (tests y fallback). */
export class InMemoryTokenStore implements TokenStore {
  private map = new Map<string, OAuthToken>();

  async get(provider: string): Promise<OAuthToken | null> {
    return this.map.get(provider) ?? null;
  }

  async set(provider: string, token: OAuthToken): Promise<void> {
    this.map.set(provider, token);
  }

  async clear(provider: string): Promise<void> {
    this.map.delete(provider);
  }
}

/**
 * Persistencia en Web Storage (localStorage/sessionStorage). El almacenamiento se
 * inyecta para no acoplar el núcleo al navegador. TODO Fase posterior: cifrar.
 */
export class WebStorageTokenStore implements TokenStore {
  constructor(
    private storage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void },
    private prefix = 'caninde-ritual.token.',
  ) {}

  async get(provider: string): Promise<OAuthToken | null> {
    const raw = this.storage.getItem(this.prefix + provider);
    return raw ? (JSON.parse(raw) as OAuthToken) : null;
  }

  async set(provider: string, token: OAuthToken): Promise<void> {
    this.storage.setItem(this.prefix + provider, JSON.stringify(token));
  }

  async clear(provider: string): Promise<void> {
    this.storage.removeItem(this.prefix + provider);
  }
}
