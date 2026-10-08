// Cajas de texto del lienzo: qué se pinta de verdad y cuánto queda tras los
// recortes. Lo usa `chartGeometry.ts`; solo lo importan archivos de prueba.

export type TextBox = {
  readonly text: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  clone(): Rect;
  applyTransform(matrix: unknown): void;
};

export type Clipped = {
  readonly transform?: unknown;
  getBoundingRect(): Rect;
};

export type Node = {
  readonly ignore?: boolean;
  readonly invisible?: boolean;
  readonly parent?: Node | null;
};

export type Drawn = Node & {
  readonly type: string;
  readonly style?: { readonly text?: string };
  readonly transform?: unknown;
  /** Los recortes que el navegador aplica a este elemento. Los pone zrender en
   *  el pase de dibujo, y por eso el nombre con guiones bajos: es interno. */
  readonly __clipPaths?: readonly Clipped[];
  getBoundingRect(): Rect;
};

/** true si el elemento acaba en el lienzo.
 *
 * La lista de dibujo devuelve cosas que NO se pintan, y cada una se apaga de una
 * forma distinta: la leyenda paginada marca su paginador `invisible` cuando hay
 * una sola página, y otros elementos se apagan desde el grupo que los contiene.
 * Contando el paginador escondido, un gráfico correcto de 660 px daba una
 * colisión con un texto que nadie ve. Cotejado contra el SVG que sale de verdad:
 * ahí ese "1/1" no aparece. */
export function isPainted(node: Node | null | undefined): boolean {
  for (let current = node; current; current = current.parent) {
    if (current.ignore || current.invisible) return false;
  }
  return true;
}

export function toBox(text: string, rect: Rect): TextBox {
  return {
    text,
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  };
}

/** Lo que queda de una caja después de los recortes, o `null` si no queda nada.
 *
 * Sin esto, la leyenda paginada daría falsos positivos: dibuja TODOS sus ítems y
 * tapa con un recorte los que no entran en la página. Sus cajas están fuera del
 * lienzo, pero el navegador no pinta ni un píxel de ellas. */
export function visiblePart(box: TextBox, clips: readonly Clipped[] | undefined): TextBox | null {
  let visible = box;
  for (const clip of clips ?? []) {
    const rect = clip.getBoundingRect().clone();
    if (clip.transform) rect.applyTransform(clip.transform);
    const area = toBox(box.text, rect);
    visible = {
      text: box.text,
      left: Math.max(visible.left, area.left),
      right: Math.min(visible.right, area.right),
      top: Math.max(visible.top, area.top),
      bottom: Math.min(visible.bottom, area.bottom),
    };
    if (visible.left >= visible.right || visible.top >= visible.bottom) return null;
  }
  return visible;
}
