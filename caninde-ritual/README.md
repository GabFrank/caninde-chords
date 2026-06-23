# Caniné Ritual

App de **curaduría y orquestación musical para meditaciones y ceremonias con
medicinas sagradas**. Copiloto del facilitador, no autopiloto. App **hermana** de
CanindéChords: vive en el mismo repo, comparte sus convenciones (Vite + React 19 +
TypeScript + Tailwind v4 + Firebase), pero es una app independiente con su propio
build y su propio target de Firebase Hosting.

> Estado: **Fase 0 — Fundaciones**. El núcleo `ritual-core` está implementado (modelo,
> motor de generación, puertos de reproducción y auth OAuth/PKCE), con tests. Las fases
> de UI, persistencia, runtime de reproducción y deploy llegan después (ver doc de
> implementación).

## Estructura

```
caninde-ritual/
├── index.html · vite.config.ts · vitest.config.ts · tsconfig.json
├── firebase.json · .firebaserc          # target de Hosting propio (Fase 8)
└── src/
    ├── main.tsx · App.tsx · index.css    # shell mínimo que corre el núcleo
    ├── firebase.ts                       # scaffold Firestore/Hosting (Fase 2/8)
    └── ritual-core/                      # ★ núcleo PURO (sin framework ni proveedores)
        ├── model/        attributes · track · template · sequence
        ├── sequencer/    rng · harmonic · scoring · transitions · generator
        ├── playback/     engine (puerto) + adapters/{base,spotify,youtube,local}
        ├── auth/         pkce · oauth · token-store · providers · session
        ├── seed/         library (paleta + biblioteca mixta + plantilla ayahuasca)
        └── demo/         run.ts · auth.ts
```

**Regla de oro**: `ritual-core` no importa nada de framework ni de proveedores. Es
lógica pura y testeable; los adaptadores concretos viven en la app y se inyectan.

## Scripts

```bash
npm install        # dependencias (app independiente)
npm run dev        # Vite dev server (puerto 3001)
npm run lint       # tsc --noEmit  (igual que CanindéChords)
npm test           # vitest run    (tests del núcleo, en Node)
npm run build      # build de producción a dist/

npm run demo:run   # genera una ceremonia de ~4h y la imprime
npm run demo:auth  # PKCE + URLs de login reales (Spotify/YouTube)
```

## Notas de plataforma (grabadas en el diseño)

- **Spotify**: Web Playback SDK requiere Premium + OAuth (Auth Code + PKCE). Dev mode →
  máx. 5 usuarios Premium en allowlist. Headless, sin Web Audio → sin crossfade real.
- **YouTube**: IFrame Player API, reproductor **visible obligatorio**. Fuente secundaria.
  Login con Google opcional (sólo da acceso a playlists propias).
- **Local**: Web Audio API. Único con crossfade real, capas simultáneas y offline.

## Pendiente de configuración (fases posteriores)

- `.firebaserc` declara un target de Hosting `caninde-ritual`. Antes del primer deploy:
  crear el sitio en el proyecto `franco-control` y correr
  `firebase target:apply hosting caninde-ritual <site-id>` (Fase 8).
- Variables `VITE_FIREBASE_*` (persistencia) y `VITE_SPOTIFY_*` / `VITE_YOUTUBE_*`
  (OAuth) — ver `.env.example`. Registrar los redirect URIs en Spotify y Google Cloud.
