/**
 * Guarda contra probar un `dist/` viejo.
 *
 * Las dos pruebas de navegador sirven `dist/`, no `src/`. Sin esta guarda, tocar
 * el código y correr la prueba mide la versión ANTERIOR y sale en verde sobre
 * cambios que ni siquiera están compilados. Pasó de verdad: se "verificó" un
 * guardia de teclado sobre un build sin él y la comprobación pasó dos veces.
 *
 * Un aviso no alcanza —se pasa por alto—, así que esto corta la prueba.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/** El mtime más nuevo bajo `dir`, recursivo. */
function masNuevo(dir) {
  let max = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    max = Math.max(max, e.isDirectory() ? masNuevo(p) : statSync(p).mtimeMs);
  }
  return max;
}

/**
 * Corta el proceso si `dist/` falta o quedó por detrás de las fuentes.
 * @param {string} root Raíz del proyecto.
 * @param {string} dist Carpeta servida.
 */
export function exigirDistFresco(root, dist) {
  const indice = join(dist, 'index.html');
  if (!existsSync(indice)) {
    console.error('No hay dist/: corré `npm run build` antes de esta prueba.');
    process.exit(1);
  }
  const compilado = statSync(indice).mtimeMs;
  const fuentes = Math.max(
    masNuevo(join(root, 'src')),
    existsSync(join(root, 'index.html')) ? statSync(join(root, 'index.html')).mtimeMs : 0,
  );
  if (fuentes > compilado) {
    console.error(
      'dist/ es más viejo que src/: esta prueba mediría la versión anterior del código.\n' +
      'Corré `npm run build` y volvé a intentar.',
    );
    process.exit(1);
  }
}
