# Acceso (Google Sign-In) — cómo funciona y cómo depurarlo

Documenta el acceso tal como está implementado hoy. Si tocás `src/App.tsx`,
`src/components/AuthProvider.tsx` o la config PWA de `vite.config.ts`, leé
primero la sección **Invariante del service worker**: romperla deja el acceso
colgado sin ningún mensaje de error.

## Las piezas

| Pieza | Valor | Dónde se define |
| --- | --- | --- |
| Proyecto Firebase | `franco-control` | `.firebaserc`, `firebase-applet-config.json` |
| `authDomain` | `franco-control.firebaseapp.com` | `firebase-applet-config.json` |
| Orígenes de la app | `franco-control.web.app` y `franco-control.firebaseapp.com` | Firebase Hosting sirve el mismo sitio en ambos |
| Proveedor | Google, único método de acceso | `src/firebase.ts` |
| Scopes | `openid` + `userinfo.email` | los pide Firebase; no son sensibles y no requieren verificación de Google |
| Cliente OAuth | `354392857215-1k826r35…` | Google Cloud Console → Credentials |
| Base de identidades | Firebase Auth **con Identity Platform** | el proyecto fue migrado a Identity Platform |

> **El cliente OAuth es compartido.** Otras apps del mismo proyecto de Google
> Cloud (por ejemplo `ritual-caninde.web.app`) usan el mismo cliente y la misma
> pantalla de consentimiento. Un cambio ahí afecta a CanindeChords aunque nadie
> haya tocado este repositorio.

## El flujo

`handleLogin(viaRedirect)` en `src/App.tsx` decide el método:

1. **PWA instalada** (`display-mode: standalone`, detectado por `isStandalonePWA()`
   en `src/lib/utils.ts`) → va directo por `signInWithRedirect`. En una PWA
   instalada la ventana emergente no tiene forma de devolverle el resultado a la
   ventana que la abrió.
2. **Navegador normal** → `signInWithPopup`.
3. Si el popup falla porque **nunca llegó a abrirse** (`auth/popup-blocked`,
   `auth/operation-not-supported-in-this-environment`,
   `auth/web-storage-unsupported`) → reintenta solo con redirección.
4. Cualquier otro fallo → muestra el error en pantalla con su código, y ofrece el
   botón «Probar con redirección».

La pantalla de acceso siempre tiene además el enlace «¿No funciona? Entrar con
redirección», que fuerza el método 1 sin depender de que se detecte un error.

Al volver de una redirección, `getRedirectResult()` en `AuthProvider` recoge la
credencial o el error. `src/lib/loginAttempt.ts` deja anotado en `localStorage`
qué método se usó y cómo terminó: la redirección recarga la página, así que sin
ese registro no queda rastro de lo ocurrido.

## Después de entrar

`AuthProvider` escucha `onAuthStateChanged` y carga (o crea) el perfil en
`users/{uid}`. Dos garantías que conviene no perder:

- La carga del perfil está en `try/catch/finally`. Si Firestore falla, la app
  entra igual **sin** perfil en vez de quedarse en la pantalla de carga.
- Hay un **vigilante de 12 s**: si el estado de acceso no quedó resuelto, la app
  sale de la pantalla de carga y reporta `app/auth-timeout` (no hay sesión) o
  `app/profile-timeout` (hay sesión pero no cargó el perfil). Un `finally` no
  alcanza: no protege contra una promesa que nunca se resuelve, que es
  exactamente lo que pasa cuando el intercambio con el `authDomain` se rompe.

## Invariante del service worker

**Las rutas `/__/` de Firebase nunca deben pasar por el service worker.**

`vite.config.ts`:

```js
navigateFallbackDenylist: [/^\/version\.json$/, /^\/__\//],
```

La PWA registra una `NavigationRoute` que responde **toda** navegación con
`index.html`. Firebase Auth carga `/__/auth/iframe` y `/__/auth/handler` como
navegaciones: sin esa exclusión el service worker las atiende con la app, el
iframe de Firebase termina conteniendo CanindeChords en vez del ayudante de
Google, y `getRedirectResult()` **se cuelga sin resolver ni fallar**.

El síntoma es engañoso: el acceso vuelve a la pantalla de login sin ningún
error, y todo lo demás (dominios autorizados, cliente OAuth, cookies, red)
sale sano en cualquier revisión. Fue la causa de una caída real del acceso.

Verificación rápida — debe responder `fireauth`, no `id="root"`:

```bash
curl -s https://franco-control.web.app/__/auth/iframe | grep -o 'fireauth\|id="root"'
```

## Diagnóstico desde el dispositivo

La pantalla de acceso tiene un botón **«Ejecutar diagnóstico»**
(`src/components/AuthDiagnostics.tsx`) que corre los chequeos en el propio
teléfono y permite copiar el resultado. Existe porque el acceso falla sobre todo
en móviles, donde no hay consola del navegador.

Chequea: origen contra `authDomain`, sesión actual, cuánto tardó Firebase en
resolver el acceso, redirección pendiente, último intento y su resultado,
alcance de `identitytoolkit` (con la misma llamada que usa el acceso real),
carga del iframe del `authDomain`, **si el service worker secuestra ese iframe**,
cookies, `localStorage`, `sessionStorage`, `indexedDB` y user agent.

> El chequeo de secuestro monta un `<iframe>` real. Un `fetch()` no sirve: no es
> una navegación, así que esquiva justo la regla que causa el problema.

## Códigos de error

| Código | Significado | Dónde se arregla |
| --- | --- | --- |
| `app/auth-timeout` | El acceso no se resolvió en 12 s | Casi siempre el service worker secuestrando `/__/`; si no, el intercambio con el `authDomain` |
| `app/profile-timeout` | Hay sesión, pero Firestore no respondió | Reglas de Firestore o conexión |
| `app/redirect-empty` | Volviste de Google sin credencial ni error | Google cortó de su lado: pantalla de consentimiento o política del proyecto |
| `auth/popup-blocked`, `auth/popup-closed-by-user` | El popup no pudo completar | Se resuelve con la redirección (automática o manual) |
| `auth/unauthorized-domain` | Falta el dominio | Firebase → Authentication → Settings → Authorized domains |
| `auth/operation-not-allowed` | Proveedor Google deshabilitado | Firebase → Authentication → Sign-in method |
| `auth/admin-restricted-operation` | El proyecto rechaza crear la sesión | Identity Platform → Configuración → Usuarios (creación de usuarios) |
| `auth/internal-error` | Rechazo de Google o del proyecto | Pantalla de consentimiento o blocking functions |

Los textos en español/inglés de cada código están en `src/lib/authErrors.ts`.

## Dónde vive cada cosa en las consolas

| Qué | Dónde |
| --- | --- |
| Dominios autorizados | `console.firebase.google.com/project/franco-control/authentication/settings` |
| Proveedor Google | `console.firebase.google.com/project/franco-control/authentication/providers` |
| Blocking functions | Identity Platform → Configuración → Gatilhos (requiere Cloud Functions API) |
| Cliente OAuth y redirect URIs | `console.cloud.google.com/apis/credentials?project=franco-control` |
| Pantalla de consentimiento | `console.cloud.google.com/auth/overview?project=franco-control` |

Los *Authorized domains* de Firebase aceptan **dominios pelados**
(`franco-control.web.app`). Los *Authorized redirect URIs* del cliente OAuth
aceptan **URLs completas** (`https://…/__/auth/handler`). Son pantallas
distintas en consolas distintas; es fácil confundirlas.

## Comprobaciones sin abrir la consola

La configuración de acceso es legible con la API key pública:

```bash
KEY=$(node -p "require('./firebase-applet-config.json').apiKey")

# Dominios autorizados del proyecto
curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=$KEY"

# ¿Está habilitado Google? Devuelve el authUri real (client_id, redirect_uri,
# scopes). Si estuviera deshabilitado: OPERATION_NOT_ALLOWED.
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d '{"providerId":"google.com","continueUri":"https://franco-control.firebaseapp.com/__/auth/handler"}'
```

Abrir en el navegador el `authUri` que devuelve la segunda llamada prueba el
lado de Google aislado de la app: si aparece el selector de cuentas, el cliente
OAuth, el redirect URI y la pantalla de consentimiento están bien, y el problema
está del lado de la app.

## Cambiar el `authDomain` al mismo origen

Poner `authDomain: "franco-control.web.app"` haría el acceso *same-origin* y lo
volvería inmune al bloqueo de cookies de terceros. **Requiere registrar antes**
`https://franco-control.web.app/__/auth/handler` en los *Authorized redirect
URIs* del cliente OAuth. Hoy no está registrado: hacer el cambio sin ese paso
rompe el acceso con `redirect_uri_mismatch`. Verificalo así antes de tocar nada:

```bash
curl -sL "https://accounts.google.com/o/oauth2/auth?response_type=id_token\
&client_id=354392857215-1k826r35ab4hhokspv2l1kn591mc5nr7.apps.googleusercontent.com\
&redirect_uri=https%3A%2F%2Ffranco-control.web.app%2F__%2Fauth%2Fhandler\
&scope=openid%20email&nonce=probe123456&state=probe" | grep -o 'redirect_uri_mismatch'
```

Sin salida = ya está registrado y el cambio es seguro.
