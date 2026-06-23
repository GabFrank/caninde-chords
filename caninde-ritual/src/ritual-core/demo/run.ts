// Demo: genera una ceremonia de ~4h y la imprime (doc §9).
//   node --experimental-strip-types src/ritual-core/demo/run.ts
//   o:  npm run demo:run   (usa tsx)

import { generate } from '../sequencer/generator';
import { sequenceDurationMs } from '../model/sequence';
import { SEED_ATTRIBUTES, SEED_LIBRARY, SEED_AYAHUASCA_TEMPLATE } from '../seed/library';

const seed = Number(process.argv[2] ?? 42);
const seq = generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, { seed, temperature: 0.4 });

const byId = new Map(SEED_LIBRARY.map((t) => [t.id, t]));
const fmt = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

console.log(`\n🌿 ${SEED_AYAHUASCA_TEMPLATE.name}  (semilla ${seed})`);
console.log(`Duración objetivo: ${fmt(SEED_AYAHUASCA_TEMPLATE.totalDurationMs)}  ·  generada: ${fmt(sequenceDurationMs(seq))}\n`);

for (const el of seq.elements) {
  const at = fmt(el.startMs);
  if (el.kind === 'silence') {
    console.log(`  ${at}  · · ·  Silencio (${fmt(el.durationMs)})`);
    continue;
  }
  const track = el.trackId ? byId.get(el.trackId) : undefined;
  const tr = el.transitionIn;
  const seam = tr ? `${tr.kind}${tr.natureCover ? '+naturaleza' : ''}` : '';
  console.log(
    `  ${at}  ▶ ${track?.title ?? el.trackId}  [${track?.source.provider}]  (${fmt(el.durationMs)})  ${seam}`,
  );
}

if (seq.warnings.length) {
  console.log('\n⚠ Advertencias:');
  for (const w of seq.warnings) console.log(`  - ${w}`);
}
console.log('');
