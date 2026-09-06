# Director Mode Edge Cases & Improvements

## 0. Próximo: Soundpad

Acordado con el usuario, en este orden:

- [x] **Reordenar pads.** Resuelto con un modo "Organizar" aparte, no con un
  gesto sobre el tablero: arrastrar un pad ya significa "retirá el sonido". Ver
  gotcha 10 de [docs/SOUNDPAD.md](docs/SOUNDPAD.md).
- [x] **Atajos de teclado y MIDI.** Teclas 1-9/0 por posición, Escape para el
  pánico, y nota MIDI por pad con "Aprender". Ver gotcha 11 de
  [docs/SOUNDPAD.md](docs/SOUNDPAD.md).

Más adelante, sin fecha:

- [ ] **Disparo remoto en Modo Director:** que el director dispare un pad y suene
  en los dispositivos conectados. La infraestructura de sesiones ya existe; falta
  resolver que los espectadores tengan los mismos audios (pack `.zip`) y la
  latencia entre dispositivos.
- [ ] **Tope de voces por pad:** hoy un pad de overlay tocado veinte veces
  acumula veinte copias sonando.

### Pendientes conocidos de las auditorías (ninguno bloquea)

Salieron de dos rondas de auditoría y se decidió no corregirlos por ahora.

- [ ] **Reordenar a la vez desde dos dispositivos** puede dejar dos pads con el
  mismo `order`. No se pierde ni se duplica ningún pad, pero el desempate pasa a
  ser alfabético. `reassignOrder` ya separa los empates dentro de un mismo
  dispositivo (`src/lib/padOrder.ts`); lo que falta es resolver la concurrencia
  entre dispositivos, probablemente con una transacción.
- [ ] **`estimateUsage` lee todos los blobs** para sumar tamaños
  (`soundLibrary.ts`), y se dispara en cada cambio del catálogo. Con una
  biblioteca grande es trabajo de más; `pad.fileSize` ya está en la ficha y
  alcanzaría para estimarlo.
- [ ] **Que el recorte acorta el audio lo garantizan las pruebas unitarias, no la
  de navegador.** Medirlo desde fuera por el tiempo que el pad figura como
  sonando resultó inestable. Se verificó una vez instrumentando el motor dentro
  del navegador (0,502 s contra 1,010 s), pero no quedó una comprobación
  automática de extremo a extremo.
- [ ] **Duplicación en `soundpadPack.ts`:** `num` y `optNum` difieren en una sola
  rama, y la justificación de `zipPayload` sobre el consumo de memoria no está
  medida. Además su rama del `Blob` —la única que corre en el navegador— no se
  ejercita en las pruebas, porque vitest corre en Node.
- [ ] **La colección `compositions` quedó huérfana** al retirar el Yggdrasil
  Armónico y el Manual de Conexiones: las reglas ya no la contemplan, pero los
  documentos siguen en Firestore. Hay que decidir si se borran.

## 0. Future Work: Offline Mode
- [ ] **Modo Director Offline:** Implementar sincronización P2P utilizando WebRTC para permitir que el director controle a los espectadores en redes locales sin necesidad de internet.
- [ ] **Heartbeat Robusto:** Mejorar la detección de sesiones activas manejando diferencias de reloj entre dispositivos (lenient skew).

## 1. Stale Sessions (Ghost Sessions) [SOLVED]
- **Problem:** Directors closing tabs or losing connection without stopping the session.
- **Solution:** Implemented a heartbeat system (`updatedAt` timestamp) and filter out inactive sessions (older than 2 mins) in the UI.

## 2. Setlist Structural Changes [SOLVED]
- **Problem:** Adding/removing songs during an active session causes index mismatch.
- **Solution:** Synchronized `currentSongId` and implemented multi-strategy matching (ID -> OriginalId -> Index).

## 3. Multiple Directors Conflict [SOLVED]
- **Problem:** Multiple users starting sessions for the same setlist.
- **Solution:** Added a warning in `DirectorModeDialog` if other sessions are already active.

## 4. Device Sleep / Backgrounding [SOLVED]
- **Problem:** Mobile devices suspending JS execution when screen off or app in background.
- **Solution:** Active "Wake Lock" for Directors in `SetlistViewer`.

## 5. Permission Gaps [SOLVED]
- **Problem:** Spectators following a director to a song they don't have access to.
- **Solution:** Sharing a setlist creates local copies of all songs (with `originalId` tracking), ensuring availability.

## 6. Network Latency & Race Conditions [SOLVED]
- **Problem:** Rapid song changes causing out-of-order updates or sync lag.
- **Solution:** Debounced Firestore updates for song changes to 200ms and increased heartbeat frequency to 15s for better real-time discovery.

## 8. Robust Matching for Copies [SOLVED]
- **Problem:** Mismatching local copies when the director is not the original owner.
- **Solution:** Enhanced spectator matching logic to check cross-references between local IDs and Original IDs on both director and spectator sides.

## 7. Setlist Copy/Import ID Mismatch [SOLVED]
- **Problem:** Users accepting a share get a copy with a new ID, so they don't see sessions from the original setlist.
- **Solution:** Tracking `originalId` during shares/imports. Spectators now query by both current and original IDs.
