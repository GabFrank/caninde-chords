# Pedal de efectos por MIDI

La app le manda **Program Change** a un pedal de efectos para que cada canción
cargue su preset: seleccionás la canción y el pedal queda armado, sin tocarlo.

El caso que lo motivó es un **Hologram Microcosm**. Funciona con cualquier
aparato que responda a Program Change.

---

## Cómo se conecta

El Microcosm tiene **MIDI IN y MIDI OUT/THRU en DIN de 5 pines**. Su puerto USB
es sólo para firmware: **no es un dispositivo USB MIDI**, así que siempre hace
falta una **interfaz USB-MIDI** en el medio. Cualquiera *class-compliant* sirve;
no lleva driver, la ve el sistema operativo y el navegador la ve a través suyo.

```
  App (Chrome)  --USB-->  interfaz USB-MIDI  --DIN 5 pines-->  MIDI IN del pedal
```

En Android va igual, con un adaptador USB-OTG. Un controlador **Bluetooth MIDI**
emparejado a nivel de sistema operativo también aparece como salida.

### Dónde funciona y dónde no

| | Salida MIDI |
| --- | --- |
| Chrome / Edge en Windows, macOS, Linux | sí |
| Firefox 108+ en escritorio | sí |
| Chrome en Android | sí |
| **iPhone / iPad, cualquier navegador** | **no** |

Lo de iOS no tiene vuelta: todos los navegadores de iPhone y iPad están
obligados a usar WebKit, que no implementa la Web MIDI API (bug 107250).
Instalar Chrome o Firefox ahí no cambia nada, y la PWA instalada tampoco gana
privilegios de USB: corre en el mismo motor. `isMidiSupported()` lo detecta y la
interfaz lo dice en vez de ofrecer un botón que no va a funcionar.

---

## Cómo se usa

1. **Utilitarios → Pedal (salida MIDI)**: activar MIDI, elegir la interfaz, el
   canal (el Microcosm viene en el 1) y encender "Mandar al cambiar de canción".
2. **Averiguar el número de preset** con el probador de esa misma pantalla.
   Ver abajo por qué este paso no se puede saltear.
3. Abrir una canción y escribir ese número en el campo **Preset del pedal**, que
   aparece en la barra de ajustes junto a la transposición.

Desde ahí, abrir la canción manda el Program Change. En **Modo Director** el
espectador también lo recibe: el director pasa de canción y el pedal de cada uno
se arma solo.

---

## Las decisiones

### El preset vive en tus ajustes, no en la canción

Va en `UserSongSettings` —al lado de la transposición y el tamaño de letra— y no
en `Song`. El preset es de **tu** equipo: si le compartís la canción a otro
músico, tu número 7 no significa nada en su pedal, o directamente no tiene
pedal. Se sincroniza entre tus dispositivos y no viaja al compartir.

### El dispositivo y el canal viven en el equipo, no en la nube

En `localStorage` (`src/lib/midiOutputPrefs.ts`). El id de una salida MIDI se lo
inventa el navegador y vale sólo en esa máquina: sincronizarlo haría que el
teléfono le mandara a la interfaz que está enchufada a la notebook.

### La app NO corrige la numeración del fabricante

El estándar define los programas de 0 a 127, pero muchos manuales los imprimen
empezando en 1. En el Microcosm hay reportes de usuarios de que **el número del
manual aparece corrido en uno**: hay que mandar 22 para cargar lo que la tabla
llama 23.

La app no adivina ni compensa. Guarda y manda el número tal cual, y trae un
probador para que lo averigües **una vez, de pie frente al pedal**. Una tabla de
equivalencias por modelo sería una fuente permanente de errores silenciosos, y
el error se descubre en el peor momento posible.

---

## Gotchas

### 1. El canal viaja corrido en uno

El canal va en la mitad baja del byte de estado, así que el **canal 1 de la vida
real viaja como 0**: `[0xC0, programa]`, no `[0xC1, programa]`. Es el error
clásico de MIDI y se ve como "el pedal no responde" sin ningún mensaje.

Por eso el canal se maneja **siempre** como lo ve el músico (1 a 16) y la
conversión ocurre en un solo lugar, `programChangeBytes`. Hay pruebas que
recorren los dieciséis canales y verifican que el nibble alto siga siendo `0xC`.

### 2. "Sin preset" no es "preset 0"

Una canción sin preset **deja el pedal como está**. Querer un sonido concreto es
una decisión que se toma eligiendo un preset, no omitiéndolo: si la ausencia
mandara 0, cada canción sin configurar le pisaría el sonido al que venía.

Vaciar el campo **borra la clave** con `deleteField()`. Escribir `undefined` no
sirve: Firestore lo rechaza **lanzando de forma síncrona**, así que ni siquiera
un `await` lo atrapa.

### 3. Dos canciones seguidas con el mismo preset no lo recargan

`shouldSendProgram` no manda si el preset es el que ya está cargado. En muchos
pedales recargar un preset **corta la cola del efecto**, y no hay razón para que
eso pase sólo porque cambió el título en la pantalla.

Cuidado al probar esto: volver a tocar la MISMA canción no vuelve a correr el
efecto —no cambió el id—, así que esa versión de la comprobación pasa con el
guardia arrancado. Hay que usar **dos canciones distintas con el mismo preset**,
y partir de un estado limpio, porque poner el preset ya dispara un envío.

### 4. El acceso MIDI hay que recuperarlo al arrancar

`midiService` es un singleton de módulo. Después de recargar la página —o de que
el sistema operativo descarte la PWA y la vuelva a abrir— nadie había vuelto a
pedir el acceso, y el envío automático quedaba apagado **en silencio**: el pedal
dejaba de seguir a las canciones sin ningún aviso. En una ceremonia eso se ve
como "la app se rompió".

`App.tsx` lo vuelve a pedir al montar, pero **sólo** si el usuario ya eligió un
pedal y encendió el envío. No aparece ningún diálogo: el navegador recuerda el
permiso para el origen.

### 5. Un acceso MIDI sin `outputs` no puede matar la entrada

`outputs()` tolera un acceso sin la lista. Sin esa guarda, `[...undefined.values()]`
tiraba **dentro** de `enable()`, su `catch` se lo tragaba y el permiso quedaba
sin conceder: moría también el disparo de pads por MIDI, que no tiene nada que
ver. Lo descubrió la prueba del Soundpad, cuyo controlador fingido no traía
`outputs`.

---

## Verificación

```bash
npm test                          # 21 pruebas del núcleo: bytes, rangos, guardias
npm run build && npm run midiout  # pedal fingido en un navegador real
```

`e2e/midiout.mjs` reemplaza `navigator.requestMIDIAccess` por un acceso cuya
salida **anota cada mensaje**. Corre el servicio de verdad; lo único simulado es
el cable. Comprueba los bytes exactos, el corrimiento del canal, que un programa
fuera de rango no salga, y los guardias de repetición y de "sin preset".

Las comprobaciones se verificaron por mutación, con el build de por medio y
confirmando la marca en el bundle servido (gotcha 18 de
[SOUNDPAD.md](SOUNDPAD.md)). Una nota honesta sobre eso: romper **sólo**
`shouldSendProgram` no hace caer la comprobación de "sin preset", porque el
servicio valida el rango por su cuenta y el mensaje no sale igual. Son dos capas
independientes, y la comprobación mira el **comportamiento**, no una capa. Con
la regresión realista —quitar el guardia y mandar `programa ?? 0`— las dos
comprobaciones caen, y se ve exactamente el daño: `[[192,9],[192,0]]`.
