# Soundpad

Pads para disparar sonidos —naturaleza, animales, truenos, impactos— durante
sesiones, conciertos y ceremonias. Vive en **Utilitarios → Soundpad**, junto al
Afinador.

Por cada sonido se configura: **volumen**, **cantidad de repeticiones** (o bucle
indefinido), si es **overlay** (se superpone a lo que suene) o **exclusivo**
(corta todo antes de sonar), y el **fundido** con que se apaga. Se organizan por
**categorías** y por **favoritos**.

---

## La decisión que explica todo lo demás

**El audio vive en el dispositivo; la ficha, en la nube.**

| | Dónde | Se sincroniza |
| --- | --- | --- |
| El archivo de audio | IndexedDB, base `caninde-sounds` | ❌ por dispositivo |
| La ficha (nombre, categoría, volumen, repeticiones, overlay, favorito) | Firestore, `soundPads` y `soundCategories` | ✅ por usuario |

Dos razones:

1. **Cloud Storage para Firebase exige el plan de pago Blaze** desde febrero de
   2026. Guardar los MP3 ahí obligaba a cambiar el plan del proyecto.
2. **En el escenario, el sonido tiene que salir sin depender de la conexión del
   lugar.** Guardado en el dispositivo, el disparo no toca la red nunca.

De esa decisión se desprenden casi todos los detalles del módulo, incluidos los
gotchas de más abajo. La consecuencia visible es que **una ficha puede llegar
desde otro dispositivo sin su audio**: el pad se marca "falta el audio" y se
arregla revinculando el archivo o importando el pack `.zip`.

---

## Los archivos

| Archivo | Qué hace |
| --- | --- |
| `src/services/audioContext.ts` | Un único `AudioContext` para toda la app, compartido con el Afinador |
| `src/services/soundLibrary.ts` | IndexedDB: guardar, leer, borrar y medir los audios |
| `src/services/soundpadEngine.ts` | Reproducción: disparo, overlay/exclusivo, repeticiones, fundidos, voces activas |
| `src/services/soundpadPack.ts` | Export e import de la biblioteca como un `.zip` |
| `src/lib/soundpadStyles.ts` | Paleta e íconos de los pads |
| `src/components/SoundPad/useSoundpad.ts` | Estado: Firestore + IndexedDB + motor |
| `src/components/SoundPad/SoundpadBoard.tsx` | El tablero |
| `src/components/SoundPad/SoundPadButton.tsx` | El pad |
| `src/components/SoundPad/SoundPadEditor.tsx` | Alta y edición |
| `src/components/SoundPad/CategoryManager.tsx` | ABM de categorías |
| `src/components/SoundPad/PadArranger.tsx` | Modo organizar: reordenar los pads |
| `src/lib/padOrder.ts` | Reparto de los valores de `order` al reordenar |

Las interfaces `SoundPad` y `SoundCategory` están en `src/types.ts`; las reglas
de acceso, en `firestore.rules`.

---

## Gotchas

Cada uno de estos costó un fallo real. Están acá para que no se reintroduzcan.

### 1. `pruneOrphans` puede borrar un audio recién guardado

El blob se escribe **antes** de que exista su ficha en Firestore, así que durante
esa ventana el archivo no lo referencia ningún pad y parece huérfano. Si en ese
instante llega un snapshot —un pad creado en otro dispositivo, por ejemplo— el
archivo que el usuario acaba de elegir se borra.

**Regla:** toda clave escrita en la sesión va en `ownKeys` (`useSoundpad.ts`) y
se le pasa a `pruneOrphans` como protegida. Si agregás un camino nuevo que
escriba audio, tiene que registrar su clave ahí.

### 2. El motor sobrevive al desmontaje del tablero

`soundpadEngine` es un singleton de módulo: cambiar a la pestaña del Afinador
desmonta el tablero pero **no para el audio** (deliberado: el operador puede
querer irse a la letra de la canción con el ambiente sonando).

**Regla:** `subscribe()` entrega el estado actual al suscribirse, no sólo los
cambios posteriores. Sin eso, al volver la interfaz se suscribía en cero y un
bucle quedaba sonando sin ningún control: ningún pad marcado, pánico
deshabilitado, y sólo se salía recargando la página.

### 3. Las repeticiones son una sola fuente en bucle

`repeat: N` se implementa con **un** `AudioBufferSourceNode` en bucle y el
`stop()` programado en `duración × N`. Nunca encadenar una fuente por pasada: el
error de cada `start()` se acumula y a la quinta repetición ya se oye el hueco.

### 4. Un pad exclusivo corta con fundido, nunca en seco

El corte abrupto produce un chasquido perfectamente audible en un equipo de sala.
El fundido es el del **pad que se apaga**, no el del que lo corta: si la lluvia
se configuró para apagarse en tres segundos, se apaga en tres segundos la corte
quien la corte. El pánico también lo respeta.

### 5. El disparo táctil se retira si el gesto era un desplazamiento

El pad dispara en `pointerdown` para no tener latencia. El precio es que un
arrastre por la grilla empieza igual que un toque, y disparaba un trueno cada vez
que el operador buscaba un sonido. Por eso el disparo se **retira** en cuanto el
gesto se revela como arrastre (más de 10 px, o `pointercancel`).

**Regla:** el `touch-action` del pad debe ser `pan-y`. Con `none` la grilla no se
desplaza; con `manipulation` el navegador no emite `pointercancel` y no hay forma
de saber que era un arrastre.

*Residuo conocido:* entre el disparo y el retiro pasan unos milisegundos, así que
un sonido retirado puede alcanzar a emitir un chasquido brevísimo. Es el precio
de la latencia cero; la alternativa sería disparar al soltar.

### 6. Nada puede empujar la grilla

La franja "Sonando" ocupa un alto fijo aunque no haya nada sonando, y los avisos
van **debajo** del tablero. Insertarlos arriba desplazaba la grilla 70 px con
pads de 88 px: el operador apuntaba a la segunda fila y, para cuando bajaba el
dedo, ese punto ya era la primera.

### 7. Las escrituras a Firestore no se esperan

Con persistencia offline, el SDK aplica el cambio a la caché local al instante y
`onSnapshot` ya lo emite, pero la promesa sólo resuelve cuando confirma el
servidor. Esperarla dejaba el formulario colgado justo donde más molesta:
cargando sonidos en el lugar de la ceremonia, con mala conexión.

**Regla:** las escrituras van sin `await`, con un `.catch` que pase por
`handleFirestoreError` (obligatorio según AGENTS.md) **y** ponga el fallo en
pantalla. Ese ayudante (`reportFirestore` en `useSoundpad.ts`) atrapa la
excepción que `handleFirestoreError` lanza: dejarla escapar dentro de un callback
del SDK dejaba el tablero cargando para siempre ante un `permission-denied`.

### 8. Tailwind 4 sólo compila las clases que ve escritas

Una clase armada por concatenación en tiempo de ejecución no existe en el CSS
final: el pad se vería transparente. Por eso en Firestore se guarda la **clave**
del color (`'amber'`) y se resuelve contra el mapa de `soundpadStyles.ts`, que
las tiene escritas enteras.

### 9. El manifiesto del pack es entrada no confiable

El `.zip` lo trae el usuario. Sus campos se sanean uno por uno
(`sanitizePackPad`) antes de escribirlos: sin eso, un `volume` que viniera como
texto hacía que las reglas rechazaran la creación y el usuario sólo veía un
"importado" que no importó nada.

### 10. Reordenar es un modo aparte, no un gesto sobre el tablero

Arrastrar un pad ya significa "esto era un desplazamiento, retirá el sonido"
(gotcha 5). Reordenar con ese mismo gesto sería ambiguo, y en plena ceremonia
mover un pad sin querer es peor que no poder moverlo.

Por eso hay un botón **Organizar** que cambia a una lista donde los pads no
suenan (`PadArranger.tsx`), con asa de arrastre y botones ↑/↓ — el patrón que ya
usa `SetlistEditor`, porque en táctil y con teclado las flechas son lo único
fiable. El conjunto se congela mientras se organiza: los filtros se ocultan.

Al guardar se reparten **sólo los valores de `order` que esos pads ya ocupaban**
(`reassignOrder` en `src/lib/padOrder.ts`), no una renumeración de 0 a n. Así,
acomodar los sonidos de una categoría no mueve a los de las demás, que es lo que
uno espera cuando filtró antes de ordenar.

### 11. iOS suspende el audio con la pantalla bloqueada

En PWA instalada, iOS suspende el `AudioContext` al bloquear la pantalla o pasar
a segundo plano. Mitigación: Screen Wake Lock mientras el tablero está abierto, y
`unlock()` al volver al frente. **El wake lock hay que volver a pedirlo**: el
navegador lo suelta solo, y sin escuchar su evento `release` la referencia queda
apuntando a un centinela muerto y la pantalla se apaga sola a partir de ahí.

---

## Verificación

```bash
npm run lint                    # tsc --noEmit
npm test                        # vitest: motor, biblioteca y pack
npm run build && npm run smoke  # interfaz en cuatro viewports
npm run build && npm run soundpad
```

`npm run soundpad` es la prueba funcional en un navegador real, **con la red
caída a propósito**: disparo, overlay vs exclusivo, pánico, persistencia en
IndexedDB, ida y vuelta del pack, y las regresiones de las auditorías
(desplazarse no dispara, la grilla no se mueve, el teclado funciona, el bucle
sigue bajo control al volver de otra pestaña) y el modo organizar, incluido que
el orden nuevo sobreviva a recargar la página.

Las pruebas del motor están escritas para fallar si el código se rompe: se
verificó saboteando el overlay, las repeticiones, la deduplicación de
decodificaciones y la entrega inicial de `subscribe`.

---

## Publicar

El Soundpad necesita las reglas de `soundPads` y `soundCategories` publicadas, o
todo da `permission-denied`.

El workflow de despliegue las publica solo en cada push a `main`
(`.github/workflows/deploy.yml`, paso *Deploy Firestore rules*), **pero ese paso
es `continue-on-error: true`**: si la cuenta de servicio pierde permisos, el
workflow queda en verde y las reglas se quedan viejas sin avisar.

Después de desplegar:

1. Confirmá en los logs de Actions que el paso *Deploy Firestore rules* corrió
   sin error. Si falló, publicalas a mano:
   `npx firebase-tools deploy --only firestore:rules --project franco-control`
2. Abrí Utilitarios → Soundpad con tu cuenta y cargá un sonido de prueba. Si
   aparece un error de Firestore en pantalla, las reglas no están publicadas.
3. Comprobá que suena, que el pánico lo corta, y que tras recargar la página el
   sonido sigue ahí (eso confirma IndexedDB).

Si algo da `permission-denied`, el mensaje en pantalla trae el diagnóstico
completo de `handleFirestoreError`: identidad, operación y ruta.
