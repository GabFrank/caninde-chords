import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from './memory';
import { makeId, sanitizeForStorage } from './serialization';
import type { Track } from '../model/track';

const track = (id: string, over: Partial<Track> = {}): Track => ({
  id,
  title: id,
  durationMs: 1000,
  tags: [],
  source: { provider: 'local', externalId: id },
  ...over,
});

describe('sanitizeForStorage', () => {
  it('elimina undefined en profundidad sin tocar null/0/arrays', () => {
    const input = {
      a: 1,
      b: undefined,
      c: null,
      d: 0,
      e: { f: undefined, g: 'x' },
      h: [{ i: undefined, j: 2 }],
    };
    const out = sanitizeForStorage(input) as Record<string, unknown>;
    expect('b' in out).toBe(false);
    expect(out.c).toBeNull();
    expect(out.d).toBe(0);
    expect((out.e as Record<string, unknown>)).toEqual({ g: 'x' });
    expect((out.h as Array<Record<string, unknown>>)[0]).toEqual({ j: 2 });
  });

  it('no muta la entrada', () => {
    const input = { a: undefined, b: 1 };
    sanitizeForStorage(input);
    expect('a' in input).toBe(true);
  });

  it('limpia campos opcionales undefined de un Track (Firestore-safe)', () => {
    const t = track('x', { artist: undefined, audioMeta: undefined });
    const out = sanitizeForStorage(t) as unknown as Record<string, unknown>;
    expect('artist' in out).toBe(false);
    expect('audioMeta' in out).toBe(false);
  });
});

describe('makeId', () => {
  it('genera ids únicos con prefijo', () => {
    const a = makeId('track');
    const b = makeId('track');
    expect(a).not.toBe(b);
    expect(a.startsWith('track_')).toBe(true);
  });
});

describe('InMemoryRepository', () => {
  it('save crea con timestamps y list los devuelve ordenados por creación', async () => {
    let t = 1000;
    const repo = new InMemoryRepository<Track>({ ownerId: 'u1', clock: () => t });
    t = 1000; await repo.save(track('a'));
    t = 2000; await repo.save(track('b'));

    const all = await repo.list();
    expect(all.map((e) => e.id)).toEqual(['a', 'b']);
    expect(all[0].ownerId).toBe('u1');
    expect(all[0].createdAt).toBe(1000);
    expect(all[0].updatedAt).toBe(1000);
  });

  it('save sobre id existente conserva createdAt y actualiza updatedAt', async () => {
    let t = 1000;
    const repo = new InMemoryRepository<Track>({ clock: () => t });
    t = 1000; const first = await repo.save(track('a', { title: 'Uno' }));
    t = 5000; const second = await repo.save(track('a', { title: 'Dos' }));

    expect(second.createdAt).toBe(first.createdAt); // 1000
    expect(second.updatedAt).toBe(5000);
    expect(second.title).toBe('Dos');
    expect((await repo.list()).length).toBe(1); // upsert, no duplica
  });

  it('get devuelve null si no existe y remove es idempotente', async () => {
    const repo = new InMemoryRepository<Track>();
    expect(await repo.get('nope')).toBeNull();
    await repo.save(track('a'));
    await repo.remove('a');
    await repo.remove('a'); // no lanza
    expect(await repo.get('a')).toBeNull();
  });

  it('las copias devueltas no se filtran al store interno', async () => {
    const repo = new InMemoryRepository<Track>();
    await repo.save(track('a', { title: 'Original' }));
    const got = await repo.get('a');
    got!.title = 'Mutado';
    const again = await repo.get('a');
    expect(again!.title).toBe('Original');
  });
});
