<div align="center">
<img width="192" height="192" alt="CanindeChords" src="public/CanindeChords.png" />
</div>

# CanindeChords

[![Release & Deploy](https://github.com/GabFrank/caninde-chords/actions/workflows/deploy.yml/badge.svg)](https://github.com/GabFrank/caninde-chords/actions/workflows/deploy.yml)
[![App en vivo](https://img.shields.io/badge/app-franco--control.web.app-2563eb)](https://franco-control.web.app)

Gestor colaborativo de canciones, acordes y setlists para músicos, con
sincronización en tiempo real (Modo Director). PWA construida con React + Vite +
Firebase.

> **Plataforma propia (v2):** la app ya no depende de Google AI Studio. Se
> versiona y publica automáticamente desde GitHub a Firebase Hosting en cada
> cambio en `main`. Ver **[DEPLOY.md](DEPLOY.md)**.

## Arranque rápido

**Requisitos:** Node.js 22+

```bash
npm install
npm run dev      # http://localhost:3000
```

No hace falta configurar variables de entorno: la configuración de Firebase es
pública y vive en `firebase-applet-config.json`.

## Publicación

La app se publica automáticamente en **Firebase Hosting** al hacer push a `main`
(vía GitHub Actions). La configuración completa de desarrollo y deploy está en
**[DEPLOY.md](DEPLOY.md)**.

URL pública: https://franco-control.web.app

## Documentación

- **[DEPLOY.md](DEPLOY.md)** — infraestructura, publicación, caché y base de datos.
- **[AUTH.md](AUTH.md)** — cómo funciona el acceso con Google y cómo depurarlo.
- **[AGENTS.md](AGENTS.md)** — arquitectura, reglas de negocio y workflows.
- **[TODO.md](TODO.md)** — backlog de mejoras.
