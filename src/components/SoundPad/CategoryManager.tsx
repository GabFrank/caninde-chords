// ABM de categorías. Borrar una categoría no borra sus sonidos: pasan a
// "sin categoría", que es lo que uno espera cuando reorganiza el tablero.

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { Modal } from '../Modal';
import { SoundCategory } from '../../types';
import { SOUNDPAD_COLORS, padColor } from '../../lib/soundpadStyles';

interface CategoryManagerProps {
  open: boolean;
  categories: SoundCategory[];
  /** Cuántos pads tiene cada categoría, para avisar antes de borrar. */
  countByCategory: Record<string, number>;
  onClose: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (category: SoundCategory, changes: Partial<SoundCategory>) => Promise<void>;
  onDelete: (category: SoundCategory) => Promise<void>;
  t: Record<string, string>;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  open, categories, countByCategory, onClose, onCreate, onUpdate, onDelete, t,
}) => {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(SOUNDPAD_COLORS[1].id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Al cerrar se olvida todo, sobre todo el "borrar" ya armado: si el operador
  // toca la papelera, se arrepiente y cierra con la X, al volver a abrir el
  // botón rojo seguía apuntando a esa categoría y un toque de más la borraba.
  useEffect(() => {
    if (open) return;
    setNewName('');
    setEditingId(null);
    setEditingName('');
    setConfirmId(null);
  }, [open]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onCreate(name, newColor);
      setNewName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={t.soundpadCategories}>
      <div className="space-y-5">

        <form onSubmit={add} className="space-y-2">
          <label className="text-xs font-bold text-zinc-500" htmlFor="cat-name">{t.soundpadNewCategory}</label>
          <div className="flex gap-2">
            <input
              id="cat-name"
              value={newName}
              maxLength={39}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-h-11 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-blue-500 outline-none text-sm font-bold"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              aria-label={t.soundpadNewCategory}
              className="min-h-11 min-w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SOUNDPAD_COLORS.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setNewColor(c.id)}
                aria-label={c.label}
                aria-pressed={newColor === c.id}
                className={`h-8 w-8 rounded-full ${c.dot} transition-all ${newColor === c.id ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-zinc-900' : 'opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
        </form>

        <div className="space-y-1.5">
          {categories.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">—</p>
          )}
          {categories.map(cat => {
            const count = countByCategory[cat.id] ?? 0;
            const editing = editingId === cat.id;
            return (
              <div key={cat.id} className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                <span className={`h-3 w-3 rounded-full shrink-0 ${padColor(cat.color).dot}`} />

                {editing ? (
                  <input
                    value={editingName}
                    maxLength={39}
                    autoFocus
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 min-w-0 min-h-9 px-2 rounded-lg bg-white dark:bg-zinc-900 border border-blue-500 outline-none text-sm font-bold"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                    className="flex-1 min-w-0 text-left text-sm font-bold truncate"
                  >
                    {cat.name}
                  </button>
                )}

                <span className="text-[10px] text-zinc-400 shrink-0">{count}</span>

                {editing ? (
                  <>
                    <button
                      type="button"
                      aria-label={t.save}
                      onClick={async () => {
                        if (editingName.trim()) await onUpdate(cat, { name: editingName.trim() });
                        setEditingId(null);
                      }}
                      className="min-h-9 min-w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t.cancel}
                      onClick={() => setEditingId(null)}
                      className="min-h-9 min-w-9 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : confirmId === cat.id ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => { await onDelete(cat); setConfirmId(null); }}
                      className="min-h-9 px-3 rounded-lg bg-red-600 text-white text-[10px] font-black"
                    >
                      {t.delete}
                    </button>
                    <button
                      type="button"
                      aria-label={t.cancel}
                      onClick={() => setConfirmId(null)}
                      className="min-h-9 min-w-9 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={t.delete}
                    onClick={() => setConfirmId(cat.id)}
                    className="min-h-9 min-w-9 rounded-lg text-zinc-400 hover:text-red-600 flex items-center justify-center"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {confirmId && (
          <p className="text-[10px] text-zinc-500 leading-relaxed">{t.soundpadDeleteCategory}</p>
        )}
      </div>
    </Modal>
  );
};

export default CategoryManager;
