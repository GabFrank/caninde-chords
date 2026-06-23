// Demo: genera PKCE e imprime las URLs de login reales (doc §9).
//   node --experimental-strip-types src/ritual-core/demo/auth.ts
//   o:  npm run demo:auth   (usa tsx)

import { makeSpotifyConfig, makeYouTubeConfig } from '../auth/providers';
import { buildAuthorizationUrl } from '../auth/oauth';
import { createPkcePair, generateState } from '../auth/pkce';

async function main() {
  const spotify = makeSpotifyConfig({
    clientId: process.env.VITE_SPOTIFY_CLIENT_ID ?? 'TU_SPOTIFY_CLIENT_ID',
    redirectUri: process.env.VITE_SPOTIFY_REDIRECT_URI ?? 'http://localhost:3001/callback',
  });
  const youtube = makeYouTubeConfig({
    clientId: process.env.VITE_YOUTUBE_CLIENT_ID ?? 'TU_GOOGLE_CLIENT_ID',
    redirectUri: process.env.VITE_YOUTUBE_REDIRECT_URI ?? 'http://localhost:3001/callback',
  });

  for (const config of [spotify, youtube]) {
    const { verifier, challenge } = await createPkcePair();
    const state = generateState();
    const url = buildAuthorizationUrl(config, { challenge, state });
    console.log(`\n🔑 ${config.provider.toUpperCase()}`);
    console.log(`  verifier (guardar): ${verifier}`);
    console.log(`  state:              ${state}`);
    console.log(`  URL de login:\n  ${url}`);
  }
  console.log('');
}

void main();
