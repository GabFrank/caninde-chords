# Director Mode Edge Cases & Improvements

## 0. Próximo: Soundpad

Acordado con el usuario, en este orden:

- [x] **Reordenar pads.** Resuelto con un modo "Organizar" aparte, no con un
  gesto sobre el tablero: arrastrar un pad ya significa "retirá el sonido". Ver
  gotcha 10 de [docs/SOUNDPAD.md](docs/SOUNDPAD.md).
- [ ] **Atajos de teclado y MIDI.** Disparar pads con las teclas 1-9, un pedal
  Bluetooth o un controlador MIDI (Web MIDI API), sin tocar la pantalla. La base
  ya está: los pads responden a Enter y Espacio.

Más adelante, sin fecha:

- [ ] **Disparo remoto en Modo Director:** que el director dispare un pad y suene
  en los dispositivos conectados. La infraestructura de sesiones ya existe; falta
  resolver que los espectadores tengan los mismos audios (pack `.zip`) y la
  latencia entre dispositivos.
- [ ] **Tope de voces por pad:** hoy un pad de overlay tocado veinte veces
  acumula veinte copias sonando.

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
