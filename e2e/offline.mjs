/**
 * Prueba funcional del guardado SIN RED, que es la situación normal en el lugar
 * de la ceremonia.
 *
 * El fallo que la motivó, verificado antes de arreglarlo: con la red caída,
 * `addDoc` y `updateDoc` no resuelven nunca —su promesa espera el acuse del
 * servidor, no la escritura—, así que el velo de "SAVING…" se quedaba a
 * pantalla completa para siempre y la única salida era recargar. A los 30
 * segundos seguía igual.
 *
 * Lo irónico es que el guardado había funcionado: Firestore aplica la escritura
 * en la caché local al instante. Lo único roto era la espera.
 *
 * Por eso lo que se comprueba acá no es "se guardó" sino que **la app sigue
 * usable**: el velo se levanta, el editor se cierra, la canción está en la
 * lista, y el aviso dice la verdad —guardado en este dispositivo—.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize } from 'path';
import { exigirDistFresco } from './distFresco.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
exigirDistFresco(ROOT, DIST);
const CHROME = process.env.SMOKE_CHROME || undefined;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, p);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const BASE = `http://127.0.0.1:${server.address().port}`;
const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase-applet-config.json')));

function seedAuth(apiKey) {
  const user = {
    uid: 'smoke-user', email: 'smoke@example.test', displayName: 'Smoke Test', photoURL: null,
    emailVerified: true, isAnonymous: false,
    providerData: [{ providerId: 'google.com', uid: 'smoke-user', displayName: 'Smoke Test', email: 'smoke@example.test', phoneNumber: null, photoURL: null }],
    stsTokenManager: { refreshToken: 'r', accessToken: 'a', expirationTime: Date.now() + 3600_000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
  };
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('firebaseLocalStorageDb');
    open.onerror = () => reject(new Error('no abre'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: user });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(new Error('no escribe')); };
    };
  });
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};
process.on('exit', () => {
  if (results.length > 0 && !global.__yaImprimio) {
    console.log('\nComprobaciones hasta el corte:');
    console.log(results.join('\n'));
  }
});

const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}) });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
// Nada sale del servidor local: Firestore queda inalcanzable a propósito.
await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.evaluate(seedAuth, cfg.apiKey);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-mode]', { timeout: 20000 });
await page.waitForTimeout(800);

/** ¿Está puesto el velo de carga a pantalla completa? */
const hayVelo = () => page.evaluate(() => !!document.querySelector('.z-\\[100\\]'));

/** Espera a que el velo se levante, y dice cuánto tardó. `null` si no se fue. */
async function esperarSinVelo(ms = 10000) {
  const hasta = Date.now() + ms;
  const desde = Date.now();
  while (Date.now() < hasta) {
    if (!(await hayVelo())) return Date.now() - desde;
    await page.waitForTimeout(100);
  }
  return null;
}

const textoDeAvisos = () => page.evaluate(() =>
  [...document.querySelectorAll('div')]
    .filter(d => /rounded-2xl/.test(d.className) && /fixed/.test(d.className))
    .map(d => d.textContent.trim()).join(' | '));

// ── Crear una canción sin red ───────────────────────────────────────────────
await page.getByRole('button', { name: /^(Nueva Canción|New Song)$/ }).first().click();
await page.waitForTimeout(600);
await page.getByPlaceholder(/^(Título|Title)$/i).first().fill('Canción sin red');
await page.locator('textarea').first().fill('[G] Letra de prueba');
await page.getByRole('button', { name: /^(Guardar|Save)$/ }).first().click();

const tardo = await esperarSinVelo();
check('el velo de "guardando" se levanta sin red', tardo !== null,
  tardo === null ? 'seguía puesto a los 10 s' : `tardó ${tardo} ms`);

check('el aviso dice que quedó guardado en el dispositivo',
  /este dispositivo|this device/i.test(await textoDeAvisos()),
  await textoDeAvisos());

await page.waitForTimeout(500);
check('el editor se cerró', await page.locator('textarea').count() === 0,
  `textareas: ${await page.locator('textarea').count()}`);

check('la canción está en la lista',
  await page.getByRole('button', { name: /^Canción sin red/ }).count() > 0);

// ── Editarla, también sin red ───────────────────────────────────────────────
await page.getByRole('button', { name: /^Canción sin red/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^(Editar|Edit)$/ }).first().click();
await page.waitForTimeout(600);
await page.locator('textarea').first().fill('[C] Letra corregida en el lugar');
await page.getByRole('button', { name: /^(Guardar|Save)$/ }).first().click();

const tardo2 = await esperarSinVelo();
check('editar y guardar tampoco traba la app', tardo2 !== null,
  tardo2 === null ? 'seguía puesto a los 10 s' : `tardó ${tardo2} ms`);

// ── Y sobrevive a recargar: la escritura quedó en la caché local ────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-mode]', { timeout: 20000 });
await page.waitForTimeout(1200);
check('la canción sigue ahí después de recargar',
  await page.getByRole('button', { name: /^Canción sin red/ }).count() > 0);

await page.getByRole('button', { name: /^Canción sin red/ }).first().click();
await page.waitForTimeout(800);
check('y conserva la corrección hecha sin red',
  (await page.locator('body').innerText()).includes('corregida en el lugar'));

// ── Un setlist, por el mismo camino ────────────────────────────────────────
await page.getByRole('button', { name: /^(Setlists)$/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^(Nuevo Setlist|New Setlist)$/ }).first().click();
await page.waitForTimeout(700);
// Por el marcador del campo, no por "el primer input de texto": ése era el
// buscador de la barra lateral, y el nombre del setlist quedaba vacío.
await page.getByPlaceholder(/^(Nombre|Name)$/i).first().fill('Ceremonia sin red');
// Guardar un setlist exige nombre Y al menos una canción; el selector de
// canciones es un panel aparte que hay que abrir.
await page.getByRole('button', { name: /^(Añadir Canciones|Add Songs)$/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Canción sin red/ }).first().click();
await page.waitForTimeout(500);
// Cerrar el panel para llegar a Guardar.
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^(Guardar|Save)$/ }).first().click();
const tardo3 = await esperarSinVelo();
check('guardar un setlist sin red tampoco traba la app', tardo3 !== null,
  tardo3 === null ? 'seguía puesto a los 10 s' : `tardó ${tardo3} ms`);

check('sin errores de JavaScript', errs.length === 0, errs.join(' | '));

global.__yaImprimio = true;
console.log(results.join('\n'));
console.log(process.exitCode ? '\nHay comprobaciones en rojo.' : '\nGuardado sin red en verde.');
await browser.close();
server.close();
