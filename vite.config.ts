import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['CanindeChords.png'],
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
