# OpenSong App - Project Context & Rules

Este documento sirve como base de conocimiento para el desarrollo del proyecto OpenSong. Capture las decisiones arquitectónicas, reglas de negocio y workflows críticos establecidos durante las sesiones de desarrollo.

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

## 🛠 Reglas Técnicas Obligatorias

### 1. Firebase & Error Handling
- **Firestore:** Usar siempre `handleFirestoreError(error, OperationType, path)` para lanzar errores. Esto permite al sistema diagnosticar fallos de reglas de seguridad.
- **Identidad:** Siempre usar `user.uid` para filtrar y asignar `ownerId`.
- **OriginalId:** Al aceptar un share o importar, guardar siempre el ID original en el campo `originalId` para mantener la trazabilidad.

### 2. Estilo y UI
- **Frameworks:** React + Tailwind CSS + Lucide Icons + Framer Motion.
- **Animaciones:** Usar `motion/react` para transiciones de estados y modales.
- **Traducciones:** Todo texto visible debe estar en `src/translations.ts` (Soporte actual: `en`, `es`).

### 3. Tipado (TypeScript)
- Las interfaces están en `src/types.ts`.
- **Enums:** Usar `enum` estándar, no `const enum`.
- **Imports:** Usar imports nombrados, evitar desestructuración en el import mismo si es posible.

## ⚠️ Gotchas & Problemas Conocidos

- **Sesiones Fantasmas:** Si un director cierra la pestaña sin detener la sesión, esta queda marcada como `active: true` en Firestore por un tiempo. (Implementar heartbeat en el futuro).
- **Mismatch de Setlists:** Si un espectador añade o quita una canción de su copia local del setlist, los índices ya no coincidirán. Por eso la búsqueda por `currentSongId` es la prioridad #1.
- **Permisos de Iframe:** Varias APIs de JS (como `alert` o `window.open`) pueden fallar dentro del iframe de previsualización. Preferir modales internos de la app.

## 📋 TODO Prioritario
Ver archivo `TODO.md` para el backlog detallado de mejoras de Director Mode y estabilidad.
