// Shell mínimo de Caniné Ritual (Fase 0).
//
// Todavía no es la app completa (Biblioteca / Rituales / Reproducir llegan en fases
// posteriores). Esta vista PRUEBA que el núcleo `ritual-core` corre en el navegador:
// genera una ceremonia desde la biblioteca semilla y la muestra. Reproducible por semilla.

import { useMemo, useState } from 'react';
import { Music, Sparkles, Waves, Hourglass } from 'lucide-react';
import { generate } from './ritual-core/sequencer/generator';
import { sequenceDurationMs } from './ritual-core/model/sequence';
import {
  SEED_ATTRIBUTES,
  SEED_LIBRARY,
  SEED_AYAHUASCA_TEMPLATE,
} from './ritual-core/seed/library';

const byId = new Map(SEED_LIBRARY.map((t) => [t.id, t]));

function fmt(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const providerColor: Record<string, string> = {
  local: 'text-emerald-400',
  spotify: 'text-green-400',
  youtube: 'text-red-400',
};

export default function App() {
  const [seed, setSeed] = useState(42);

  const seq = useMemo(
    () => generate(SEED_AYAHUASCA_TEMPLATE, SEED_LIBRARY, SEED_ATTRIBUTES, { seed, temperature: 0.4 }),
    [seed],
  );

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-violet-300">
            <Sparkles size={20} />
            <h1 className="text-xl font-semibold tracking-tight">Caniné Ritual</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Copiloto del facilitador — vista previa del núcleo (Fase 0).
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="text-base font-medium">{SEED_AYAHUASCA_TEMPLATE.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Hourglass size={14} /> objetivo {fmt(SEED_AYAHUASCA_TEMPLATE.totalDurationMs)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Music size={14} /> generada {fmt(sequenceDurationMs(seq))}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm text-zinc-400">Semilla</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              className="w-24 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
            />
            <button
              onClick={() => setSeed(Math.floor(Math.random() * 100000))}
              className="rounded-md bg-violet-600 px-3 py-1 text-sm font-medium hover:bg-violet-500"
            >
              Otra ceremonia
            </button>
          </div>
        </section>

        <ol className="space-y-1">
          {seq.elements.map((el, idx) => {
            if (el.kind === 'silence') {
              return (
                <li
                  key={idx}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-sm text-zinc-500"
                >
                  <span className="font-mono text-xs text-zinc-600">{fmt(el.startMs)}</span>
                  <Waves size={14} /> Silencio · {fmt(el.durationMs)}
                </li>
              );
            }
            const track = el.trackId ? byId.get(el.trackId) : undefined;
            return (
              <li
                key={idx}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-zinc-600">{fmt(el.startMs)}</span>
                <span className="flex-1 truncate">
                  {track?.title ?? el.trackId}
                  {track?.artist && <span className="text-zinc-500"> · {track.artist}</span>}
                </span>
                <span className={`text-xs ${providerColor[track?.source.provider ?? 'local']}`}>
                  {track?.source.provider}
                </span>
                <span className="font-mono text-xs text-zinc-600">{fmt(el.durationMs)}</span>
              </li>
            );
          })}
        </ol>

        {seq.warnings.length > 0 && (
          <div className="mt-6 rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-300">
            <p className="font-medium">Advertencias</p>
            <ul className="mt-1 list-inside list-disc text-amber-300/80">
              {seq.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-zinc-600">
          ritual-core · borrador editable · v{__APP_VERSION__}
        </footer>
      </div>
    </div>
  );
}
