# Plan de adaptación responsive

Plan de ejecución derivado de la auditoría de la v2.14.1. Cinco fases, cada una
un commit desplegable por separado, ordenadas de menor a mayor riesgo.

Problema de fondo: la app decide su layout con un único umbral de **ancho**
(`isMobile = innerWidth < 768`), tiene la escala tipográfica congelada en 297
tamaños fijos, y no contempla la orientación en ninguna parte.

## Principios

1. **Una sola fuente de verdad para el layout.** Hoy conviven una bandera de JS
   (`isMobile`) y clases CSS (`md:`) decidiendo lo mismo. Van a discrepar en
   cuanto el criterio deje de ser sólo el ancho. La estructura la decide JS; el
   CSS se ocupa del estilo dentro de cada modo.
2. **Alto y ancho, no sólo ancho.** Un teléfono acostado es ancho y bajo. Una
   tablet vertical es angosta y alta. El ancho solo no distingue esos casos.
3. **No tocar 297 lugares.** La tipografía se arregla definiendo la escala una
   vez y aplicándola en las superficies que el usuario realmente mira.
4. **Cada fase se despliega sola.** Nada de una rama larga: `fix:`/`feat:` por
   fase, verificado en producción antes de seguir.

---

## Fase 1 — Unidades de viewport `[E]`

Acotada y de bajo riesgo. Sirve de calentamiento y arregla modales cortados.

| Archivo | Cambio |
| --- | --- |
| `src/App.tsx:35` | `max-h-[90vh]` → `max-h-[90dvh]` en el contenedor de `Modal` |
| `src/components/HarmonyComposer.tsx:954` | ídem |
| `src/index.css:24` | `:fullscreen .h-full { height: 100vh !important }` → acotar a un selector propio y usar `100dvh` |

En pantalla completa, en vez del `!important` global, se marca el contenedor con
una clase explícita (`.fullscreen-fill`) y se le aplica `height: 100dvh`.

**Verificación:** abrir un modal en teléfono horizontal; el pie del modal debe
quedar dentro del área visible.

---

## Fase 2 — El layout decide por ancho y alto `[A]`

El corazón del plan. Resuelve D1 (teléfono horizontal con layout de escritorio),
D2 (iPad mini con dos interfaces distintas) y parte de D9.

### 2.1 Nuevo hook `src/lib/useViewport.ts`

Reemplaza los dos `useState` sueltos de `App.tsx:297-298` y su listener.

```ts
export type LayoutMode = 'compact' | 'regular';

export interface Viewport {
  width: number;
  height: number;
  mode: LayoutMode;   // 'compact' = un panel + barra inferior
  isLandscape: boolean;
  isShort: boolean;   // alto insuficiente para apilar cabecera + contenido
  isTablet: boolean;  // capa intermedia, para tipografía y densidad
}
```

Reglas:

```
isShort   = height < 560
mode      = (width >= 700 && !isShort) ? 'regular' : 'compact'
isTablet  = mode === 'regular' && width < 1180
```

Por qué esos números:

- **700px** en lugar de 768 para que un iPad mini (744×1133) sea `regular` en
  vertical y en horizontal: hoy cambia de interfaz al girarlo.
- **560px de alto** saca de `regular` al teléfono acostado (844×**390**) y a
  cualquier ventana baja, que es lo que hoy está roto.
- **1180px** separa tablet de escritorio para la fase 5. No cambia estructura,
  sólo densidad.

El listener escucha `resize` **y** `orientationchange`, con `requestAnimationFrame`
para no recalcular en cada píxel del arrastre.

### 2.2 Sustituir `isMobile` por `mode`

`isMobile` aparece en `App.tsx:1441, 1561, 1565, 1566, 1834`. Todas pasan a
`mode === 'compact'`.

### 2.3 Alinear el CSS con el JS

Los `md:` que deciden **estructura** dejan de decidir y pasan a depender de
`mode`, para que CSS y JS no puedan discrepar:

| Línea | Hoy | Pasa a |
| --- | --- | --- |
| 1566 | `hidden md:flex` (sidebar) | condicional por `mode` |
| 1587, 1885, 1927 | `md:hidden` (botones de volver) | `mode === 'compact'` |
| 1834 | `hidden md:flex` (panel de contenido) | condicional por `mode` |
| 1880-1881 | `md:flex-row`, `md:w-auto` (toolbar) | condicional por `mode` |
| 2106, 2125 | `md:flex`, `md:hidden` (barra inferior) | `mode === 'compact'` |

Los `md:` **cosméticos** (`md:mx-4`, `md:pr-2`, `md:pb-4`, `md:p-6`, `md:p-1`,
`md:text-base`, `md:grid-cols-2`, `md:rounded-3xl`) se dejan como están.

### 2.4 Modo compacto horizontal

Con `mode === 'compact'` y `isLandscape`, el alto es el recurso escaso:

- Cabecera con menos padding vertical (`py-1` en vez de `p-2`).
- Barra inferior más baja: iconos de 20px y sin etiqueta de texto.
- El visor de canciones aprovecha el ancho con dos columnas cuando el alto
  aprieta.

**Verificación:** teléfono en vertical y en horizontal, tablet en las dos
orientaciones, y arrastrar el borde de la ventana en escritorio cruzando los dos
umbrales sin que quede un estado intermedio roto.

---

## Fase 3 — Piso táctil de 44px `[C]`

44px es el mínimo de Apple; 48 el de Material. Se toma **44px** (`h-11`).

### 3.1 La cabecera no entra: hay que agrupar

Hoy son cinco botones de ~30px pegados. A 44px cada uno serían 220px más el
avatar y la marca: no entra en 390px. En `mode === 'compact'`:

- Quedan visibles **el avatar** y **un botón de menú** (44px).
- El menú abre una hoja inferior con Actualizar, Tema, Preferencias y Salir,
  cada fila de 48px de alto.
- En `regular` se mantienen los botones sueltos, subidos a 44px.

Es el único cambio del plan que altera una interfaz que hoy funciona en tablet,
y por eso queda acotado al modo compacto.

### 3.2 Resto de controles

| Elemento | Hoy | Objetivo |
| --- | --- | --- |
| Fila de canción/setlist (`App.tsx:1741+`) | `p-2`, ~45px | `min-h-[3.25rem]`, padding 12px |
| Pestañas (`1705-1725`) | `py-1.5`, ~26px | `min-h-11` |
| Buscador (`1731`) | `py-1.5`, ~30px | `min-h-11` |
| Toolbar del visor (`1885-1925`) | `p-1.5` + 16px | `min-h-11 min-w-11`, icono 20px |
| Controles de sesión (`1490-1515`) | `p-1` + 13px | `min-h-11 min-w-11`, icono 18px |

Regla general: `min-h-11 min-w-11 inline-flex items-center justify-center`. La
zona sensible crece sin que el icono se agrande.

**Verificación:** ningún control interactivo por debajo de 44×44 en modo
compacto.

---

## Fase 4 — Escala tipográfica que responde `[B]`

Resuelve la queja directa: «las listas son muy pequeñas», que también pasa en
tablet porque los tamaños son fijos.

### 4.1 Definir la escala una vez

En `src/index.css`, utilidades con `clamp()` que crecen con el viewport:

```css
@layer utilities {
  .t-title  { font-size: clamp(0.9375rem, 0.86rem + 0.38vw, 1.125rem); }
  .t-meta   { font-size: clamp(0.8125rem, 0.78rem + 0.2vw,  0.9375rem); }
  .t-ui     { font-size: clamp(0.875rem,  0.83rem + 0.22vw, 1rem); }
  .t-ui-sm  { font-size: clamp(0.75rem,   0.72rem + 0.16vw, 0.8125rem); }
}
```

Los límites inferiores están por encima de los valores actuales: hoy el título
de una canción es 12px y el mínimo nuevo es 15px.

### 4.2 Aplicarla donde se ve

No se tocan los 297 usos. Se cambian las superficies de navegación, que son las
que el usuario mira todo el tiempo:

| Lugar | Hoy | Pasa a |
| --- | --- | --- |
| Título de canción/setlist en la lista | `text-xs` (12px) | `t-title` (15→18px) |
| Artista / nº de canciones | `text-[10px]` | `t-meta` (13→15px) |
| Pestañas | `text-xs` | `t-ui` |
| Buscador | `text-sm` | `t-ui` |
| Etiquetas de la barra inferior | `text-[10px]` | `t-ui-sm` |
| Cabecera de setlist en la lista | `text-xs` | `t-ui` |

El resto (`text-[9px]` de badges, monoespaciados de diagnóstico) se deja: son
etiquetas accesorias, no contenido.

**Verificación:** comparar la lista en teléfono y en tablet; el título debe
crecer con la pantalla.

---

## Fase 5 — Capa de tablet y ancho de la lista `[D]`

### 5.1 Topes en píxeles para la lista

`App.tsx:1565` usa `width: {sidebarWidth}%` sin mínimo ni máximo: 169px en un
teléfono acostado y 512px en un monitor de 2560px.

```
width: clamp(15rem, {sidebarWidth}%, 26rem)   // 240px … 416px
```

Además hay que unificar el valor por defecto, hoy inconsistente: `useState(20)`
en la línea 295 contra un `?? 30` en el deslizador de la línea 2527.

### 5.2 Densidad de tablet

Con `isTablet`, subir el padding de las filas y el tamaño de los iconos de la
toolbar. No cambia la estructura, sólo aprovecha el espacio.

### 5.3 Componentes sin ninguna adaptación

Por orden de importancia en escenario:

1. **`SetlistViewer`** (689 líneas, Modo Director). Los controles de navegación
   ya son de 56px; falta que el bloque flotante no tape el contenido cuando el
   alto aprieta, y que el modal de compartir sesión (`p-8`) entre en horizontal.
2. **`GuitarTuner`** (352 líneas). `p-6` con `space-y-8` y sin breakpoints: en
   390px de alto los controles se salen. Layout en dos columnas cuando
   `isLandscape && isShort`.
3. **`HarmonyComposer`**. Fichas de acorde fijas en 64×58px: pasarlas a un
   tamaño que responda al modo.
4. **`DirectorModeDialog`**, **`UtilitariosHub`**: revisión de padding.

---

## Qué queda fuera

- Rediseñar el Modo Director. Funciona y es el mejor adaptado a tablet.
- Tocar `HarmonyManual`: es el componente mejor adaptado del proyecto y sirve de
  referencia.
- Los 297 tamaños fijos completos. Se atacan las superficies de navegación; el
  resto queda para cuando haya una tablet a mano para verificar.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `App.tsx` tiene 2.734 líneas y concentra casi todo el layout | Una fase por commit, `npm run lint && npm test && npm run build` antes de cada push |
| Los umbrales (700/560/1180) salen del código y de dimensiones de referencia, no de una tablet real | Quedan en un único archivo (`useViewport.ts`) para ajustarlos en un solo lugar |
| El menú agrupado de la cabecera cambia una interfaz que hoy funciona | Sólo se aplica en modo compacto; en `regular` no cambia nada |
| Subir la tipografía hace que entren menos filas en pantalla | Es intencional: el reclamo es legibilidad, no densidad |
