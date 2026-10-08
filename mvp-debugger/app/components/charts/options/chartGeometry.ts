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
import {
  isPainted,
  toBox,
  visiblePart,
  type Drawn,
  type TextBox,
} from "@/app/components/charts/options/chartGeometry/textBoxes";

echarts.use([SVGRenderer]);

export type { TextBox };

export type CanvasSize = { readonly width: number; readonly height: number };

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
