# Guía de Infraestructura y Publicación (CanindeChords)

La app es una PWA estática servida por Firebase Hosting. **No hay servidor
propio**: todo el backend es Firebase (Auth + Firestore). El acceso está
documentado aparte, en **[AUTH.md](AUTH.md)**.

## Panorama

```
GitHub (main) ──push──> GitHub Actions "Release & Deploy"
                          │ npm ci → npm test (vitest)
                          │ semantic-release (versión + CHANGELOG + tag + release)
                          │ npm run build (Vite)
                          ├─> Firebase Hosting (proyecto franco-control, canal live)
                          └─> firestore:rules

Navegador (PWA) ──> Firebase Auth (Google) ──> Firestore "ai-studio-441c…497c"
                └─> gleitz.github.io (SoundFont de guitarra, cacheado por el SW)
                └─> WebRTC P2P (simple-peer) con señalización en Firestore
```

URLs públicas (Hosting sirve **el mismo sitio** en las dos):
- https://franco-control.web.app — la oficial
- https://franco-control.firebaseapp.com

## Publicación

- La rama oficial es **`main`**.
- Cada push a `main` dispara `.github/workflows/deploy.yml`, que además puede
  lanzarse a mano desde Actions (`workflow_dispatch`).
- `concurrency: release-deploy` evita despliegues simultáneos.

Pasos del workflow, en orden:

| Paso | Nota |
| --- | --- |
| Checkout | `fetch-depth: 0`, semantic-release necesita historial y tags |
| Setup Node 22 | con caché de npm |
| `npm ci` | |
| `npm test` | vitest sobre el Harmony Engine; es la única compuerta de calidad |
| `npx semantic-release` | versión, `CHANGELOG.md`, tag y release de GitHub |
| `npm run build` | Vite; genera `dist/` y `version.json` |
| Deploy a Hosting | `FirebaseExtended/action-hosting-deploy`, canal `live` |
| Deploy de reglas Firestore | **`continue-on-error: true`** |

> ⚠️ El paso de reglas es tolerante a fallos: si la cuenta de servicio pierde
> permisos, el workflow queda en verde y las reglas quedan desactualizadas sin
> avisar. Si cambiás `firestore.rules`, confirmá en los logs que ese paso corrió.

No hay entorno de staging ni previews por PR: cada push a `main` va directo a
producción.

## Versionado automático (semantic-release)

La versión sube según el **tipo** de cada commit (Conventional Commits):

| Prefijo | Efecto | Ejemplo |
| --- | --- | --- |
| `fix:` | patch | 1.2.3 → 1.2.**4** |
| `feat:` | minor | 1.2.3 → 1.**3**.0 |
| `feat!:` o `BREAKING CHANGE:` | major | 1.2.3 → **2**.0.0 |
| `chore:`, `docs:`, `refactor:`, `style:`, `test:` | sin cambio de versión (igual se publica) | — |

Config en `.releaserc.json`. La versión de `package.json` se inyecta en el build
como `__APP_VERSION__` y se expone en `/version.json`, así que la app siempre
muestra el número realmente publicado. Se ve al pie de la pantalla de acceso.

```bash
curl -s https://franco-control.web.app/version.json
```

## Secrets en GitHub

`Settings → Secrets and variables → Actions`:

| Secret | Estado |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | **En uso.** Cuenta de servicio con permiso de deploy de Hosting y de reglas |
| `GEMINI_API_KEY` | **Sin uso.** Se inyecta en el build, pero ningún archivo de `src/` referencia Gemini ni `@google/genai`. Herencia de AI Studio; se puede eliminar junto con el `define` de `vite.config.ts` y la dependencia `@google/genai` |

`GITHUB_TOKEN` lo provee GitHub automáticamente.

## Caché de Hosting

Las cabeceras están en `firebase.json` y **no son cosmética**:

| Ruta | Cache-Control | Por qué |
| --- | --- | --- |
| `/` y `/index.html` | `no-cache, max-age=0, must-revalidate` | Es el archivo que apunta al bundle con hash. Si se cachea, los despliegues no llegan a los usuarios hasta que expire |
| `*.js/css/png/svg/woff2` | `public, max-age=31536000, immutable` | Llevan hash en el nombre; cachearlos para siempre es seguro |
| `/sw.js` | `no-cache` | El service worker debe poder actualizarse |
| `/version.json` | `no-store` | Debe reflejar siempre lo desplegado |

> Histórico: `index.html` se servía con `max-age=3600`, y por eso **todo** deploy
> tardaba hasta una hora en llegar a los usuarios. No reintroducir.

## PWA y service worker

`vite-plugin-pwa` en modo `generateSW` con `registerType: 'autoUpdate'`: las
versiones nuevas se aplican solas al recargar. El SW precachea la app y cachea en
runtime los samples del SoundFont de `gleitz.github.io`.

**Invariante crítico** (ver [AUTH.md](AUTH.md)): `navigateFallbackDenylist` debe
excluir `/__/`. Sin eso el service worker responde las rutas reservadas de
Firebase con el `index.html` de la app y **el acceso se cuelga sin error**.

```js
navigateFallbackDenylist: [/^\/version\.json$/, /^\/__\//],
```

## Base de datos

Firestore, base **nombrada** `ai-studio-441c4547-dc9f-4785-aed8-fdbd3879497c`
(no la `(default)`) — herencia de cuando la app vivía en AI Studio. Está
declarada en `firebase.json`, y el cliente la selecciona en `src/firebase.ts`
con `getFirestore(app, firebaseConfig.firestoreDatabaseId)`.

Colecciones: `users`, `songs`, `setlists`, `sessions` (+ subcolecciones
`participants` y `signaling`), `userSongSettings`, `shares`, `contacts`,
`compositions`. El esquema está descrito en `firebase-blueprint.json` y las
reglas en `firestore.rules`.

El cliente habilita persistencia offline con IndexedDB.

Para publicar reglas a mano (el workflow ya lo hace en cada deploy):

```bash
firebase deploy --only firestore:rules --project franco-control
```

## Un proyecto de Google Cloud, varias apps

`franco-control` es compartido por otras aplicaciones (entre ellas
`ritual-caninde.web.app`). Comparten cliente OAuth, pantalla de consentimiento y
lista de dominios autorizados. **Un aprovisionamiento hecho para otra app puede
reescribir la configuración de acceso de CanindeChords.** Si el acceso se rompe
sin que haya cambiado este repositorio, empezá por [AUTH.md](AUTH.md).

## Desarrollo local

**Requisitos:** Node.js 22+

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # tsc --noEmit
npm test         # vitest
npm run build    # genera /dist
```

`.env.local` está en `.gitignore`. Hoy la app no necesita ninguna variable de
entorno para funcionar: la configuración de Firebase es pública y vive en
`firebase-applet-config.json`.

> Para probar el acceso con Google en local hay que agregar `localhost` a los
> dominios autorizados de Firebase Authentication.
