// Registro ÚNICO de los módulos de ECharts.
//
// Se importa la API por piezas (`echarts/core` + los charts y componentes que se
// usan) en vez del paquete entero: así el empaquetador puede sacudir el árbol y
// no entran al bundle ni los mapas, ni el gauge, ni el sunburst. `echarts.use`
// corre una sola vez, acá, porque registrar es un efecto global: repartido por
// los componentes, el orden de los imports decidiría qué gráfico funciona.
//
// Añadir un módulo tiene costo en kilobytes. Antes de sumar uno, revisar si lo
// que hace falta se puede dibujar con los que ya están.
import { BarChart, BoxplotChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendScrollComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapContinuousComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import type {
  BarSeriesOption,
  BoxplotSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  BoxplotChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  // La PAGINADA y no la simple: es la única que garantiza una sola fila de
  // leyenda, y `grid.top` es un número fijo que no sabe cuántas filas salieron.
  // Ver `legendBase` en options/base. Reemplaza a `LegendPlainComponent`, no se
  // suma: todas las leyendas de la consola son `type: "scroll"`.
  LegendScrollComponent,
  MarkLineComponent,
  VisualMapContinuousComponent,
  CanvasRenderer,
]);

/** Opción de gráfico limitada a los módulos registrados: si una vista escribe
 * `series: { type: "pie" }`, el tipo lo rechaza antes de que el navegador dibuje
 * un hueco en blanco. */
export type ChartOption = ComposeOption<
  | BarSeriesOption
  | BoxplotSeriesOption
  | HeatmapSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | VisualMapComponentOption
>;

export { echarts };
