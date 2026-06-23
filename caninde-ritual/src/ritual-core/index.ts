// ritual-core — Núcleo puro (sin framework ni proveedores) de Caniné Ritual.
//
// Regla de oro (doc §4): este paquete no importa nada de framework ni de proveedores.
// Es lógica pura y testeable; los adaptadores concretos viven en la app y se inyectan.

export * from './model';
export * from './sequencer';
export * from './playback';
export * from './auth';
export * from './persistence';
