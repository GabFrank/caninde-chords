# [2.1.0](https://github.com/GabFrank/caninde-chords/compare/v2.0.2...v2.1.0) (2026-06-07)


### Features

* exponer /version.json para verificar la versión publicada ([949d535](https://github.com/GabFrank/caninde-chords/commit/949d53581804050b0b7217f9b888cedab02371d5))

## [2.0.2](https://github.com/GabFrank/caninde-chords/compare/v2.0.1...v2.0.2) (2026-06-07)


### Bug Fixes

* aplicar actualizaciones de la PWA automáticamente y marcar prueba de deploy ([65e8549](https://github.com/GabFrank/caninde-chords/commit/65e8549926929f5196fa39d54c3341a1db8f2c56))

## [2.0.1](https://github.com/GabFrank/caninde-chords/compare/v2.0.0...v2.0.1) (2026-06-07)


### Bug Fixes

* mostrar la versión real de la app leyéndola desde package.json ([58b30c7](https://github.com/GabFrank/caninde-chords/commit/58b30c7c545d1ba6f1199af573de2edf99f7e330))

# [2.0.0](https://github.com/GabFrank/caninde-chords/compare/v1.0.0...v2.0.0) (2026-06-07)


* feat!: plataforma de despliegue propia (migración fuera de AI Studio) ([2497ad7](https://github.com/GabFrank/caninde-chords/commit/2497ad7775a09066b05bdc26f3a3e4763889690b))


### BREAKING CHANGES

* el modelo de configuración y despliegue cambia de AI Studio
(inyección de GEMINI_API_KEY en runtime) a build-time mediante secrets de CI;
ahora requiere los secrets GEMINI_API_KEY y FIREBASE_SERVICE_ACCOUNT en GitHub.

# 1.0.0 (2026-06-07)


### Features

* initialize CanindeChords project structure ([930a990](https://github.com/GabFrank/caninde-chords/commit/930a990225ea9cde16e113d9c455c9dd8aed3b25))
