/**
 * Prueba funcional del Soundpad en un navegador real, sobre `dist/`.
 *
 * `npm test` cubre la lógica del motor con un AudioContext simulado, y eso no
 * demuestra que el tablero funcione: lo que importa acá es que el operador toque
 * un pad y salga el sonido correcto, que uno de overlay se superponga y uno
 * exclusivo corte, y que todo eso siga funcionando SIN RED, que es la situación
 * habitual en el lugar de la ceremonia.
 *
 * Por eso la prueba bloquea todo lo que no venga del servidor local: Firestore
 * queda inalcanzable a propósito, y aun así los pads tienen que aparecer y
 * sonar. La sesión se siembra escribiendo en IndexedDB el mismo registro que usa
 * Firebase Auth, igual que en `smoke.mjs`.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize } from 'path';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const CHROME = process.env.SMOKE_CHROME || undefined;

/** Un tono de 1 s en WAV, generado acá para no versionar un binario. */
function makeWav() {
  const sr = 8000, n = sr;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 12000), 44 + i * 2);
  return buf;
}
const WAV = { name: 'trueno.wav', mimeType: 'audio/wav', buffer: makeWav() };
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

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  // Sin esto el navegador headless deja el AudioContext suspendido y ningún pad
  // llegaría a sonar, con lo que la prueba mediría otra cosa.
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/firestore|Firebase|net::ERR|Failed to load resource|WebChannel/i.test(m.text())) errs.push('console: ' + m.text()); });
await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.evaluate(seedAuth, cfg.apiKey);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-mode]', { timeout: 20000 });
await page.waitForTimeout(600);

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) process.exitCode = 1; };

// Ir a Utilitarios
await page.getByRole('button', { name: /Utilitarios|Utilities/ }).first().click();
await page.waitForTimeout(400);
check('la pestaña Utilitarios abre el Soundpad', await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).count() > 0);
check('el Yggdrasil ya no está', await page.getByText(/Yggdrasil/).count() === 0);
check('el Manual de Conexiones ya no está', await page.getByText(/Manual de Conexiones|Connections Manual/).count() === 0);
check('el Afinador sigue disponible', await page.getByRole('button', { name: /^(Afinador|Tuner)$/ }).count() > 0);

// Alta de un sonido
await page.getByRole('button', { name: /Agregar sonido|Add sound/ }).first().click();
await page.waitForTimeout(300);
await page.locator('input[type=file]').setInputFiles(WAV);
await page.waitForTimeout(300);
await page.locator('#pad-name').fill('Trueno lejano');
await page.locator('#pad-volume').fill('0.5');
await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
await page.waitForTimeout(1200);

const padVisible = await page.getByRole('button', { name: /Trueno lejano/ }).count() > 0;
check('el pad aparece en el tablero tras guardar (con la red caída)', padVisible);

if (padVisible) {
  // Disparar
  await page.getByRole('button', { name: /Trueno lejano/ }).first().dispatchEvent('pointerdown');
  await page.waitForTimeout(400);
  const playing = await page.evaluate(() => !!document.body.innerText.match(/SONANDO|PLAYING/i));
  check('al tocar el pad aparece en "Sonando"', playing);

  const activos = await page.evaluate(() =>
    document.querySelectorAll('[data-pad-id][data-playing="true"]').length);
  check('el pad se marca como activo', activos === 1, `activos: ${activos}`);

  // Pánico
  await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).click();
  await page.waitForTimeout(600);
  check('el pánico deja de mostrar voces', !(await page.evaluate(() => !!document.body.innerText.match(/SONANDO|PLAYING/i))));

  // Persistencia del audio en IndexedDB
  const stored = await page.evaluate(() => new Promise(res => {
    const open = indexedDB.open('caninde-sounds');
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
      req.onsuccess = () => { const n = req.result.length; db.close(); res(n); };
      req.onerror = () => { db.close(); res(-1); };
    };
    open.onerror = () => res(-1);
  }));
  check('el audio quedó guardado en IndexedDB', stored === 1, `claves: ${stored}`);

  // Favorito
  await page.getByRole('button', { name: /^Favorito$|^Favorite$/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Favoritos|Favorites/ }).first().click();
  await page.waitForTimeout(300);
  check('el filtro de Favoritos muestra el pad marcado', await page.getByRole('button', { name: /Trueno lejano/ }).count() > 0);
}

// ── Overlay vs exclusivo, que es el corazón de la funcionalidad ──────────────
async function addPad(name, { overlay, loop }) {
  await page.getByRole('button', { name: /Agregar sonido|Add sound/ }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[type=file]').setInputFiles(WAV);
  await page.waitForTimeout(200);
  await page.locator('#pad-name').fill(name);
  if (!overlay) await page.getByRole('button', { name: /Corta todo lo demás|Stops everything/ }).click();
  if (loop) await page.getByRole('button', { name: /En bucle hasta pararlo|Loop until stopped/ }).click();
  await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
  await page.waitForTimeout(900);
}

const countPlaying = () => page.evaluate(() =>
  document.querySelectorAll('[data-pad-id][data-playing="true"]').length);

await page.getByRole('button', { name: /^(Todos|All) / }).first().click();
await addPad('Lluvia', { overlay: true, loop: true });
await addPad('Viento', { overlay: true, loop: true });
await addPad('Big boom', { overlay: false, loop: false });

await page.getByRole('button', { name: /^Lluvia/ }).first().dispatchEvent('pointerdown');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Viento/ }).first().dispatchEvent('pointerdown');
await page.waitForTimeout(400);
check('dos pads de overlay suenan a la vez', await countPlaying() === 2, `activos: ${await countPlaying()}`);

await page.getByRole('button', { name: /^Big boom/ }).first().dispatchEvent('pointerdown');
await page.waitForTimeout(700);
const tras = await countPlaying();
check('un pad exclusivo corta a los que sonaban', tras === 1, `activos: ${tras}`);

await page.waitForTimeout(1200);
check('un pad de una sola pasada se apaga solo al terminar', await countPlaying() === 0, `activos: ${await countPlaying()}`);

check('sin errores de JavaScript', errs.length === 0, errs.join(' | '));

console.log(results.join('\n'));
console.log(process.exitCode ? '\nHay comprobaciones en rojo.' : '\nSoundpad en verde.');
await browser.close();
server.close();
