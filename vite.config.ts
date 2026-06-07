import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// La versión que muestra la app se lee aquí desde package.json (que semantic-release
// mantiene actualizado), para que siempre coincida con la versión publicada.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      // Emite /version.json en el build para poder verificar la versión publicada
      // desde el navegador (franco-control.web.app/version.json).
      {
        name: 'emit-version-json',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString() }),
          });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['CanindeChords.png'],
        workbox: {
          // version.json nunca se cachea ni se sirve como index.html: siempre va a la red.
          globIgnores: ['**/node_modules/**/*', '**/version.json'],
          navigateFallbackDenylist: [/^\/version\.json$/],
          // Cachea los samples del SoundFont de guitarra para que funcione offline
          // tras la primera carga.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/gleitz\.github\.io\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'guitar-soundfont',
                expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ],
        },
        manifest: {
          name: 'CanindeChords',
          short_name: 'CanindeChords',
          description: 'Collaborative song and setlist manager for musicians',
          theme_color: '#2563eb',
          background_color: '#09090b',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/CanindeChords.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/CanindeChords.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/CanindeChords.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ],
          shortcuts: [
            {
              name: 'New Song',
              short_name: 'New',
              url: '/?new=true',
              icons: [{ src: '/CanindeChords.png', sizes: '192x192' }]
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(pkg.version),
      'global': 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
