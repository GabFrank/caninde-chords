# Guía de Desarrollo y Publicación (CanindeChords)

Este proyecto se creó en Google AI Studio y ahora se desarrolla desde GitHub.
Esta guía explica cómo seguir programando y cómo publicar la app.

## 1. Desarrollo local

**Requisitos:** Node.js 22+

```bash
npm install                 # instala dependencias
# Edita .env.local y pon tu GEMINI_API_KEY real
npm run dev                 # arranca en http://localhost:3000
npm run lint                # comprueba tipos de TypeScript
npm run build               # genera la versión de producción en /dist
```

> `.env.local` está en `.gitignore`, así que tu clave **nunca** se sube a GitHub.

## 2. Publicación (Deploy)

La app se publica **automáticamente en Firebase Hosting** cada vez que haces
`push` (o merge) a la rama `main`, mediante GitHub Actions
(`.github/workflows/deploy.yml`). Es el equivalente al "Deploy" que hacía AI Studio.

URL pública (tras el primer deploy):
- https://franco-control.web.app
- https://franco-control.firebaseapp.com

### Configuración única en GitHub (¡importante, hazlo una vez!)

Para que el deploy automático funcione, hay que añadir **2 secrets** en GitHub:
`Settings → Secrets and variables → Actions → New repository secret`.

| Secret | Qué es | Cómo obtenerlo |
| --- | --- | --- |
| `GEMINI_API_KEY` | Tu clave de Gemini | https://aistudio.google.com/apikey |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de una cuenta de servicio de Firebase con permiso de deploy | Ver pasos abajo |

#### Cómo generar `FIREBASE_SERVICE_ACCOUNT`

Opción A (recomendada, automática):
```bash
npm install -g firebase-tools
firebase login
firebase init hosting:github   # genera el service account y lo guarda como secret por ti
```

Opción B (manual): en la consola de Google Cloud del proyecto `franco-control`:
1. `IAM y administración → Cuentas de servicio → Crear cuenta de servicio`.
2. Asignar el rol **Firebase Hosting Admin** (y **Cloud Datastore User** si vas a desplegar reglas).
3. Crear una clave JSON y pegar **todo el contenido del JSON** como valor del secret `FIREBASE_SERVICE_ACCOUNT`.

Una vez configurados los secrets, cada push a `main` publicará la app sola.

### Deploy manual (opcional, sin esperar a GitHub Actions)

```bash
npm run build
firebase deploy --only hosting
```

## 3. Reglas de la base de datos (Firestore)

Las reglas de seguridad están en `firestore.rules` y apuntan a la base de datos
`ai-studio-441c4547-dc9f-4785-aed8-fdbd3879497c` del proyecto `franco-control`.

Para publicar cambios en las reglas:
```bash
firebase deploy --only firestore:rules
```

## 4. Flujo de trabajo recomendado

1. Programas en una rama (p. ej. `claude/...` o `feature/...`).
2. Haces commit y push.
3. Abres un Pull Request hacia `main` y lo revisas.
4. Al hacer merge a `main`, GitHub Actions compila y publica automáticamente.

> ⚠️ Nota de seguridad: la `GEMINI_API_KEY` se incrusta en el bundle del cliente
> (igual que ya hacía la app en AI Studio), por lo que es visible para quien
> inspeccione el sitio. Restringe la clave en Google AI Studio (por dominio/uso)
> o muévela a un backend si necesitas ocultarla.
