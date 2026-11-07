# CanindeChords - Project Context & Rules

Este documento sirve como base de conocimiento para el desarrollo de CanindeChords
(gestor de canciones, acordes y setlists; importa y exporta el formato OpenSong).
Captura las decisiones arquitectónicas, reglas de negocio y workflows críticos
establecidos durante las sesiones de desarrollo.

La infraestructura y la publicación están en **[DEPLOY.md](DEPLOY.md)**; el acceso
con Google, en **[AUTH.md](AUTH.md)**.

## 🚀 Workflows Principales

### 1. Modo Director (Sincronización en Real-Time)
- **Concepto:** Un director controla el setlist y los espectadores siguen su navegación.
- **Sincronización de Seguridad:** No solo sincronizamos el `currentSongIndex`, sino también el `currentSongId`. 
- **Mapeo de Canciones:** Dado que los espectadores pueden tener copias de canciones con IDs distintos, el proceso de matching es:
    1. Buscar por `song.id`.
    2. Buscar por `song.originalId` (ID de la canción compartida original).
    3. Fallback al `index` si el ID no se encuentra.
- **Descubrimiento de Sesiones:** Los espectadores buscan sesiones donde `setlistId == localId` OR `setlistId == originalId`.

### 2. Importación y Deduplicación
- **Archivos Soportados:** `.ost` (canciones) y `.osb` (backups).
- **Regla de Oro:** Siempre verificar duplicados por `title` + `artist` (case-insensitive) antes de crear.
- **Modo Overwrite:** El usuario tiene un toggle en el modal de importación para decidir si sobrescribe canciones existentes o ignora los duplicados.

### 3. Gestión de Setlists
- **Modo Reparación:** Si un setlist tiene IDs de canciones que no existen en la biblioteca local, se muestra una advertencia y un botón para "Eliminar canciones faltantes".
- **Integridad de Datos:** Al compartir, nos aseguramos de que el orden de las canciones se mantenga exacto reconstruyendo el array de datos en base al orden de `songIds`.

### 4. Soundpad (Utilitarios)
- **Concepto:** pads para disparar sonidos (naturaleza, animales, truenos)
  durante sesiones y ceremonias, con volumen, repeticiones y overlay por sonido.
- **La decisión que explica el módulo:** el audio vive en IndexedDB, en cada
  dispositivo; en Firestore (`soundPads`, `soundCategories`) va sólo la ficha.
  Cloud Storage exige plan Blaze desde feb-2026, y en el escenario el sonido
  tiene que salir sin depender de la conexión del lugar.
- **Consecuencia:** una ficha puede llegar desde otro dispositivo sin su audio.
  El pad se marca "falta el audio" y se arregla revinculando el archivo o
  importando el pack `.zip`.
- **Dos pantallas:** el tablero (`SoundpadBoard`) se dedica entero a disparar;
  crear, editar, categorías, orden, pack y MIDI viven en `SoundpadSetup`, detrás
  del botón "Preparar el Soundpad". No devuelvas configuración al tablero: a
  390×844 la grilla pasó de 6 pads enteros a 9, y un toque desviado en medio de
  una ceremonia caía en un menú.
- **Toda pantalla del Soundpad que no sea el tablero lleva la `PanicStrip`**
  arriba y pegajosa: PARAR TODO, las voces activas y la vuelta al tablero. El
  aparato es un teléfono: no hay tecla Escape, y el MIDI queda inerte mientras
  se prepara. Si agregás una pantalla al módulo, ponele la franja.
- **MIDI no existe en iPhone ni iPad**: todos los navegadores de iOS usan WebKit
  y la Web MIDI API no está. `isMidiSupported()` lo detecta y la interfaz lo
  dice; no prometas MIDI en esos aparatos.

- **Antes de tocar este módulo, leé [docs/SOUNDPAD.md](docs/SOUNDPAD.md).** Están
  ahí los dieciocho gotchas que costaron un fallo real cada uno: por qué toda clave
  recién escrita va protegida de `pruneOrphans`, por qué `subscribe()` entrega el
  estado actual, por qué las repeticiones son una sola fuente en bucle, por qué
  el disparo táctil se retira, y por qué nada puede empujar la grilla.

### 5. Pedal de efectos por MIDI (salida)
- **Concepto:** cada canción guarda un número de Program Change y abrirla deja
  el pedal armado con ese preset. Funciona también en Modo Director.
- **Dónde vive cada cosa:** el preset, en `UserSongSettings` (es de tu equipo, no
  de la canción: compartirla no le impone tu numeración a nadie). El dispositivo
  y el canal, en `localStorage`: el id de una salida MIDI vale sólo en esa
  máquina.
- **La app no corrige la numeración del fabricante.** Las tablas suelen estar
  corridas en uno; hay un probador en Utilitarios para averiguarlo contra el
  aparato. No agregues tablas de equivalencias por modelo.
- **Antes de tocarlo, leé [docs/MIDI-PEDAL.md](docs/MIDI-PEDAL.md):** el canal
  viaja corrido en uno, "sin preset" no es "preset 0", y el acceso MIDI hay que
  recuperarlo al arrancar o el envío queda apagado en silencio.

## 🛠 Reglas Técnicas Obligatorias

### 1. Firebase & Error Handling
- **Firestore:** Usar siempre `handleFirestoreError(error, OperationType, path)` para lanzar errores. Esto permite al sistema diagnosticar fallos de reglas de seguridad.
- **NUNCA esperes a secas una escritura de Firestore.** La promesa de `addDoc`,
  `updateDoc` y `setDoc` no resuelve al escribir: resuelve cuando el servidor
  acusa. Sin red no resuelve nunca, y esperarla trababa la app detrás de un velo
  a pantalla completa. Usá `esperarEscritura` de `src/lib/escrituraOffline.ts`,
  que espera con un plazo y distingue confirmado / pendiente / fallo. Ver
  [docs/OFFLINE.md](docs/OFFLINE.md).
- **Identidad:** Siempre usar `user.uid` para filtrar y asignar `ownerId`.
- **OriginalId:** Al aceptar un share o importar, guardar siempre el ID original en el campo `originalId` para mantener la trazabilidad.

### 2. Acceso y PWA
- **Rutas `/__/`:** `navigateFallbackDenylist` en `vite.config.ts` DEBE excluir
  `/^\/__\//`. Si el service worker atiende `/__/auth/iframe` o
  `/__/auth/handler` con el `index.html` de la app, el acceso se cuelga sin
  emitir ningún error. Ver [AUTH.md](AUTH.md).
- **Errores de acceso:** nunca tragarse un fallo de acceso en un `console.error`.
  Traducirlo con `describeAuthError()` y mostrarlo en pantalla con su código.
- **Promesas que no resuelven:** el estado de acceso tiene un vigilante de 12 s.
  Un `try/finally` no protege contra una promesa colgada.
- **Popup vs redirección:** en la PWA instalada el acceso va siempre por
  `signInWithRedirect`; el popup no puede devolver el resultado.

### 3. Estilo y UI
- **Frameworks:** React + Tailwind CSS + Lucide Icons + Framer Motion.
- **Animaciones:** Usar `motion/react` para transiciones de estados y modales.
- **Traducciones:** Todo texto visible debe estar en `src/translations.ts` (Soporte actual: `en`, `es`).
- **Colores dinámicos:** Tailwind 4 sólo compila las clases que ve escritas. Una
  clase armada por concatenación en tiempo de ejecución no existe en el CSS final.
  Guardar la clave del color (`'amber'`) y resolverla contra un mapa con las
  clases escritas enteras, como hace `src/lib/soundpadStyles.ts`.

### 4. Tipado (TypeScript)
- Las interfaces están en `src/types.ts`.
- **Enums:** Usar `enum` estándar, no `const enum`.
- **Imports:** Usar imports nombrados, evitar desestructuración en el import mismo si es posible.

## ⚠️ Gotchas & Problemas Conocidos

- **Sesiones Fantasmas:** Si un director cierra la pestaña sin detener la sesión, esta queda marcada como `active: true` en Firestore por un tiempo. (Implementar heartbeat en el futuro).
- **Mismatch de Setlists:** Si un espectador añade o quita una canción de su copia local del setlist, los índices ya no coincidirán. Por eso la búsqueda por `currentSongId` es la prioridad #1.
- **Permisos de Iframe:** Varias APIs de JS (como `alert` o `window.open`) pueden fallar dentro del iframe de previsualización. Preferir modales internos de la app.

## 🧪 Verificación

- `npm run lint` — `tsc --noEmit`.
- `npm test` — vitest sobre lógica pura (motor del soundpad, pack, viewport).
- `npm run build && npm run smoke` — prueba de humo de interfaz en cuatro viewports.
- `npm run build && npm run soundpad` — prueba funcional del Soundpad en un
  navegador real, con la red caída a propósito: disparo, overlay vs exclusivo,
  pánico, persistencia en IndexedDB e ida y vuelta del pack `.zip`. Detalle en
  [docs/SOUNDPAD.md](docs/SOUNDPAD.md).
- `npm run build && npm run offline` — la app entera con la red caída: que
  guardar una canción o un setlist no trabe nada y sobreviva a recargar. Detalle
  en [docs/OFFLINE.md](docs/OFFLINE.md).
- `npm run build && npm run midiout` — pedal de efectos fingido en un navegador
  real: bytes del Program Change, corrimiento del canal, y los guardias de
  repetición y de "sin preset". Detalle en [docs/MIDI-PEDAL.md](docs/MIDI-PEDAL.md).
- **El `npm run build` de esas cuatro líneas no es adorno:** las pruebas de
  navegador sirven `dist/`. Sin compilar, miden el build anterior y dan verde
  sobre código que no está. `e2e/distFresco.mjs` corta la prueba si `dist/` quedó
  atrás.

## 📋 TODO Prioritario
Ver archivo `TODO.md` para el backlog detallado de mejoras de Director Mode y estabilidad.
