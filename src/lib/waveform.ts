// Forma de onda para el recortador.
//
// Se reduce el audio a un pico por columna de píxeles: es lo único que hace
// falta para ver dónde empieza y dónde termina el sonido, y evita recorrer
// millones de muestras en cada repintado.

/**
 * Máximo valor absoluto de cada tramo, normalizado a 0..1.
 *
 * Se recorre saltando muestras cuando el tramo es largo: con un audio de tres
 * minutos, mirar una de cada N basta para dibujar la silueta y hace la
 * diferencia entre pintar al instante o congelar la pestaña.
 */
export function computePeaks(samples: Float32Array, bins: number): number[] {
  if (bins <= 0 || samples.length === 0) return [];
  const porBin = samples.length / bins;
  const paso = Math.max(1, Math.floor(porBin / 256));
  const picos: number[] = new Array(bins);

  for (let i = 0; i < bins; i++) {
    const desde = Math.floor(i * porBin);
    const hasta = Math.min(samples.length, Math.floor((i + 1) * porBin));
    let max = 0;
    for (let j = desde; j < hasta; j += paso) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    picos[i] = max;
  }

  // Se normaliza contra el pico global: un sonido grabado bajo tiene que verse
  // igual de bien que uno fuerte, porque lo que se busca es dónde empieza.
  const global = picos.reduce((m, v) => Math.max(m, v), 0);
  if (global <= 0) return picos;
  return picos.map(v => v / global);
}
