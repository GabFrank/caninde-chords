/**
 * Prueba funcional del MIDI de salida: que abrir una canción le mande a un pedal
 * de efectos el Program Change de su preset.
 *
 * No hay pedal ni interfaz USB-MIDI en el navegador de prueba, así que se finge
 * uno: se reemplaza `navigator.requestMIDIAccess` por un acceso cuya salida
 * ANOTA cada mensaje. Es la misma API que usa `src/services/midi.ts`, así que lo
 * que corre es el código de verdad y lo único simulado es el cable.
 *
 * Lo que se comprueba es lo que no se puede comprobar leyendo: que los bytes
 * sean los correctos, que no se repita el mismo preset, que una canción sin
 * preset deje el pedal como está, y que el canal viaje corrido en uno —que es
 * el error clásico de MIDI y el que haría que el pedal, en la ceremonia, no
 * responda.
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

/** El pedal fingido, instalado ANTES de que cargue la app. */
function instalarPedal() {
  window.__midiEnviado = [];
  const salida = {
    id: 'pedal-1',
    name: 'Interfaz USB-MIDI falsa',
    send: (bytes) => { window.__midiEnviado.push([...bytes]); },
  };
  navigator.requestMIDIAccess = () => Promise.resolve({
    inputs: new Map(),
    outputs: new Map([['pedal-1', salida]]),
    onstatechange: null,
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

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());

await page.addInitScript(instalarPedal);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.evaluate(seedAuth, cfg.apiKey);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-mode]', { timeout: 20000 });
await page.waitForTimeout(800);

const enviados = () => page.evaluate(() => window.__midiEnviado.slice());
const limpiarEnviados = () => page.evaluate(() => { window.__midiEnviado.length = 0; });

// ── Configurar el pedal en Utilitarios → Pedal (salida MIDI) ────────────────
await page.getByRole('button', { name: /Utilitarios|Utilities/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^(Pedal \(salida MIDI\)|Pedal \(MIDI out\))$/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^(Activar MIDI|Enable MIDI)$/ }).click();
await page.waitForTimeout(600);

check('la salida fingida aparece para elegir',
  await page.locator('#midi-out-device option').count() === 2,
  `opciones: ${await page.locator('#midi-out-device option').count()}`);

await page.selectOption('#midi-out-device', 'pedal-1');
await page.waitForTimeout(300);

// ── El probador, que es como se averigua el número real del pedal ───────────
await limpiarEnviados();
await page.locator('#midi-out-test').fill('22');
await page.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
await page.waitForTimeout(300);
check('el probador manda el Program Change exacto, sin corregir la numeración',
  JSON.stringify(await enviados()) === JSON.stringify([[0xC0, 22]]),
  JSON.stringify(await enviados()));

// El canal 1 tiene que viajar como 0 en el byte de estado, y el 16 como 15.
await page.selectOption('#midi-out-channel', '16');
await limpiarEnviados();
await page.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
await page.waitForTimeout(300);
check('el canal 16 viaja como 0xCF, no como 0xD0',
  JSON.stringify(await enviados()) === JSON.stringify([[0xCF, 22]]),
  JSON.stringify(await enviados()));
await page.selectOption('#midi-out-channel', '1');
await page.waitForTimeout(200);

// Fuera de rango no se manda: el pedal ignoraría el mensaje en silencio.
await limpiarEnviados();
await page.locator('#midi-out-test').fill('999');
await page.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
await page.waitForTimeout(300);
check('un programa fuera de rango no se manda', (await enviados()).length === 0,
  JSON.stringify(await enviados()));

// ── El envío automático al cambiar de canción ──────────────────────────────
await page.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(300);

await page.getByRole('button', { name: /^(Canciones|Songs)$/ }).first().click();
await page.waitForTimeout(600);

/** Crea una canción por la interfaz. Con la red caída, queda en la caché local. */
async function crearCancion(titulo) {
  await page.getByRole('button', { name: /^(Nueva Canción|New Song)$/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/^(Título|Title)$/i).first().fill(titulo);
  // Guardar exige título Y contenido.
  await page.locator('textarea').first().fill('[G] Letra de prueba');
  await page.getByRole('button', { name: /^(Guardar|Save)$/ }).first().click();
  await page.waitForTimeout(1200);
  // Con la red caída, `addDoc` no resuelve nunca —espera el acuse del
  // servidor— y la app queda detrás de su velo de carga a pantalla completa.
  // La escritura SÍ se aplicó en la caché local, así que recargar devuelve la
  // app usable con la canción ya en la lista. (Ver la nota del final: que ese
  // velo no se levante sin red es un problema real de la app, no de la prueba.)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode]', { timeout: 20000 });
  await page.waitForTimeout(900);
}

await crearCancion('Apertura');
await crearCancion('Invocación');
await page.waitForTimeout(600);

/**
 * Recarga: deja el pedal "en blanco" para la app.
 *
 * Hace falta para probar el guardia de repetición: `ultimoProgramaEnviado` vive
 * en memoria, y poner el preset de una canción ya dispara un envío —cambiar los
 * ajustes es una dependencia del efecto—, así que sin recargar la preparación
 * de la prueba dejaba el preset ya cargado y no había nada que observar.
 */
const recargar = async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode]', { timeout: 20000 });
  await page.waitForTimeout(900);
};

const abrir = async (titulo) => {
  await page.getByRole('button', { name: new RegExp(`^${titulo}`) }).first().click();
  await page.waitForTimeout(700);
};

const ponerPreset = async (valor) => {
  const campo = page.locator('[data-song-midi]');
  if (await campo.count() === 0) throw new Error('no se encontró el campo de preset');
  await campo.fill(valor);
  await campo.blur();
  await page.waitForTimeout(900);
};

await abrir('Apertura');
check('el campo de preset aparece con el envío automático encendido',
  await page.locator('[data-song-midi]').count() === 1);
await ponerPreset('5');

await abrir('Invocación');
await ponerPreset('9');

// Ahora sí: ir y venir entre las dos canciones tiene que armar el pedal.
await limpiarEnviados();
await abrir('Apertura');
check('abrir una canción manda su preset',
  JSON.stringify(await enviados()) === JSON.stringify([[0xC0, 5]]),
  JSON.stringify(await enviados()));

await limpiarEnviados();
await abrir('Invocación');
check('cambiar de canción manda el preset de la nueva',
  JSON.stringify(await enviados()) === JSON.stringify([[0xC0, 9]]),
  JSON.stringify(await enviados()));

// Dos canciones DISTINTAS con el mismo preset no tienen por qué provocar un
// cambio: en muchos pedales recargar el preset corta la cola del efecto.
//
// Tiene que ser con dos canciones distintas y no volviendo a la misma: tocar
// dos veces la misma no vuelve a correr el efecto —no cambió el id— así que esa
// versión de la comprobación pasaba con el guardia arrancado.
await abrir('Invocación');
await ponerPreset('5');          // el mismo que Apertura
await recargar();
await limpiarEnviados();
await abrir('Apertura');         // manda 5
await abrir('Invocación');       // mismo preset: no tiene que mandar nada
const trasRepetir = await enviados();
check('dos canciones con el mismo preset no lo mandan dos veces',
  trasRepetir.length === 1 && trasRepetir[0][1] === 5, JSON.stringify(trasRepetir));

// Una canción sin preset deja el pedal como está. "Sin preset" no es "preset 0".
await abrir('Invocación');
await ponerPreset('');           // esta canción no toca el pedal
await abrir('Apertura');
await ponerPreset('9');
await recargar();
await limpiarEnviados();
await abrir('Apertura');         // manda 9
await abrir('Invocación');       // sin preset: deja el pedal como está
const trasVaciar = await enviados();
check('una canción sin preset no toca el pedal',
  JSON.stringify(trasVaciar) === JSON.stringify([[0xC0, 9]]),
  JSON.stringify(trasVaciar));

check('sin errores de JavaScript', errs.length === 0, errs.join(' | '));

global.__yaImprimio = true;
console.log(results.join('\n'));
console.log(process.exitCode ? '\nHay comprobaciones en rojo.' : '\nMIDI de salida en verde.');
await browser.close();
server.close();
