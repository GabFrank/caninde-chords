# Guardar sin red

El lugar de la ceremonia no suele tener conexión, y es justo donde alguien
necesita corregir la letra de un tema. La app tiene que seguir siendo usable.

---

## El fallo que motivó esto

Con la red caída, guardar una canción **trababa la app para siempre**: quedaba
un velo *"SAVING…"* a pantalla completa que bloqueaba todo, y la única salida
era recargar. Verificado: seguía ahí a los 30 segundos.

Lo irónico es que **el guardado había funcionado**. Firestore, con persistencia
offline, aplica la escritura en la caché local al instante, la muestra en la
lista y la sincroniza sola cuando vuelve la conexión.

La causa es un detalle fácil de pasar por alto:

> La promesa de `addDoc`, `updateDoc` y `setDoc` **no resuelve al escribir**.
> Resuelve cuando el **servidor acusa** la escritura. Sin red, no resuelve nunca.

El código la esperaba para cerrar el editor y apagar el velo, así que lo único
roto era la espera.

---

## La solución: `esperarEscritura`

`src/lib/escrituraOffline.ts` espera el acuse **con un plazo** (1,5 s) y
devuelve uno de tres estados:

| Estado | Qué pasó | Qué hace la app |
| --- | --- | --- |
| `confirmado` | El servidor la acusó a tiempo | Cierra y avisa "guardado" |
| `pendiente` | Aplicada localmente, sin acuse todavía | **Cierra igual** y avisa "guardado en este dispositivo" |
| `fallo` | Rechazada (reglas, validación) | **No cierra**, muestra el error |

Con `pendiente` se cierra el editor a propósito: el documento ya está en la
caché local y en la lista. Dejar al usuario mirando un formulario abierto
sugeriría que no se guardó, que es exactamente lo contrario de lo que pasó.

Es el mismo razonamiento que ya usaba el Soundpad (gotcha 7 de
[SOUNDPAD.md](SOUNDPAD.md)), con una diferencia: allá las escrituras
directamente no se esperan. Acá sí, pero con plazo, para poder distinguir
"confirmado" de "pendiente" y decirle la verdad al usuario.

Se aplica en `saveSong`, `saveSetlist` y `handleSettingsChange`.

---

## Gotchas

### 1. El error hay que manejarlo también DESPUÉS del plazo

`esperarEscritura` engancha el manejador de fallos a la promesa **original**, no
a la carrera. Si no, una escritura que el servidor rechaza media hora más tarde
—por una regla de seguridad— sería un `unhandledrejection` mudo, y el usuario
seguiría creyendo que su cambio está guardado.

### 2. `handleFirestoreError` lanza a propósito

Es su diseño: arma un diagnóstico completo (identidad, operación, ruta) y lo
tira como excepción. Así que todo lo que lo llame desde un manejador de errores
tiene que envolverlo en su propio `try`, o el rechazo se escapa por otro lado.
`esperarEscritura` protege contra eso aunque el llamador se olvide.

### 3. "Pendiente" no es "falló"

El aviso dice *"Guardado en este dispositivo — se sincroniza al volver la
conexión"*, no un error. Decirle al usuario que algo falló cuando en realidad se
guardó lo lleva a reescribirlo, y a perder tiempo en el peor momento.

### 4. Lo que sigue esperando al servidor, y por qué

Compartir, aceptar un enlace compartido e importar siguen esperando: **no
pueden** funcionar sin red, así que un plazo sólo cambiaría un mensaje por otro.
Si en el futuro se les pone un plazo, el aviso tiene que decir "no hay conexión",
no "guardado".

---

## Verificación

```bash
npm test                          # 6 pruebas del núcleo, con una promesa que nunca resuelve
npm run build && npm run offline  # la app entera sin red, en un navegador real
```

`e2e/offline.mjs` bloquea todo lo que no venga del servidor local —Firestore
queda inalcanzable a propósito— y comprueba lo que de verdad importa: que el
velo se levante, que el editor se cierre, que el aviso diga la verdad, que la
canción esté en la lista, y que **siga ahí con su corrección después de
recargar**, que es lo que demuestra que la escritura local se aplicó.

Verificado por mutación: quitando el plazo, la comprobación falla con *"seguía
puesto a los 10 s"*, que es exactamente el fallo original.

Una advertencia de escribir esa prueba: una versión intermedia daba "tardó 2 ms"
porque el botón de Guardar estaba deshabilitado y nunca se llegó a guardar. Un
velo que nunca se puso también "se levanta". Si el tiempo medido es casi cero,
la comprobación no está mirando nada.
