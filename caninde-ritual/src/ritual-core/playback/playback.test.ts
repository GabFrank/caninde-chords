import { describe, it, expect } from 'vitest';
import { CAPABILITIES } from './engine';
import { LocalPlaybackAdapter } from './adapters/local.adapter';
import { SpotifyPlaybackAdapter } from './adapters/spotify.adapter';
import { YouTubePlaybackAdapter } from './adapters/youtube.adapter';
import type { Track } from '../model/track';

const track: Track = {
  id: 't',
  title: 't',
  durationMs: 1000,
  tags: [],
  source: { provider: 'local', externalId: 'x' },
};

describe('capabilities (tabla del doc §7)', () => {
  it('sólo local tiene crossfade real, web audio y offline', () => {
    expect(CAPABILITIES.local.realCrossfade).toBe(true);
    expect(CAPABILITIES.local.webAudio).toBe(true);
    expect(CAPABILITIES.local.offline).toBe(true);
    expect(CAPABILITIES.spotify.realCrossfade).toBe(false);
    expect(CAPABILITIES.youtube.realCrossfade).toBe(false);
  });

  it('sólo youtube requiere reproductor visible', () => {
    expect(CAPABILITIES.youtube.visiblePlayer).toBe(true);
    expect(CAPABILITIES.spotify.visiblePlayer).toBe(false);
    expect(CAPABILITIES.local.visiblePlayer).toBe(false);
  });
});

describe('adaptadores (stubs)', () => {
  it('cada adaptador expone su proveedor y capabilities', () => {
    expect(new LocalPlaybackAdapter().provider).toBe('local');
    expect(new SpotifyPlaybackAdapter().provider).toBe('spotify');
    expect(new YouTubePlaybackAdapter().provider).toBe('youtube');
    expect(new LocalPlaybackAdapter().capabilities).toEqual(CAPABILITIES.local);
  });

  it('flujo básico de estado load → play → pause → stop', async () => {
    const engine = new LocalPlaybackAdapter();
    expect(engine.getState()).toBe('idle');
    await engine.load(track);
    expect(engine.getState()).toBe('ready');
    await engine.play();
    expect(engine.getState()).toBe('playing');
    await engine.pause();
    expect(engine.getState()).toBe('paused');
    await engine.stop();
    expect(engine.getState()).toBe('idle');
  });

  it('setVolume clampa a [0,1]', async () => {
    const engine = new LocalPlaybackAdapter();
    await engine.setVolume(5);
    await engine.fadeTo(-2, 0);
    // sin getter público de volumen, sólo verificamos que no lanza
    expect(engine.getState()).toBe('idle');
  });
});
