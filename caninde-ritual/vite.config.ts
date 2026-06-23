import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// La versión que muestra la app se lee desde package.json, igual que CanindéChords,
// para que la SPA y el versionado de release siempre coincidan.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Emite /version.json en el build para verificar la versión publicada desde el navegador.
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
        workbox: {
          globIgnores: ['**/node_modules/**/*', '**/version.json'],
          navigateFallbackDenylist: [/^\/version\.json$/],
        },
        manifest: {
          name: 'Caniné Ritual',
          short_name: 'CaniRitual',
          description: 'Curaduría y orquestación musical para ceremonias.',
          theme_color: '#0b0b0f',
          background_color: '#09090b',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [],
        },
      }),
    ],
    define: {
      '__APP_VERSION__': JSON.stringify(pkg.version),
      'global': 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
