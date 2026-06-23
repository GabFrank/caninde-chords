import { defineConfig } from 'vitest/config';

// Tests del núcleo puro (ritual-core): corren en Node, sin plugins de app ni PWA.
// Misma convención que CanindéChords.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
