// Repositorio en memoria (Fase 2).
//
// Implementación de `Repository<T>` para tests y como fallback offline. El adaptador
// real de Firestore (en la app) implementa la misma interfaz. Mantiene los timestamps
// y el ownerId, y sanea los `undefined` igual que lo haría el almacenamiento real.

import type { Clock, Identifiable, Repository, Stored } from './repository';
import { sanitizeForStorage } from './serialization';

export interface InMemoryRepositoryOptions<T extends Identifiable> {
  /** Dueño que se estampa en las entidades. */
  ownerId?: string;
  /** Reloj inyectable para timestamps deterministas en tests. */
  clock?: Clock;
  /** Datos iniciales (ya con metadatos). */
  seed?: Stored<T>[];
}

export class InMemoryRepository<T extends Identifiable> implements Repository<T> {
  private readonly map = new Map<string, Stored<T>>();
  private readonly ownerId: string;
  private readonly clock: Clock;

  constructor(opts: InMemoryRepositoryOptions<T> = {}) {
    this.ownerId = opts.ownerId ?? 'local';
    this.clock = opts.clock ?? Date.now;
    for (const e of opts.seed ?? []) {
      this.map.set(e.id, sanitizeForStorage(e));
    }
  }

  async list(): Promise<Stored<T>[]> {
    return [...this.map.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((e) => sanitizeForStorage(e));
  }

  async get(id: string): Promise<Stored<T> | null> {
    const found = this.map.get(id);
    return found ? sanitizeForStorage(found) : null;
  }

  async save(entity: T): Promise<Stored<T>> {
    const now = this.clock();
    const existing = this.map.get(entity.id);
    const stored = sanitizeForStorage({
      ...entity,
      ownerId: this.ownerId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } as Stored<T>);
    this.map.set(entity.id, stored);
    return sanitizeForStorage(stored);
  }

  async remove(id: string): Promise<void> {
    this.map.delete(id);
  }
}
