import { describe, it, expect } from 'vitest';
import { reassignOrder } from './padOrder';

const pad = (id: string, order: number) => ({ id, order });

describe('reassignOrder', () => {
  it('reparte los huecos según la secuencia nueva', () => {
    const pads = [pad('a', 10), pad('b', 20), pad('c', 30)];
    expect(reassignOrder(pads, ['c', 'a', 'b'])).toEqual([
      { id: 'c', order: 10 },
      { id: 'a', order: 20 },
      { id: 'b', order: 30 },
    ]);
  });

  it('sólo devuelve los que realmente cambian', () => {
    const pads = [pad('a', 10), pad('b', 20), pad('c', 30)];
    // 'a' se queda donde estaba: no hay por qué escribirlo.
    expect(reassignOrder(pads, ['a', 'c', 'b'])).toEqual([
      { id: 'c', order: 20 },
      { id: 'b', order: 30 },
    ]);
  });

  it('no toca a los pads que no se estaban organizando', () => {
    // El caso real: se filtró por una categoría y se acomodó sólo esa. Los
    // números que se reparten son los que ya ocupaban esos pads, así que los de
    // las otras categorías conservan su posición relativa.
    const todos = [pad('nat1', 5), pad('otro', 7), pad('nat2', 9)];
    expect(reassignOrder(todos, ['nat2', 'nat1'])).toEqual([
      { id: 'nat2', order: 5 },
      { id: 'nat1', order: 9 },
    ]);
  });

  it('con valores repetidos, respeta igual el orden pedido', () => {
    // Un pack cuyo manifiesto no traía `order` deja a todos en 0: si los huecos
    // no se separan, la permutación es inexpresable y reordenar no hacía nada.
    const pads = [pad('a', 0), pad('b', 0), pad('c', 0)];
    const cambios = reassignOrder(pads, ['c', 'b', 'a']);
    const final = ['a', 'b', 'c']
      .map(id => ({ id, order: cambios.find(c => c.id === id)?.order ?? 0 }))
      .sort((x, y) => x.order - y.order)
      .map(x => x.id);
    expect(final).toEqual(['c', 'b', 'a']);
  });

  it('separa los huecos empatados sin tocar los que ya crecían', () => {
    const pads = [pad('a', 30), pad('b', 10), pad('c', 10)];
    expect(reassignOrder(pads, ['a', 'b', 'c'])).toEqual([
      { id: 'a', order: 10 },
      { id: 'b', order: 11 },
      { id: 'c', order: 30 },
    ]);
  });

  it('ignora ids que ya no existen', () => {
    const pads = [pad('a', 1), pad('b', 2)];
    expect(reassignOrder(pads, ['fantasma', 'b', 'a'])).toEqual([
      { id: 'b', order: 1 },
      { id: 'a', order: 2 },
    ]);
  });

  it('con menos de dos pads no hay nada que reordenar', () => {
    expect(reassignOrder([pad('a', 1)], ['a'])).toEqual([]);
    expect(reassignOrder([], [])).toEqual([]);
  });

  it('trata la ausencia de order como cero', () => {
    const pads = [{ id: 'a' }, { id: 'b', order: 4 }];
    expect(reassignOrder(pads, ['b', 'a'])).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 4 },
    ]);
  });
});
