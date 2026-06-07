# [2.7.0](https://github.com/GabFrank/caninde-chords/compare/v2.6.0...v2.7.0) (2026-06-07)


### Features

* **audio:** timbre de guitarra más cálido y natural ([12f939d](https://github.com/GabFrank/caninde-chords/commit/12f939d3342e20fa71831eff4739f1d556ddb082))

# [2.6.0](https://github.com/GabFrank/caninde-chords/compare/v2.5.0...v2.6.0) (2026-06-07)


### Features

* **i18n:** infraestructura es/en y Compositor bilingüe (REQ-NFR-04) ([6df4383](https://github.com/GabFrank/caninde-chords/commit/6df4383dc478c43cb709a5b4df2ad303d84cd4ed))

# [2.5.0](https://github.com/GabFrank/caninde-chords/compare/v2.4.0...v2.5.0) (2026-06-07)


### Features

* ajustes finos del Compositor (cadencia, compás, primer acorde, debounce) ([ae0f39e](https://github.com/GabFrank/caninde-chords/commit/ae0f39e711352209a92969470a7f4011696015c1)), closes [#28](https://github.com/GabFrank/caninde-chords/issues/28) [#18](https://github.com/GabFrank/caninde-chords/issues/18) [#17](https://github.com/GabFrank/caninde-chords/issues/17) [#24](https://github.com/GabFrank/caninde-chords/issues/24) [#25](https://github.com/GabFrank/caninde-chords/issues/25)

# [2.4.0](https://github.com/GabFrank/caninde-chords/compare/v2.3.0...v2.4.0) (2026-06-07)


### Features

* puente Manual -> Compositor (REQ-MAN-04) ([fb8720a](https://github.com/GabFrank/caninde-chords/commit/fb8720adb493b3f5438f993c78aecf380158511d))

# [2.3.0](https://github.com/GabFrank/caninde-chords/compare/v2.2.0...v2.3.0) (2026-06-07)


### Features

* patrones de ritmo reales en el Compositor (Apéndice B) ([826cd2b](https://github.com/GabFrank/caninde-chords/commit/826cd2b04f58936d23f3d82f213c717bcacb9240))

# [2.2.0](https://github.com/GabFrank/caninde-chords/compare/v2.1.2...v2.2.0) (2026-06-07)


### Features

* mejoras del Compositor (loop, dirección, duración, round-trip robusto) ([6bd15a6](https://github.com/GabFrank/caninde-chords/commit/6bd15a6578c9ad92ccffe51ffd6a3ce5fbb5ffe9))

## [2.1.2](https://github.com/GabFrank/caninde-chords/compare/v2.1.1...v2.1.2) (2026-06-07)


### Bug Fixes

* correcciones del motor de teoría armónica (REQ-HRM-03 y fidelidad) ([9dc7708](https://github.com/GabFrank/caninde-chords/commit/9dc7708051f0fea3f89a0760b3f75bc02ce2c2a4))

## [2.1.1](https://github.com/GabFrank/caninde-chords/compare/v2.1.0...v2.1.1) (2026-06-07)


### Bug Fixes

* persistencia del Compositor de maquetas (reglas Firestore + guardado) ([1b1daeb](https://github.com/GabFrank/caninde-chords/commit/1b1daeb024c82f4c5d76689fb41c76f3166968b6))

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
