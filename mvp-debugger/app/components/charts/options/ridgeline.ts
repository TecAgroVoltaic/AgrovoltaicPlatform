// Gráfico de crestas (ridgeline): una densidad por sensor, apiladas para
// comparar distribuciones de un vistazo (Fig. 7 del PDF).
//
// Las densidades y la probabilidad de cola las calcula el backend; acá solo se
// desplaza cada curva a su fila. El PDF llama a esta figura "regresión Ridge" y
// enlaza la regularización de Tikhonov, pero lo que muestra es un joyplot de
// densidades: se implementa lo que muestra la figura y la discrepancia queda
// anotada para consultarla.
import { baseOption, axisLine, formatValue, splitLine, tooltipBase, valueAxis } from "@/app/components/charts/options/base";
import { ridgeLabelWidth, type ChartCanvas } from "@/app/components/charts/options/canvas";
import { seriesColor, type ChartTheme, type SeriesColorToken } from "@/app/components/charts/theme";
import type { ChartOption } from "@/app/components/charts/echarts";

export type DensityCurve = {
  readonly id: string;
  readonly label: string;
  /** Soporte de la densidad, en las unidades de la variable. */
  readonly x: readonly number[];
  /** Densidad normalizada a [0, 1] por el backend, punto a punto con `x`. */
  readonly density: readonly number[];
  /** Probabilidad de cola, si el backend la calculó (0 a 1). */
  readonly tailProbability?: number | null;
  readonly color?: SeriesColorToken;
};

export type RidgelineData = {
  readonly curves: readonly DensityCurve[];
  readonly unit: string;
  /** Umbral marcado con una línea vertical (el "85 °C", por ejemplo). */
  readonly threshold?: { readonly value: number; readonly label: string } | null;
};

/** Cuánto invade cada cresta la fila de arriba. Por encima de 1 se solapan, que
 * es justamente lo que hace legible la comparación. */
const RIDGE_AMPLITUDE = 1.7;
const AXIS_MARGIN = 0.25;
const ROW_HEIGHT_PX = 46;
const FILL_OPACITY = 0.35;
const LINE_WIDTH = 1.4;
const PERCENT = 100;
const PERCENT_DECIMALS = 1;
/** Sitio que se deja pasado el umbral cuando cae fuera de lo medido, como
 *  fracción del rango medido. */
const THRESHOLD_MARGIN_SHARE = 0.06;

export function hasPlottableCurves(data: RidgelineData): boolean {
  return data.curves.some((curve) => curve.density.length > 0);
}

/** Alto sugerido: una fila por sensor, para que no se aplasten. */
export function ridgelineHeight(data: RidgelineData, minimum: number): number {
  return Math.max(minimum, data.curves.length * ROW_HEIGHT_PX);
}

export function buildRidgelineOption(
  data: RidgelineData,
  theme: ChartTheme,
  canvas: ChartCanvas,
): ChartOption {
  const rows = data.curves.length;
  const baselineOf = (index: number) => rows - 1 - index;
  const baselines = data.curves.map((_, index) => baselineOf(index));

  return {
    ...baseOption(theme),
    tooltip: { ...tooltipBase(theme), trigger: "item", show: false },
    xAxis: thresholdAwareAxis(data, theme),
    yAxis: {
      type: "value",
      min: -AXIS_MARGIN,
      max: rows - 1 + RIDGE_AMPLITUDE + AXIS_MARGIN,
      ...axisLine(theme),
      ...splitLine(theme),
      // Las marcas se nombran una por una y NO con `interval: 1`. Con el
      // intervalo, el margen del eje arrastra los cortes a -0,25 / 0,75 / 1,75:
      // el formateador buscaba la curva de un índice fraccionario, no la
      // encontraba, y TODAS las etiquetas salían vacías. Un eje sin nombres no
      // se ve como un error, se ve como un diseño, y así pasó una revisión.
      axisTick: { show: false, customValues: baselines },
      axisLabel: {
        color: theme.ink2,
        customValues: baselines,
        // Con `break` el nombre que no entra se parte en varias líneas en vez
        // de salirse del lienzo por la izquierda, que es lo que hacía a 286 px.
        width: ridgeLabelWidth(canvas),
        overflow: "break" as const,
        formatter: (value: number) => rowLabel(data, rows - 1 - value),
      },
    },
    series: data.curves.map((curve, index) => {
      const color = seriesColor(theme, index, curve.color);
      const baseline = baselineOf(index);
      return {
        name: curve.label,
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        silent: true,
        lineStyle: { color, width: LINE_WIDTH },
        areaStyle: { color, opacity: FILL_OPACITY, origin: baseline },
        data: curve.x.map((x, point) => [
          x,
          baseline + (curve.density[point] ?? 0) * RIDGE_AMPLITUDE,
        ]),
        ...(index === 0 ? thresholdMark(data, theme) : {}),
      };
    }),
  };
}

/** Etiqueta de la fila: el sensor y, si la hay, su probabilidad de cola. */
function rowLabel(data: RidgelineData, index: number): string {
  const curve = data.curves[index];
  if (!curve) return "";
  const tail = curve.tailProbability;
  if (tail === null || tail === undefined) return curve.label;
  return `${curve.label} (cola ${formatValue(tail * PERCENT, "%", PERCENT_DECIMALS)})`;
}

/**
 * El eje de la magnitud, ESTIRADO hasta el umbral cuando el umbral queda fuera
 * de lo medido.
 *
 * Es el caso normal, no el raro: el umbral son 60 °C y la temperatura más alta
 * que registró el sitio en el último mes son 58,4. ECharts ajusta el eje a los
 * datos, así que la línea del umbral caía FUERA de la rejilla: no se dibujaba
 * ninguna referencia, y su etiqueta terminaba tumbada sobre las marcas del eje y
 * medio fuera del lienzo. La figura prometía un umbral y no lo enseñaba.
 *
 * Se calcula acá y no con la forma de función que acepta `max` porque esa
 * desactiva el redondeo del eje y dejaría el último corte en 58,3783.
 */
function thresholdAwareAxis(data: RidgelineData, theme: ChartTheme) {
  const axis = valueAxis(theme, data.unit);
  const threshold = data.threshold;
  if (!threshold) return axis;
  const measured = data.curves.flatMap((curve) => curve.x);
  if (measured.length === 0) return axis;
  const lowest = Math.min(...measured);
  const highest = Math.max(...measured);
  // El respiro es lo que hace VISIBLE la línea: sin él el umbral queda pegado al
  // borde de la rejilla, la línea se recorta contra el filo y su etiqueta se
  // sienta encima de la unidad del eje, que vive en esa misma esquina.
  const breathing = (highest - lowest) * THRESHOLD_MARGIN_SHARE;
  return {
    ...axis,
    ...(threshold.value > highest ? { max: threshold.value + breathing } : {}),
    ...(threshold.value < lowest ? { min: threshold.value - breathing } : {}),
  };
}

function thresholdMark(data: RidgelineData, theme: ChartTheme) {
  if (!data.threshold) return {};
  return {
    markLine: {
      silent: true,
      symbol: "none" as const,
      lineStyle: { color: theme.series.crit, type: "dashed" as const },
      // `end` centra el texto sobre la línea, y la línea del umbral cae por
      // construcción contra el extremo del eje: media etiqueta se salía del
      // lienzo. `insideEndTop` la mete dentro de la rejilla.
      label: {
        formatter: data.threshold.label,
        color: theme.series.crit,
        position: "insideEndTop" as const,
      },
      data: [{ xAxis: data.threshold.value }],
    },
  };
}
