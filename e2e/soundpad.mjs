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
import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync, rmSync } from 'fs';
import { tmpdir } from 'os';
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

// Se cuentan las fichas de voz, no el texto de la pantalla: el hueco que la
// franja "Sonando" reserva siempre lleva la leyenda "Nada sonando", que contiene
// la misma palabra y haría pasar la comprobación con el tablero mudo.
const fichasDeVoz = () => page.evaluate(() => document.querySelectorAll('[data-voice-id]').length);
const countPlaying = () => page.evaluate(() =>
  document.querySelectorAll('[data-pad-id][data-playing="true"]').length);
// Por id y no por texto: el pad muestra nombre, insignias y duración juntos.
const idsDePads = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-pad-id]')].map(el => el.getAttribute('data-pad-id')));

/**
 * Espera a que no quede nada sonando. Con esperas fijas no alcanza: el fundido
 * es configurable por sonido y un ambiente con 2 s de apagado sigue sonando —
 * correctamente— mucho después de tocar el pánico.
 */
async function esperarSilencio(ms = 6000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (await countPlaying() === 0) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) process.exitCode = 1; };

// Ir a Utilitarios
await page.getByRole('button', { name: /Utilitarios|Utilities/ }).first().click();
await page.waitForTimeout(400);
check('la pestaña Utilitarios abre el Soundpad', await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).count() > 0);
// Sobre el código y no sobre el DOM: comprobar que un texto no está en la
// pantalla actual pasaría igual si los módulos siguieran vivos tras otra pestaña.
// Se buscan los identificadores, que sólo pueden aparecer en código; el nombre
// "Yggdrasil" se busca aparte y sólo en los textos visibles, porque un
// comentario que explique qué se retiró y por qué es legítimo.
const restos = execSync(
  "grep -rlE 'HarmonyComposer|HarmonyManual|harmonyEngine' " + join(ROOT, 'src') + " || true",
  { encoding: 'utf8' }).trim();
check('no queda código de los módulos retirados', restos === '', restos);
const textos = execSync(
  "grep -lE 'Yggdrasil|Manual de Conexiones' " + join(ROOT, 'src/translations.ts') + " || true",
  { encoding: 'utf8' }).trim();
check('no queda ningún texto visible de los módulos retirados', textos === '', textos);
// Se ENTRA al Afinador, no se comprueba que exista su botón: el riesgo real de
// haber adelgazado `audioEngine` es que el afinador reviente al montarse, y eso
// una comprobación sobre la pestaña no lo vería.
await page.getByRole('button', { name: /^(Afinador|Tuner)$/ }).click();
await page.waitForTimeout(600);
check('el Afinador monta y funciona',
  await page.getByText(/Encender Micrófono|Enable Microphone|EADGBE/i).count() > 0);
await page.getByRole('button', { name: /^Soundpad$/ }).click();
await page.waitForTimeout(400);

// Alta de un sonido
await page.getByRole('button', { name: /Agregar sonido|Add sound/ }).first().click();
await page.waitForTimeout(300);
await page.locator('input[type=file][accept*="audio"]').setInputFiles(WAV);
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
  check('al tocar el pad aparece una ficha en "Sonando"', await fichasDeVoz() === 1);

  const activos = await page.evaluate(() =>
    document.querySelectorAll('[data-pad-id][data-playing="true"]').length);
  check('el pad se marca como activo', activos === 1, `activos: ${activos}`);

  // Pánico
  await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).click();
  await page.waitForTimeout(600);
  check('el pánico deja de mostrar voces', await fichasDeVoz() === 0);

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
  await page.locator('input[type=file][accept*="audio"]').setInputFiles(WAV);
  await page.waitForTimeout(200);
  await page.locator('#pad-name').fill(name);
  if (!overlay) await page.getByRole('button', { name: /^(Corta todo lo demás antes de sonar|Stops everything else first)$/ }).click();
  if (loop) await page.getByRole('button', { name: /^(En bucle hasta pararlo|Loop until stopped)$/ }).click();
  await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
  await page.waitForTimeout(900);
}

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

// ── Los tres ajustes por sonido se guardan y se releen ──────────────────────
// Overlay ya quedó cubierto arriba por su efecto audible; volumen y repeticiones
// se comprueban por lo que el editor muestra al reabrir el pad.
await page.getByRole('button', { name: /Agregar sonido|Add sound/ }).first().click();
await page.waitForTimeout(300);
await page.locator('input[type=file][accept*="audio"]').setInputFiles(WAV);
await page.waitForTimeout(200);
await page.locator('#pad-name').fill('Cuenco');
await page.locator('#pad-volume').fill('0.4');
await page.locator('input[type=number]').first().fill('3');
await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
await page.waitForTimeout(1000);

await page.locator('[data-pad-id]').filter({ hasText: 'Cuenco' }).locator('..')
  .getByRole('button', { name: /Editar|Edit/ }).click();
await page.waitForTimeout(400);
check('el volumen del pad se guardó', await page.locator('#pad-volume').inputValue() === '0.4',
  `valor: ${await page.locator('#pad-volume').inputValue()}`);
check('las repeticiones se guardaron', await page.locator('input[type=number]').first().inputValue() === '3');
await page.getByRole('button', { name: /^Cerrar$/ }).click();
await page.waitForTimeout(300);

// ── Recorte no destructivo y fundido ────────────────────────────────────────
await page.locator('[data-pad-id]').filter({ hasText: 'Cuenco' }).locator('..')
  .getByRole('button', { name: /Editar|Edit/ }).click();
await page.waitForTimeout(700);
check('el recortador dibuja la forma de onda',
  await page.getByRole('img', { name: /Forma de onda|Waveform/ }).count() === 1);

// El WAV de prueba dura 1 s: se recorta a la mitad del medio.
await page.locator('#trim-start').fill('0.25');
await page.locator('#trim-end').fill('0.75');
await page.locator('#pad-fade').fill('2');
await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
await page.waitForTimeout(1000);

await page.locator('[data-pad-id]').filter({ hasText: 'Cuenco' }).locator('..')
  .getByRole('button', { name: /Editar|Edit/ }).click();
await page.waitForTimeout(700);
check('el recorte se guardó', await page.locator('#trim-start').inputValue() === '0.25'
  && await page.locator('#trim-end').inputValue() === '0.75',
  `${await page.locator('#trim-start').inputValue()}-${await page.locator('#trim-end').inputValue()}`);
check('el fundido se guardó en segundos', await page.locator('#pad-fade').inputValue() === '2');

// Reemplazar el archivo tiene que borrar las marcas: apuntaban al audio viejo.
await page.locator('input[type=file][accept*="audio"]').setInputFiles(WAV);
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
await page.waitForTimeout(1200);
await page.locator('[data-pad-id]').filter({ hasText: 'Cuenco' }).locator('..')
  .getByRole('button', { name: /Editar|Edit/ }).click();
await page.waitForTimeout(900);
const inicio = await page.locator('#trim-start').inputValue();
check('reemplazar el archivo borra el recorte viejo', inicio === '0', `empieza en ${inicio}`);
await page.getByRole('button', { name: /^Cerrar$/ }).click();
await page.waitForTimeout(400);

// ── Categorías: son uno de los requisitos y no tenían ninguna cobertura ──────
await page.getByRole('button', { name: /^(Categorías|Categories)$/ }).click();
await page.waitForTimeout(400);
await page.locator('#cat-name').fill('Naturaleza');
await page.getByRole('button', { name: /^(Nueva categoría|New category)$/ }).click();
await page.waitForTimeout(900);
check('la categoría aparece en el modal', await page.getByText('Naturaleza').count() > 0);
await page.getByRole('button', { name: /^Cerrar$/ }).click();
await page.waitForTimeout(400);
check('la categoría no aparece como filtro mientras esté vacía',
  await page.getByRole('button', { name: /^Naturaleza / }).count() === 0);

await page.locator('[data-pad-id]').filter({ hasText: 'Cuenco' }).locator('..')
  .getByRole('button', { name: /Editar|Edit/ }).click();
await page.waitForTimeout(400);
await page.locator('#pad-category').selectOption({ label: 'Naturaleza' });
await page.getByRole('button', { name: /^Guardar|^Save/ }).click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: /^Naturaleza / }).click();
await page.waitForTimeout(400);
check('el filtro de la categoría muestra sólo su pad',
  await page.locator('[data-pad-id]').count() === 1);
await page.getByRole('button', { name: /^(Todos|All) / }).first().click();
await page.waitForTimeout(300);

// ── Ida y vuelta del pack ────────────────────────────────────────────────────
// Es el único camino para llevar los audios a otro dispositivo, así que se prueba
// el escenario completo: exportar, perder los audios, importar y volver a sonar.
const packPath = join(tmpdir(), `soundpad-e2e-${Date.now()}.zip`);
const download = page.waitForEvent('download', { timeout: 20000 });
await page.getByRole('button', { name: /Exportar pack|Export pack/ }).click();
await (await download).saveAs(packPath);
check('el pack se descarga', existsSync(packPath) && statSync(packPath).size > 0);

const borrarAudios = () => page.evaluate(() => new Promise(res => {
  const open = indexedDB.open('caninde-sounds');
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').clear();
    tx.oncomplete = () => { db.close(); res(true); };
  };
  open.onerror = () => res(false);
}));
const clavesGuardadas = () => page.evaluate(() => new Promise(res => {
  const open = indexedDB.open('caninde-sounds');
  open.onsuccess = () => {
    const db = open.result;
    const req = db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
    req.onsuccess = () => { const n = req.result.length; db.close(); res(n); };
  };
  open.onerror = () => res(-1);
}));

// Simula el dispositivo nuevo: las fichas llegaron por Firestore, los audios no.
await borrarAudios();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-mode]', { timeout: 20000 });
await page.getByRole('button', { name: /Utilitarios|Utilities/ }).first().click();
await page.waitForTimeout(1200);
check('sin los audios, los pads avisan que falta el archivo',
  await page.getByText(/La ficha del sonido se sincronizó|The sound card is synced/).count() > 0);

await page.locator('input[type=file][accept*="zip"]').setInputFiles(packPath);
await page.waitForTimeout(2500);
// Se compara contra los PADS, no contra las claves guardadas: reemplazar el
// archivo de un pad deja su audio viejo en el dispositivo hasta la próxima
// sesión (está protegido de `pruneOrphans`), y el pack sólo lleva los que algún
// pad referencia — que es exactamente lo que debe llevar.
const restaurados = await clavesGuardadas();
const padsConAudio = (await idsDePads()).length;
check('importar el pack devuelve el audio de todos los pads', restaurados >= padsConAudio,
  `restaurados ${restaurados}, pads ${padsConAudio}`);
check('el aviso de audio faltante desaparece',
  await page.getByText(/La ficha del sonido se sincronizó|The sound card is synced/).count() === 0);

await page.getByRole('button', { name: /^Trueno lejano/ }).first().dispatchEvent('pointerdown');
await page.waitForTimeout(500);
check('un pad restaurado desde el pack vuelve a sonar', await countPlaying() === 1);
await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).click();
rmSync(packPath, { force: true });

// ── Modo organizar ──────────────────────────────────────────────────────────
const antesDeOrdenar = await idsDePads();
await page.getByRole('button', { name: /^(Organizar|Arrange)$/ }).click();
await page.waitForTimeout(500);
check('organizar oculta la grilla y muestra la lista',
  await page.locator('[data-arrange-id]').count() === antesDeOrdenar.length &&
  await page.locator('[data-pad-id]').count() === 0);

// El último sube hasta el principio con las flechas, que es lo único que
// funciona en táctil y con teclado.
const ultimo = antesDeOrdenar[antesDeOrdenar.length - 1];
for (let i = 0; i < antesDeOrdenar.length - 1; i++) {
  await page.locator(`[data-move-up="${ultimo}"]`).click();
  await page.waitForTimeout(120);
}
await page.getByRole('button', { name: /^(Listo|Done)$/ }).click();
await page.waitForTimeout(1200);

const despues = await idsDePads();
check('el pad movido queda primero', despues[0] === ultimo, `primero: ${despues[0]}, esperado: ${ultimo}`);
check('no se perdió ni se duplicó ningún pad',
  despues.length === antesDeOrdenar.length && new Set(despues).size === despues.length);

// El orden tiene que sobrevivir a una recarga: si sólo cambió en memoria, no
// sirve de nada para la próxima ceremonia.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-mode]', { timeout: 20000 });
await page.getByRole('button', { name: /Utilitarios|Utilities/ }).first().click();
await page.waitForTimeout(1500);
check('el orden nuevo sobrevive a recargar la página', (await idsDePads())[0] === ultimo);

// ── Regresiones de las auditorías ───────────────────────────────────────────

// (a) Desplazarse por la grilla no debe disparar sonidos.
// El pad dispara en `pointerdown` para no tener latencia; el precio es que un
// arrastre empieza igual que un toque. El disparo se retira en cuanto el gesto
// se revela como arrastre, y eso es lo que se comprueba acá.
await page.getByRole('button', { name: /^(Todos|All) / }).first().click();
await page.waitForTimeout(300);
const caja = await page.locator('[data-pad-id]').first().boundingBox();
await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
await page.mouse.down();
for (let i = 1; i <= 5; i++) await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2 - i * 12);
await page.mouse.up();
await page.waitForTimeout(500);
check('desplazarse sobre un pad no deja ningún sonido', await countPlaying() === 0, `activos: ${await countPlaying()}`);

// (b) La grilla no puede moverse cuando empieza a sonar el primer pad.
const yAntes = (await page.locator('[data-pad-id]').first().boundingBox()).y;
await page.locator('[data-pad-id]').first().dispatchEvent('pointerdown');
await page.waitForTimeout(400);
const yDurante = (await page.locator('[data-pad-id]').first().boundingBox()).y;
check('la grilla no se mueve al empezar a sonar', Math.abs(yDurante - yAntes) < 2,
  `se movió ${Math.round(yDurante - yAntes)}px`);
await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).click();
await esperarSilencio();

// (c) Los pads tienen que responder al teclado (pedal, teclado numérico, lector).
await page.locator('[data-pad-id]').first().focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
check('un pad enfocado se dispara con Enter', await countPlaying() === 1, `activos: ${await countPlaying()}`);
await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).click();
await esperarSilencio();

// (c2) Atajos globales: las teclas 1-9 disparan por posición, Escape es el pánico.
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('2');
await page.waitForTimeout(500);
const segundoId = (await idsDePads())[1];
const sonando = await page.evaluate(() =>
  [...document.querySelectorAll('[data-pad-id][data-playing="true"]')].map(el => el.getAttribute('data-pad-id')));
check('la tecla 2 dispara el segundo pad de la pantalla',
  sonando.length === 1 && sonando[0] === segundoId, `sonando: ${sonando.join(',')}`);

await page.keyboard.press('Escape');
check('Escape para todo', await esperarSilencio());

// Escribiendo en un campo, los números no pueden disparar nada.
await page.getByRole('button', { name: /Agregar sonido|Add sound/ }).first().click();
await page.waitForTimeout(400);
await page.locator('#pad-name').fill('Trueno 3');
await page.waitForTimeout(300);
check('escribir un número en un campo no dispara ningún pad', await countPlaying() === 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Escape con el modal abierto lo cierra en vez de disparar el pánico',
  await page.locator('#pad-name').count() === 0);

// La tecla asignada se ve en el pad, o no sirve de nada.
check('el pad muestra su tecla', await page.evaluate(() =>
  document.querySelector('[data-pad-id]')?.textContent?.includes('1') ?? false));

// (d) Un bucle no puede quedar sonando fuera del control de la interfaz.
// El motor sobrevive al desmontaje del tablero: al volver de otra pestaña, la
// interfaz tiene que seguir viendo la voz y poder cortarla.
await page.getByRole('button', { name: /^Lluvia/ }).first().dispatchEvent('pointerdown');
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^(Afinador|Tuner)$/ }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Soundpad$/ }).click();
await page.waitForTimeout(700);
check('al volver de otra pestaña, el bucle sigue bajo control', await fichasDeVoz() === 1, `fichas: ${await fichasDeVoz()}`);
check('y el botón de pánico está habilitado',
  !(await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).isDisabled()));
await page.getByRole('button', { name: /PARAR TODO|STOP ALL/ }).click();
await page.waitForTimeout(500);
check('el pánico lo corta', await fichasDeVoz() === 0);

// (e) En teléfono, los botones de sólo ícono tienen que tener nombre.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
const sinNombre = await page.evaluate(() => {
  const visible = (el) => el.getBoundingClientRect().width > 0;
  return [...document.querySelectorAll('button')].filter(b =>
    visible(b) && !b.getAttribute('aria-label') && !b.textContent.trim()).length;
});
check('ningún botón visible queda sin nombre a 390px', sinNombre === 0, `sin nombre: ${sinNombre}`);
check('no hay desbordamiento horizontal a 390px',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

check('sin errores de JavaScript', errs.length === 0, errs.join(' | '));

console.log(results.join('\n'));
console.log(process.exitCode ? '\nHay comprobaciones en rojo.' : '\nSoundpad en verde.');
await browser.close();
server.close();
