# [2.0.0](https://github.com/GabFrank/caninde-chords/compare/v1.0.0...v2.0.0) (2026-06-07)


* feat!: plataforma de despliegue propia (migración fuera de AI Studio) ([2497ad7](https://github.com/GabFrank/caninde-chords/commit/2497ad7775a09066b05bdc26f3a3e4763889690b))


### BREAKING CHANGES

* el modelo de configuración y despliegue cambia de AI Studio
(inyección de GEMINI_API_KEY en runtime) a build-time mediante secrets de CI;
ahora requiere los secrets GEMINI_API_KEY y FIREBASE_SERVICE_ACCOUNT en GitHub.

# 1.0.0 (2026-06-07)


### Features

* initialize CanindeChords project structure ([930a990](https://github.com/GabFrank/caninde-chords/commit/930a990225ea9cde16e113d9c455c9dd8aed3b25))
