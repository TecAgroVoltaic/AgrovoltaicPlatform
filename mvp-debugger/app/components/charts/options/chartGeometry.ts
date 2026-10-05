// Dónde queda cada texto que un gráfico dibuja, medido sobre el render de verdad.
//
// Existe para que se pueda AFIRMAR geometría: que la unidad de un eje no se
// salga del lienzo, que la escala de color no se siente encima de las fechas.
// Afirmar en su lugar `align === "right"` sería repetir el código, y no vería
// ninguno de esos defectos: los cuatro que motivaron esto llegaron a producción
// y uno pasó además una revisión humana.
//
// No entra en el bundle: solo lo importan archivos de prueba, igual que los
// `fixtures.ts` de calidad y de comparativa.
//
// El renderizador SVG se registra ACÁ y no en `charts/echarts`: la app dibuja en
// canvas, que jsdom no implementa. La colocación de los textos no depende del
// renderizador, así que lo medido es lo que se ve en el navegador.
import { SVGRenderer } from "echarts/renderers";

import { echarts, type ChartOption } from "@/app/components/charts/echarts";

echarts.use([SVGRenderer]);

export type CanvasSize = { readonly width: number; readonly height: number };

export type TextBox = {
  readonly text: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  clone(): Rect;
  applyTransform(matrix: unknown): void;
};

type Clipped = {
  readonly transform?: unknown;
  getBoundingRect(): Rect;
};

type Node = {
  readonly ignore?: boolean;
  readonly invisible?: boolean;
  readonly parent?: Node | null;
};

type Drawn = Node & {
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
function isPainted(node: Node | null | undefined): boolean {
  for (let current = node; current; current = current.parent) {
    if (current.ignore || current.invisible) return false;
  }
  return true;
}

type OffscreenChart = {
  setOption(option: ChartOption): void;
  renderToSVGString(): string;
  dispose(): void;
  getZr(): { storage: { getDisplayList(includeIgnored: boolean): Drawn[] } };
};

type OffscreenInit = (
  container: null,
  theme: null,
  options: { renderer: string; ssr: boolean; width: number; height: number },
) => OffscreenChart;

function toBox(text: string, rect: Rect): TextBox {
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
function visiblePart(box: TextBox, clips: readonly Clipped[] | undefined): TextBox | null {
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

/** Cada texto dibujado, con su caja en coordenadas del lienzo. */
export function drawnTexts(option: ChartOption, size: CanvasSize): readonly TextBox[] {
  const chart = (echarts.init as unknown as OffscreenInit)(null, null, {
    renderer: "svg",
    ssr: true,
    width: size.width,
    height: size.height,
  });
  chart.setOption(option);
  chart.renderToSVGString();
  const boxes: TextBox[] = [];
  // Un texto de ECharts llega al lienzo partido en `tspan`, uno por línea.
  for (const drawn of chart.getZr().storage.getDisplayList(true)) {
    if (drawn.type !== "tspan" || !isPainted(drawn)) continue;
    const rect = drawn.getBoundingRect().clone();
    if (drawn.transform) rect.applyTransform(drawn.transform);
    const visible = visiblePart(toBox(String(drawn.style?.text ?? ""), rect), drawn.__clipPaths);
    if (visible) boxes.push(visible);
  }
  chart.dispose();
  return boxes;
}

/** Los textos que se salen del lienzo, descritos para que el fallo se lea. */
export function outsideCanvas(option: ChartOption, size: CanvasSize): readonly string[] {
  return drawnTexts(option, size)
    .filter((box) =>
      box.left < 0 || box.right > size.width || box.top < 0 || box.bottom > size.height)
    .map((box) => `${box.text} [${Math.round(box.left)}, ${Math.round(box.right)}]`);
}

/** Los pares de textos que se pisan. */
export function overlappingPairs(option: ChartOption, size: CanvasSize): readonly string[] {
  const boxes = drawnTexts(option, size);
  const pairs: string[] = [];
  boxes.forEach((one, index) => {
    boxes.slice(index + 1).forEach((other) => {
      const collide =
        one.left < other.right && other.left < one.right &&
        one.top < other.bottom && other.top < one.bottom;
      if (collide) pairs.push(`${one.text} / ${other.text}`);
    });
  });
  return pairs;
}
