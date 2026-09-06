/**
 * Reasignación del orden de los pads.
 *
 * Se reparten sólo los valores de `order` que los pads afectados YA ocupaban: se
 * toman sus números actuales, se ordenan, y se asignan según la secuencia nueva.
 *
 * La razón es que el tablero se organiza filtrado —"acomodá los sonidos de
 * Naturaleza"— y renumerar de 0 a n movería también a los de las demás
 * categorías, que el usuario ni siquiera está viendo.
 */
export interface Orderable {
  id: string;
  order?: number;
}

export function reassignOrder<T extends Orderable>(
  pads: T[],
  orderedIds: string[],
): { id: string; order: number }[] {
  const byId = new Map(pads.map(p => [p.id, p]));
  const afectados = orderedIds.map(id => byId.get(id)).filter((p): p is T => Boolean(p));
  if (afectados.length < 2) return [];

  const huecos = afectados.map(p => p.order ?? 0).sort((a, b) => a - b);
  return afectados
    .map((pad, i) => ({ id: pad.id, order: huecos[i] }))
    .filter(({ id, order }) => byId.get(id)!.order !== order);
}
