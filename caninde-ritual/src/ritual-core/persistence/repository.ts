// Persistencia — puertos (Fase 2, groundwork independiente del shell).
//
// `ritual-core` no conoce Firestore: define una interfaz `Repository<T>` y los tipos
// de metadatos. El adaptador concreto (FirestoreRepository) vive en la app y se inyecta,
// igual que los adaptadores de reproducción. Acá sólo hay lógica pura y testeable.

/** Cualquier entidad persistible tiene un id estable. */
export interface Identifiable {
  id: string;
}

/** Metadatos que agrega la capa de persistencia (dueño + timestamps). */
export interface EntityMeta {
  /** uid del usuario dueño (mismo patrón que CanindéChords: ownerId = user.uid). */
  ownerId: string;
  /** Epoch ms de creación. */
  createdAt: number;
  /** Epoch ms de última actualización. */
  updatedAt: number;
}

/** Una entidad tal como queda guardada: el modelo + sus metadatos. */
export type Stored<T> = T & EntityMeta;

/** Reloj inyectable (para tests deterministas). */
export type Clock = () => number;

/**
 * Repositorio CRUD de una colección de un único dueño. La instancia concreta se
 * construye con el contexto del usuario actual (ownerId); los métodos no lo reciben.
 */
export interface Repository<T extends Identifiable> {
  /** Todas las entidades del dueño. */
  list(): Promise<Stored<T>[]>;
  /** Una entidad por id, o `null` si no existe. */
  get(id: string): Promise<Stored<T> | null>;
  /** Upsert por id: crea o reemplaza, fija timestamps, devuelve lo guardado. */
  save(entity: T): Promise<Stored<T>>;
  /** Borra por id (idempotente). */
  remove(id: string): Promise<void>;
}
