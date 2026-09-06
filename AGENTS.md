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
- **Concepto:** pads para disparar sonidos (naturaleza, animales, truenos) durante
  sesiones y ceremonias.
- **El audio vive en el dispositivo, la ficha en la nube.** Los archivos van a
  IndexedDB (`src/services/soundLibrary.ts`, base `caninde-sounds`); en Firestore
  (`soundPads`, `soundCategories`) va sólo el catálogo. La razón: Cloud Storage
  exige plan Blaze desde feb-2026, y en el escenario el sonido tiene que salir sin
  depender de la conexión del lugar.
- **Consecuencia:** una ficha puede llegar desde otro dispositivo sin su audio. El
  pad se marca "falta el audio" y se arregla revinculando el archivo o importando
  el pack `.zip` (`src/services/soundpadPack.ts`), que conserva los `fileKey` para
  que el pad se complete en vez de duplicarse.
- **Motor propio.** `soundpadEngine.ts` no pasa por `audioEngine.ts`: la cadena
  del afinador colorea la señal para sonar a guitarra y eso destrozaría un trueno.
  Comparten el `AudioContext` de `audioContext.ts`.
- **Repeticiones:** una sola fuente en bucle con el `stop()` programado al final.
  Nunca encadenar un `AudioBufferSourceNode` por pasada: el error de cada
  `start()` se acumula y se oye el hueco.
- **Overlay vs exclusivo:** un pad exclusivo apaga lo anterior con un fundido
  corto, nunca de golpe (el corte en seco chasquea en un equipo de sala).
- **Escrituras optimistas:** las llamadas a Firestore del Soundpad NO se esperan.
  Con persistencia offline el cambio se aplica a la caché local al instante, pero
  la promesa sólo resuelve cuando confirma el servidor; esperarla cuelga la
  interfaz justo en el lugar de la ceremonia, con mala conexión.

## 🛠 Reglas Técnicas Obligatorias

### 1. Firebase & Error Handling
- **Firestore:** Usar siempre `handleFirestoreError(error, OperationType, path)` para lanzar errores. Esto permite al sistema diagnosticar fallos de reglas de seguridad.
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
  pánico, persistencia en IndexedDB e ida y vuelta del pack `.zip`.

## 📋 TODO Prioritario
Ver archivo `TODO.md` para el backlog detallado de mejoras de Director Mode y estabilidad.
