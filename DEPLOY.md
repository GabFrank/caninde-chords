# Guía de Desarrollo y Publicación (CanindeChords)

Este proyecto se creó en Google AI Studio y ahora se desarrolla y publica desde
GitHub, de forma totalmente automática.

## Cómo funciona la publicación

- La rama oficial es **`main`**.
- En cada push a `main`, GitHub Actions (`.github/workflows/deploy.yml`):
  1. Ejecuta **semantic-release**: sube la versión según los commits, genera
     `CHANGELOG.md` y crea la release en GitHub.
  2. Compila la app (`npm run build`).
  3. La publica en **Firebase Hosting**.

URL pública:
- https://franco-control.web.app
- https://franco-control.firebaseapp.com

No hay que ejecutar nada manualmente ni usar un PC: basta con que haya cambios
en `main`.

## Versionado automático (semantic-release)

La versión sube sola según el **tipo** de cada commit (Conventional Commits):

| Prefijo del commit | Efecto en la versión | Ejemplo |
| --- | --- | --- |
| `fix:` | sube el último número (patch) | 1.2.3 → 1.2.**4** |
| `feat:` | sube el del medio (minor) | 1.2.3 → 1.**3**.0 |
| `feat!:` o `BREAKING CHANGE:` | sube el primero (major) | 1.2.3 → **2**.0.0 |
| `chore:`, `docs:`, `refactor:`, `style:`, `test:` | no cambia la versión (pero igual se publica) | — |

Config en `.releaserc.json`. El tag inicial es `v1.1.9`.

## Secrets necesarios en GitHub (ya configurados)

En `Settings → Secrets and variables → Actions`:

| Secret | Qué es |
| --- | --- |
| `GEMINI_API_KEY` | Clave de Gemini (https://aistudio.google.com/apikey) |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de la cuenta de servicio de Firebase con permiso de deploy |

> El `GITHUB_TOKEN` lo provee GitHub automáticamente; no hay que crearlo.

## Desarrollo local (opcional)

**Requisitos:** Node.js 22+

```bash
npm install
# Edita .env.local y pon tu GEMINI_API_KEY real
npm run dev      # http://localhost:3000
npm run lint     # comprueba tipos de TypeScript
npm run build    # genera /dist
```

`.env.local` está en `.gitignore`: la clave nunca se sube a GitHub.

## Reglas de la base de datos (Firestore)

Las reglas están en `firestore.rules` y apuntan a la base de datos
`ai-studio-441c4547-dc9f-4785-aed8-fdbd3879497c` del proyecto `franco-control`.
Para publicarlas (requiere Firebase CLI):

```bash
firebase deploy --only firestore:rules
```

> ⚠️ Nota de seguridad: la `GEMINI_API_KEY` se incrusta en el bundle del cliente
> (igual que ya hacía la app en AI Studio), por lo que es visible para quien
> inspeccione el sitio. Restringe la clave por dominio/uso en Google AI Studio.
