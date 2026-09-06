/**
 * Prueba de humo de la interfaz.
 *
 * Existe porque `npm test` sólo cubre lógica pura y `tsc` no ve errores
 * de runtime: una vez se desplegó a producción una pantalla en blanco (hooks
 * declarados debajo de un return temprano) que pasó lint, tests y dos revisiones
 * de código. Esto la habría detectado.
 *
 * No hay código de prueba en la app: la sesión se simula escribiendo en
 * IndexedDB el mismo registro que Firebase Auth usa para recordar al usuario.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize } from 'path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

/** Sirve dist/ sin dependencias, para que `npm run smoke` funcione solo. */
function serveDist() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = process.env.SMOKE_URL ? null : await serveDist();
const BASE = process.env.SMOKE_URL || `http://127.0.0.1:${server.address().port}`;
const CHROME = process.env.SMOKE_CHROME || undefined;
const cfg = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url)));

const VIEWPORTS = [
  { name: 'teléfono vertical',   width: 390,  height: 844, mode: 'compact', nav: true },
  { name: 'teléfono horizontal', width: 844,  height: 390, mode: 'compact', nav: true },
  { name: 'tablet vertical',     width: 820,  height: 1180, mode: 'regular', nav: false },
  { name: 'tablet horizontal',   width: 1180, height: 820, mode: 'desktop', nav: false },
];

/** Escribe la sesión persistida de Firebase antes de que cargue la app. */
function seedAuth(apiKey) {
  const user = {
    uid: 'smoke-user',
    email: 'smoke@example.test',
    displayName: 'Smoke Test',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [{ providerId: 'google.com', uid: 'smoke-user', displayName: 'Smoke Test', email: 'smoke@example.test', phoneNumber: null, photoURL: null }],
    stsTokenManager: { refreshToken: 'smoke-refresh', accessToken: 'smoke-access', expirationTime: Date.now() + 3600_000 },
    createdAt: String(Date.now()),
    lastLoginAt: String(Date.now()),
    apiKey,
    appName: '[DEFAULT]',
  };
  return new Promise((resolve, reject) => {
    // Sin versión explícita: Firebase ya creó la base y forzar la 1 puede dar
    // VersionError si la suya es mayor.
    const open = indexedDB.open('firebaseLocalStorageDb');
    open.onerror = () => reject(new Error('no se pudo abrir firebaseLocalStorageDb'));
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
        db.close();
        reject(new Error('falta el store firebaseLocalStorage'));
        return;
      }
      const tx = db.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({
        fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`,
        value: user,
      });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(new Error('falló la escritura')); };
    };
  });
}

const failures = [];
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  page.on('console', (m) => {
    const t = m.text();
    // Firestore no es alcanzable desde CI; ese ruido no es un fallo de la UI.
    if (m.type() === 'error' && !/firestore|Firebase|net::ERR|Failed to load resource/i.test(t)) jsErrors.push('console: ' + t);
  });

  // La prueba es hermética: se bloquea todo lo que no venga del servidor local.
  // Si Firebase puede salir a la red, intenta refrescar el token sembrado, falla
  // y cierra la sesión, con lo que la app vuelve al formulario de acceso y la
  // prueba mide otra cosa. Sin red, Firebase conserva la sesión persistida y la
  // app renderiza sin perfil, que es justamente una de las garantías a proteger.
  await page.route('**/*', (route) =>
    route.request().url().startsWith(BASE) ? route.continue() : route.abort(),
  );

  // Primero se carga la app para que Firebase cree su base, después se siembra
  // la sesión y se recarga: addInitScript no espera la promesa de IndexedDB.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(seedAuth, cfg.apiKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Sin backend, el perfil no carga y la app sale de la pantalla de carga por el
  // vigilante de 12s. Esperar el selector en vez de un sleep fijo hace la prueba
  // rápida cuando el render es inmediato, y de paso verifica ese vigilante.
  await page.waitForSelector('[data-mode]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const root = document.querySelector('[data-mode]');
    const nav = document.querySelector('nav');
    return {
      rendered: (document.getElementById('root')?.innerHTML.length ?? 0) > 500,
      mode: root?.getAttribute('data-mode') ?? null,
      navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      headerOverflow: (() => {
        const h = document.querySelector('header');
        return h ? h.scrollWidth > h.clientWidth + 1 : false;
      })(),
    };
  });

  const problems = [];
  if (jsErrors.length) problems.push(`errores de JS: ${jsErrors.join(' | ')}`);
  if (!r.rendered) problems.push('la app no renderizó (pantalla en blanco)');
  if (r.mode !== vp.mode) problems.push(`modo ${r.mode}, se esperaba ${vp.mode}`);
  if (r.navVisible !== vp.nav) problems.push(`barra inferior ${r.navVisible ? 'visible' : 'oculta'}, se esperaba ${vp.nav ? 'visible' : 'oculta'}`);
  if (r.overflowX) problems.push('la página desborda horizontalmente');
  if (r.headerOverflow) problems.push('el contenido de la cabecera desborda su ancho');

  console.log(`${problems.length ? '✗' : '✓'} ${vp.name} (${vp.width}×${vp.height})${problems.length ? '\n    ' + problems.join('\n    ') : ''}`);
  if (problems.length) failures.push(vp.name);
  await page.close();
}

await browser.close();
server?.close();
if (failures.length) {
  console.error(`\nFallaron ${failures.length} de ${VIEWPORTS.length}: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`\n${VIEWPORTS.length} viewports en verde.`);
