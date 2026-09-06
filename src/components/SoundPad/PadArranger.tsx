// Modo organizar: acomodar el orden de los pads.
//
// Es un modo aparte, no un gesto sobre el tablero, por dos razones:
//
// 1. El pad dispara en `pointerdown` y retira el sonido si el gesto resulta ser
//    un arrastre (ver gotcha 5 de docs/SOUNDPAD.md). Arrastrar para reordenar
//    sobre ese mismo botón sería exactamente el gesto que ya significa otra cosa.
// 2. En plena ceremonia, reordenar sin querer es peor que no poder reordenar.
//
// Mientras se organiza, los pads se muestran como lista y no suenan. Se reusa el
// patrón ya probado en `SetlistEditor`: arrastre con asa explícita para quien
// puede, y botones ↑/↓, que en táctil son lo único fiable.

import React, { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { GripVertical, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { SoundPad } from '../../types';
import { Strings } from '../../translations';
import { autoScroll } from '../../lib/autoScroll';
import { padColor, padIcon } from '../../lib/soundpadStyles';
import { formatDuration } from '../../services/soundLibrary';

interface PadArrangerProps {
  /** Los pads visibles con el filtro actual, en su orden actual. */
  pads: SoundPad[];
  onSave: (orderedIds: string[]) => Promise<void> | void;
  onCancel: () => void;
  t: Strings;
}

const ArrangerItem: React.FC<{
  pad: SoundPad;
  index: number;
  total: number;
  onMove: (id: string, delta: number) => void;
  t: Strings;
}> = ({ pad, index, total, onMove, t }) => {
  const dragControls = useDragControls();
  const ref = useRef<HTMLLIElement>(null);
  const color = padColor(pad.color);
  const Icon = padIcon(pad.icon);

  return (
    <Reorder.Item
      ref={ref}
      value={pad.id}
      dragListener={false}
      dragControls={dragControls}
      onDrag={(event) => autoScroll(ref.current, (event as PointerEvent).clientY)}
      data-arrange-id={pad.id}
      className="p-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl flex items-center gap-2"
    >
      <div
        onPointerDown={(e) => dragControls.start(e)}
        aria-hidden="true"
        className="hidden sm:flex items-center justify-center w-11 h-11 shrink-0 rounded-xl text-zinc-400 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={20} />
      </div>

      <span className="w-6 shrink-0 text-center text-[11px] font-mono font-bold text-zinc-400 tabular-nums">
        {index + 1}
      </span>

      <span className={`h-9 w-9 shrink-0 rounded-xl border-2 flex items-center justify-center ${color.surface}`}>
        <Icon size={16} />
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-bold truncate text-sm">{pad.name}</p>
        <p className="text-[10px] text-zinc-500 truncate">{formatDuration(pad.durationMs)}</p>
      </div>

      {/* Alternativa al arrastre: en táctil es lo único fiable, y con teclado es
          lo único que existe. */}
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={() => onMove(pad.id, -1)}
          disabled={index === 0}
          data-move-up={pad.id}
          aria-label={`${t.moveUp}: ${pad.name}`}
          className="w-11 h-6 flex items-center justify-center text-zinc-400 hover:text-blue-500 disabled:opacity-25 rounded-lg transition-all"
        >
          <ChevronUp size={18} />
        </button>
        <button
          type="button"
          onClick={() => onMove(pad.id, 1)}
          disabled={index === total - 1}
          data-move-down={pad.id}
          aria-label={`${t.moveDown}: ${pad.name}`}
          className="w-11 h-6 flex items-center justify-center text-zinc-400 hover:text-blue-500 disabled:opacity-25 rounded-lg transition-all"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </Reorder.Item>
  );
};

export const PadArranger: React.FC<PadArrangerProps> = ({ pads, onSave, onCancel, t }) => {
  const [ids, setIds] = useState<string[]>(() => pads.map(p => p.id));
  const [saving, setSaving] = useState(false);
  const byId = new Map(pads.map(p => [p.id, p]));

  // Si mientras se organiza llega un pad nuevo desde otro dispositivo, la lista
  // se pone al día sin perder lo que ya se movió acá.
  useEffect(() => {
    setIds(prev => {
      const vivos = prev.filter(id => pads.some(p => p.id === id));
      const nuevos = pads.map(p => p.id).filter(id => !vivos.includes(id));
      return nuevos.length === 0 && vivos.length === prev.length ? prev : [...vivos, ...nuevos];
    });
  }, [pads]);

  const move = (id: string, delta: number) => {
    setIds(prev => {
      const from = prev.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(ids);
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as SoundPad[];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <p className="flex-1 text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
          {t.soundpadArrangeHint}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-9 px-3 rounded-lg bg-white dark:bg-zinc-900 text-[11px] font-bold shrink-0"
        >
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-9 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-black flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <Check size={13} />
          {t.soundpadArrangeDone}
        </button>
      </div>

      <Reorder.Group axis="y" values={ids} onReorder={setIds} className="space-y-1.5">
        {ordered.map((pad, i) => (
          <ArrangerItem
            key={pad.id}
            pad={pad}
            index={i}
            total={ordered.length}
            onMove={move}
            t={t}
          />
        ))}
      </Reorder.Group>
    </div>
  );
};

export default PadArranger;
