# Plan de adaptación responsive

Plan de ejecución derivado de la auditoría de la v2.14.1, **revisado tras dos
auditorías independientes** (técnica y de cobertura UX). Todo lo que sigue está
verificado contra el código.

Problema de fondo: la app decide su layout con un único umbral de **ancho**
(`isMobile = innerWidth < 768`), tiene la escala tipográfica congelada en 297
tamaños fijos, y no contempla la orientación en ninguna parte.

## Qué cambió respecto de la primera versión

Las revisiones encontraron tres defectos que habrían roto producción, una
incompatibilidad de sintaxis y varios flujos sin cubrir:

1. **La fórmula del modo era incorrecta.** `isShort` vetaba el ancho sin tope, así
   que una ventana de escritorio de 1600×520 habría caído en layout de teléfono.
2. **`showMobileSidebar` no estaba en el plan.** Al rotar el teléfono con un
   setlist abierto, el usuario habría quedado en la lista y **perdido la canción
   de pantalla** — justo el caso que la fase decía arreglar.
3. **El teclado virtual cruza el umbral de alto** y habría cambiado el layout
   mientras se escribe. Las dos auditorías lo marcaron por separado.
4. **`@layer utilities` no genera variantes en Tailwind v4.** La sintaxis correcta
   es `@utility`. Verificado: no hay `tailwind.config.js` ni `postcss.config.js`.
5. **El control más usado del producto no estaba en el plan**: los botones de
   pasar canción son de 24px y viven en un contenedor `h-8 overflow-hidden`, así
   que la regla `min-h-11` no les hace nada.

## Principios

1. **Una sola fuente de verdad para el layout.** Hoy conviven una bandera de JS
   y clases CSS decidiendo lo mismo. La estructura la decide JS; el CSS se ocupa
   del estilo dentro de cada modo. `--breakpoint-md` se redefine para que el CSS
   cosmético comparta umbral con el JS por construcción.
2. **Alto y ancho, pero el alto no manda solo.** Un teléfono acostado es ancho y
   bajo; una ventana de escritorio baja sigue siendo escritorio.
3. **El estado de layout nunca toca estado de negocio.** Ni `columns`, ni
   `fontSize` persistido, ni marcar canciones como modificadas.
4. **Cada fase se despliega sola**, con `npm run lint && npm test && npm run build`
   antes de cada push.

---

## Fase 0 — Red de seguridad

Sin esto, ninguna fase posterior es verificable ni segura. `npm test` corre
vitest en `environment: 'node'` con `include: ['src/**/*.test.ts']`, y el único
test existente es el motor de armonía: **ningún cambio de UI tiene cobertura**.

### 0.1 Función pura + tests

`src/lib/useViewport.ts` exporta la decisión como función pura y el hook solo la
envuelve:

```ts
export function resolveLayout(width: number, height: number): Viewport
```

`src/lib/useViewport.test.ts` cae dentro del glob existente y corre sin tocar la
config. Casos obligatorios: 390×844, 844×390, 744×1133, 1133×744, 1024×600,
**1600×520** (ventana de escritorio baja) y **1024×340** (tablet con teclado
abierto). Es lo único que impide que los umbrales se rompan en silencio.

### 0.2 El `ResizeObserver` ensucia la canción

`src/App.tsx:2045-2048` — `onFontSizeChange` llama `setHasPendingSongChanges(true)`,
y quien lo dispara es el `ResizeObserver` de `src/components/SongViewer.tsx:104-116`.
**Hoy, redimensionar la ventana marca la canción como modificada** y enciende el
botón Guardar sin que el usuario toque nada. Las fases 2, 4 y 5 cambian tamaños
constantemente, así que multiplicarían el síntoma y parecería culpa de ellas.

Hay que distinguir el cambio iniciado por el usuario del inducido por layout:
`handleFit` pasa un flag de origen y solo el primero marca cambios pendientes.

### 0.3 Medición rota del auto-ajuste

`src/components/SongViewer.tsx:68` busca `container.querySelector('.mb-8')`, pero
el header real es `mb-1` (línea 166). **No existe ningún `.mb-8` en ese subárbol**:
`headerHeight` siempre vale 0 y el alto disponible se calcula de más. Reemplazar
por un `ref`.

---

## Fase 1 — Unidades de viewport, recortes y áreas seguras

Acotada y de bajo riesgo, pero más amplia de lo que decía la v1.

### 1.1 Modales sin tope ni scroll

El barrido completo de alturas de viewport:

| Archivo:línea | Estado | Acción |
| --- | --- | --- |
| `src/App.tsx:35` | `max-h-[90vh]` | → `90dvh` |
| `src/components/HarmonyComposer.tsx:954` | `max-h-[90vh]` | → `90dvh` |
| `src/components/SetlistEditor.tsx:164` | `max-h-[80vh]` | → `80dvh` |
| `src/components/DirectorModeDialog.tsx:159` | **sin tope + `overflow-hidden`** | `max-h-[90dvh]` + `overflow-y-auto` |
| `src/components/SetlistViewer.tsx:629` | **sin tope + `overflow-hidden`** | ídem |

Los dos últimos son los peores casos, no los mejores. `DirectorModeDialog` suma
~700px de contenido sin `max-height` **y con `overflow-hidden`**: en un teléfono
apaisado el excedente no se recorta con scroll, se recorta y punto. El botón
«Ser Director» queda fuera de alcance, y es la puerta de entrada al Modo
Director. El diagnóstico de la v1 («el padding no entra») era correcto en el
síntoma y equivocado en la causa.

### 1.2 Áreas seguras laterales

`index.html:5` declara `viewport-fit=cover`, pero `src/index.css` define **cero**
utilidades con `env(safe-area-inset-left/right)`. En iPhone apaisado el sistema
reserva ~44px de un lado: el header es `justify-between`, así que el logo queda
bajo el notch de un lado y **el botón de Salir del otro**. Es literalmente la
queja del usuario sobre el header, y es una utilidad de CSS.

Aplicar `.safe-area-x` al header, a la barra inferior y al bloque flotante de
`SetlistViewer`.

### 1.3 Pantalla completa

- Mantener el gate en `:fullscreen` (`:fullscreen .fullscreen-fill { height: 100dvh }`),
  **no** atarlo a `isFullScreen` de React: en iPhone `requestFullscreen` no existe
  en `documentElement`, el `if` de `src/App.tsx:244` no entra, no lanza error, y
  `setIsFullScreen(true)` se ejecuta igual (`:266`). Atar el CSS al estado de React
  aplicaría `100dvh` en un contexto que no es fullscreen real.
- La regla actual alcanza a ~10 elementos con `.h-full`. Enumerar cuáles reciben
  la clase nueva; los internos de un flex necesitan `flex-1 min-h-0`, no altura
  forzada, o los últimos 40px de letra quedan cortados bajo el toolbar.
- Añadir el fallback `webkitRequestFullscreen` y corregir el estado cuando la API
  no existe.

### 1.4 Limpieza

`custom-scrollbar` se usa en `src/App.tsx:1680`, `:2254` y
`DirectorModeDialog.tsx:301`, y **no está definida en ninguna parte**. Definirla o
quitar los tres usos.

---

## Fase 2 — El layout decide por ancho y alto

El corazón del plan, y la fase de mayor riesgo.

### 2.1 La fórmula, corregida

```
isShort = height < 560            // con histéresis: sale a > 600
mode    = (width < 700 || (isShort && width < 1100)) ? 'compact' : 'regular'
isTablet = mode === 'regular' && width < 1180
```

El veto por alto queda acotado por ancho. Sin ese `width < 1100`, una ventana de
escritorio de 1600×520 —o DevTools acoplado abajo— caería en layout de teléfono:
una regresión pura que hoy no existe.

Umbrales: **700px** para que un iPad mini (744×1133) sea `regular` en las dos
orientaciones y deje de cambiar de interfaz al girarlo. **560px de alto** para
sacar al teléfono acostado (844×390). **1180px** separa tablet de escritorio.

> Los tres números salen del código y de dimensiones de referencia, no de una
> tablet física. Viven en un solo archivo, con tests, para poder ajustarlos.

### 2.2 El teclado virtual no debe cambiar el layout

En Android el teclado reduce `innerHeight` y dispara `resize`. Sin esto, un iPad
apaisado (1133×744) editando una canción pasaría a ~394px de alto, cruzaría el
umbral y **el layout cambiaría mientras el músico escribe**: desaparece el
sidebar, aparece la barra inferior, y con la Fase 3 también colapsa la cabecera.

Tres defensas, en capas:

1. `interactive-widget=overlays-content` en el meta viewport de `index.html:5`.
2. **Congelar el modo mientras haya un editable enfocado** (`INPUT`, `TEXTAREA`,
   `isContentEditable`). Es la defensa que funciona en iOS y Firefox, que ignoran
   lo anterior.
3. Usar `window.visualViewport` solo para *detectar* el teclado
   (`layoutHeight - visualHeight > 150`) y descartar ese resize, nunca para
   calcular el modo.

### 2.3 Migrar `showMobileSidebar` — el agujero funcional

`src/App.tsx:1793` ejecuta `setShowMobileSidebar(true)` **sin condición** al
seleccionar un setlist, y `:1410` lo usa para decidir `showListOnMobile`, que en
`:1834` oculta el área de contenido.

Secuencia que rompe: teléfono 844×390 apaisado. **Hoy** `isMobile === false`, se
ve la canción. **Con la v1 del plan**, `mode === 'compact'` y `showMobileSidebar`
sigue en `true` → el contenido queda oculto → el músico rota el teléfono en
escenario y **pierde la canción de pantalla**. Es el caso que la fase decía
arreglar.

Acciones: condicionar `:1793` a `mode === 'compact'`, resetear la bandera en un
efecto sobre el cambio de `mode`, y renombrar a `showList` / `listVisible` (el
sufijo `OnMobile` deja de tener sentido).

### 2.4 Conversión de los `md:` estructurales

| Línea | Hoy | Nota |
| --- | --- | --- |
| 1566 | `hidden md:flex` (sidebar) | |
| 1587, 1885, 1927 | `md:hidden` (botones de volver) | |
| 1834 | `hidden md:flex` (contenido) | |
| 1880-1881 | `md:flex-row`, `md:w-auto` (toolbar) | |
| **1933** | `md:flex` (grupo colapsable) | **faltaba en la v1.** Convertir solo su disparador dejaría un botón de colapsar que no colapsa nada |
| **1740** | `pb-20 md:pb-4` | **no es cosmético.** `pb-20` compensa la barra inferior; sin convertirlo, en teléfono apaisado las últimas filas quedan tapadas e intocables |
| 2125 | `md:hidden` (barra inferior) | |
| 2106 | `hidden md:flex` (placeholder «nada seleccionado») | doble gate con 1834; decidir si se mantiene |

`--breakpoint-md` pasa a `43.75rem` (700px) en `@theme` para que los `md:`
cosméticos compartan umbral con el JS. Sin eso queda una franja de 68px donde el
JS dice `regular` y el CSS sigue en modo teléfono.

### 2.5 El botón de salir de pantalla completa

`src/App.tsx:2015-2021` vive **dentro** del grupo colapsable de `:1933`, y en
fullscreen el header y la barra inferior no se renderizan. Al convertir `1933` a
`mode`, en compacto + fullscreen + toolbar colapsada **el usuario queda sin
salida visible**. Sacarlo (y el indicador de Wake Lock) al bloque siempre visible.

### 2.6 Modo compacto horizontal

Cabecera con menos padding vertical; barra inferior más baja, sin etiquetas.

> **Movido a Fase 5:** «dos columnas cuando el alto aprieta». `columns` es una
> preferencia **persistida por canción**; cambiarla desde el layout marcaría la
> canción como modificada y, si el usuario guarda, escribiría en Firestore un
> valor decidido por la rotación. Si se hace, tiene que ser una columna visual en
> CSS que no toque el estado de React.

**Verificación:** con un setlist abierto, rotar el teléfono — la canción debe
seguir visible. Entrar en pantalla completa en compacto y poder salir sin
expandir la toolbar. Escribir en el buscador en tablet sin que el layout cambie.

---

## Fase 3 — Piso táctil de 44px y navegación real

### 3.1 Lo primero: pasar de canción

El control más usado del producto:

```
App.tsx:1439   pill contenedor:  h-8 (32px)  overflow-hidden  max-w-[140px]
App.tsx:1456   ChevronLeft   p-1 + size={16}  →  24×24px
App.tsx:1468   ChevronRight  p-1 + size={16}  →  24×24px
```

`min-h-11` ahí **no hace nada**: el flex-item no puede superar los 32px del
contenedor y lo que sobresalga lo recorta el `overflow-hidden`. Hay que rehacer
el pill antes de aplicar la regla.

Peor: la navegación flotante de 56px de `SetlistViewer.tsx:576-598` está detrás
de `if (isFullScreen)` — **fuera de pantalla completa no existe**. Y `onKeyDown`,
`onTouchStart` y `swipe` dan **cero ocurrencias** en toda la app. En ensayo, el
único modo de pasar de canción es ese chevron de 24px.

Acciones: sacar la navegación del pill; mostrar el bloque flotante siempre, no
solo en fullscreen; y añadir **swipe horizontal + teclas de flecha, espacio y
PageDown**. Los pedales bluetooth para músicos emiten exactamente esas teclas:
es la respuesta real a «manos ocupadas», mejor que cualquier tamaño de botón.

### 3.2 La cabecera

Cuatro botones siempre visibles (`:1526` recargar, `:1529` tema, `:1536`
preferencias, `:1550` salir) a `p-1.5` + icono 18 = **30px**. El quinto
(instalar) es `hidden sm:flex`, invisible por debajo de 640px.

A 44px: 4×44 = 176 + avatar 24 + marca ~140 ≈ 350px. Entra apretado en 390px.
**Lo que no deja lugar es la píldora de setlist** (`:1439`, `max-w-[140px]` más
márgenes).

En `mode === 'compact'`: marca reducida al logo (sin wordmark ni versión, ~110px
liberados), y ese espacio va a prev/índice/next con targets de 44px. Los cuatro
botones de configuración pasan a una hoja inferior con filas de 48px.

> **Antes de esconder el tema hay que persistirlo.** `isDarkMode` arranca en
> `true` (`:77`), hay **0 usos de `localStorage`** en `App.tsx` y ningún campo de
> tema en `UserProfile`. Un show al aire libre de día obliga a poner claro en
> cada recarga; esconderlo a dos toques sin persistirlo lo empeora.

En `regular` estrecho (iPad mini vertical, 744px) subir los cuatro a 44px con un
setlist abierto desborda la cabecera: hay que acotar también la píldora cuando
`isTablet`.

### 3.3 Controles invisibles en táctil

**Seis usos de `opacity-0 group-hover`** en tres archivos (`App.tsx` ×3,
`DirectorModeDialog.tsx` ×2, `SetlistEditor.tsx` ×1). En táctil no hay hover:
entre ellos está el botón para **detener una sesión colgada** y el «+» para
agregar canciones a un setlist. Reemplazar por visibilidad permanente o
`@media (hover: hover)`.

### 3.4 Resto de controles

| Elemento | Hoy | Objetivo |
| --- | --- | --- |
| Filas de lista (**tres copias**: `:1638`, `:1743`, `:1786`) | `p-2`, ~45px | `min-h-[3.25rem]` |
| Pestañas (`:1705-1724`) | `py-1.5`, ~26px | `min-h-11` |
| Buscadores (**dos**: `:1618`, `:1729`) | `py-1.5`, ~30px | `min-h-11` |
| Toolbar del visor (`:1885-1925`) | `p-1.5` + 16px | `min-h-11 min-w-11` |
| Controles de sesión (`:1473-1512`) | `p-1` + 13px | ídem |
| Invitaciones pendientes (`:1683-1697`) | 20px | ídem |
| Tono de referencia (`GuitarTuner.tsx:339`) | `p-1.5` + 13px = 25px | ídem |

---

## Fase 4 — Escala tipográfica

### 4.1 Sintaxis correcta para Tailwind v4

El proyecto es v4 puro. `@layer utilities { .t-title { … } }` produce CSS que
funciona pero **no genera variantes**: `md:t-title` o `dark:t-meta` fallarían en
silencio, sin error de build ni de `tsc`. La sintaxis es `@utility`.

Además, `text-xs` fija font-size **y** line-height
(`--text-xs--line-height: calc(1/0.75)`). Al sustituirlo hay que declarar
`line-height` explícito en cada utilidad, o la altura de fila cambia sola.

### 4.2 No usar `vw`

`clamp()` con `vw` mide la ventana, no el contenedor. Con la Fase 5.1 aplicada,
un monitor de 2560px daría al sidebar 416px y a la lista la fuente **máxima**,
mientras un teléfono de 390px —donde la lista ocupa el ancho completo— recibiría
la **mínima**. El panel más angosto recibiría la fuente más grande.

La escala se conmuta por `data-mode` en el root, con custom properties. Es
coherente con el principio nº1 y es testeable. (Container queries serían la otra
opción, pero `container-type` crea un bloque contenedor para `position: fixed` y
rompería `SetlistViewer.tsx:625` y `DirectorModeDialog.tsx:155`.)

### 4.3 Dónde aplicarla

Hay **tres copias** de la fila de lista (`:1638`, `:1743`, `:1786`) y **dos**
buscadores (`:1618`, `:1729`). Tocar solo el juego de `:1729/:1743` dejaría la
vista de setlist —la pantalla del escenario— con la tipografía vieja. Extraer un
`<ListRow>` antes de la fase.

Título 12px → 15/18px; artista 10px → 13/15px; pestañas, buscadores y etiquetas
de la barra inferior a la escala. Los `text-[9px]` de badges se dejan.

### 4.4 Preferencia de tamaño de UI

Quedan ~35 tamaños en px literales solo en `App.tsx`, que ignoran el tamaño de
fuente del navegador. Un multiplicador de UI (95/100/115/130%) aplicado como
`font-size` en `#root` da control real al usuario y respeta la distancia de
lectura, que es la variable física que la fórmula por ancho no captura.

---

## Fase 5 — Densidad, tablet y pantallas sin adaptar

### 5.1 Ancho de la lista

`src/App.tsx:1565` es `width: isMobile ? '100%' : '${sidebarWidth}%'`. **Hay que
conservar la bifurcación**: `mode === 'compact' ? '100%' : clamp(15rem, X%, 26rem)`.
Aplicar el `clamp` sin la rama dejaría el sidebar en 240-416px sobre un teléfono
de 390px, con el resto en blanco.

El slider está etiquetado en `%` (`:2520`): con topes en píxeles, el usuario verá
«50%» y un panel que no crece más allá de 416px. Reetiquetar o cambiar el control.

### 5.2 Densidad — la mitigación de la v1 era falsa en horizontal

Alto disponible para la lista: teléfono **vertical** ≈ 640px (14 filas hoy, 12
con el plan: tolerable). Teléfono **horizontal** ≈ 280px: **de 6 filas a 5**, con
setlists de 25 canciones. La v1 decía «es intencional, el reclamo es legibilidad
no densidad»: cierto en vertical, falso en la orientación de escenario.

Acciones: `listDensity?: 'compact' | 'comfortable'` en `UserProfile` con control
en preferencias, y lista a **dos columnas** en compacto + horizontal, que
aprovecha los 844px de ancho en vez de pelear por el alto.

> `UserProfile` ya tiene `alwaysShowSidebar` (`types.ts:56`) con etiquetas
> traducidas en `translations.ts:115` y `:263` — y **ningún uso**. Es una
> preferencia fantasma; implementarla o quitarla.

### 5.3 Pantallas que la v1 no nombraba

1. **`QRScanner`** — header `p-6` + marco fijo `w-[280px] h-[280px]` + footer
   `p-10` ≈ 548px mínimos, en 390px de alto. Escanear el QR del director es cómo
   se suma la banda a un ensayo. Marco a `min(70vmin, 280px)`, header y footer
   colapsados en horizontal, `qrbox` desde las dimensiones reales.
2. **`SongEditor`** — `min-h-[400px]` y `min-h-[500px]` en el textarea, y los tres
   diálogos (Tags, Capo, Acorde) son `absolute inset-0` **relativos al bloque de
   500px**, no al viewport: si el usuario scrolleó, el diálogo se abre fuera de
   pantalla y parece que el botón no funciona. Pasarlos a `fixed` + `max-h-[85dvh]`.
3. **`SetlistEditor`** — `space-y-8` da ~112px por fila: dos canciones y media
   visibles en horizontal. Y es un `Reorder.Group` sin autoscroll al arrastrar,
   así que mover la canción 20 a la posición 2 es imposible. Reducir el espaciado,
   y añadir botones ↑/↓ como alternativa al drag.
4. **`UtilitariosHub`** — `inline-flex` sin `flex-wrap` ni `overflow-x` con tres
   etiquetas largas ≈ 500px: **la tercera pestaña es inalcanzable** a 390px. No es
   padding, es un bug funcional.
5. **`GuitarTuner`** — ~496px mínimos contra 280-310px útiles. Dos columnas en
   horizontal.
6. **`HarmonyComposer`** — fichas de acorde fijas en 64×58px.
7. **`SetlistViewer`** — que el bloque flotante no tape el contenido con poco alto.

### 5.4 Accesibilidad

- **Una sola ocurrencia de `aria-` en todo `src/`.** Los botones de icono se
  identifican con `title=`, que en táctil no se muestra. Añadir `aria-label`.
- Sin manejo de `Escape` ni trampa de foco en `Modal` (`App.tsx:22-47`) ni en
  `DirectorModeDialog`.
- `user-select: none` global (`index.css:13`) con excepción solo para inputs:
  **no se puede copiar la letra ni los acordes**. Excluir el contenedor de
  contenido del visor.
- Contraste: `text-zinc-400` sobre blanco ≈ 2.6:1, por debajo de 4.5. Importa más
  en escenario con poca luz y ángulo oblicuo desde el atril.

---

## Qué queda fuera

- Rediseñar el Modo Director: funciona y es lo mejor adaptado a tablet.
- `HarmonyManual`: es el componente mejor adaptado del proyecto (24 `sm:`,
  14 `xl:`) y sirve de referencia.
- Los 297 tamaños fijos completos: se atacan las superficies de navegación.

## Orden y dependencias

```
Fase 0  ──> Fase 1 ──> Fase 2 ──> Fase 3 ──> Fase 4 ──> Fase 5
   │                                            ▲
   └── 0.2 (ResizeObserver) es requisito de ────┘
```

La Fase 4 sube la tipografía → cambia el alto de filas y toolbar → cambia el alto
del visor → `handleFit` recalcula → `hasPendingSongChanges`. Si se despliega antes
del arreglo 0.2, el usuario va a reportar «el botón Guardar se enciende solo» y
va a parecer culpa de la tipografía.

La Fase 3 reduce el alto útil en compacto justo cuando la Fase 2 fijó un umbral
de 560px: conviene medir el alto total del cromo en `compact` antes de dar por
bueno ese número.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `App.tsx` tiene 2.734 líneas y concentra casi todo el layout | Una fase por commit, verificación completa antes de cada push |
| Los umbrales salen del código, no de una tablet real | Un solo archivo, con tests unitarios sobre la función pura |
| El teclado virtual cruza el umbral de alto | Tres defensas en capas (2.2); ambas auditorías lo marcaron |
| Cambiar el modo dispara el `ResizeObserver` del visor | Fase 0.2 es requisito previo |
| Subir la tipografía reduce filas visibles | Intencional en vertical; en horizontal se compensa con dos columnas y `listDensity` |
| Ningún cambio tiene cobertura automática de UI | `resolveLayout` puro con tests cubre la lógica; el resto es verificación manual en dispositivo |
