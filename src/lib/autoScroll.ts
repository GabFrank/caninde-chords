/**
 * Desplaza el contenedor con scroll cuando se arrastra cerca de sus bordes.
 *
 * Sin esto, arrastrar más allá del borde visible no hace nada: mover el último
 * elemento de una lista larga al principio se vuelve imposible.
 *
 * Estaba dentro de `SetlistEditor`; se extrajo al agregar el modo organizar del
 * Soundpad, que tiene exactamente el mismo problema.
 */
export function autoScroll(el: HTMLElement | null, clientY: number) {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const canScroll = node.scrollHeight > node.clientHeight &&
      /auto|scroll/.test(getComputedStyle(node).overflowY);
    if (canScroll) {
      const r = node.getBoundingClientRect();
      const ZONE = 80;
      if (clientY < r.top + ZONE) node.scrollTop -= Math.max(4, (r.top + ZONE - clientY) / 4);
      else if (clientY > r.bottom - ZONE) node.scrollTop += Math.max(4, (clientY - (r.bottom - ZONE)) / 4);
      return;
    }
    node = node.parentElement;
  }
}
