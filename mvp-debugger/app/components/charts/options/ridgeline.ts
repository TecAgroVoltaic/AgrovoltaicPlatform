// Gráfico de crestas (ridgeline): una densidad por sensor, apiladas para
// comparar distribuciones de un vistazo (Fig. 7 del PDF).
//
// Las densidades y la probabilidad de cola las calcula el backend; acá solo se
// desplaza cada curva a su fila. El PDF llama a esta figura "regresión Ridge" y
// enlaza la regularización de Tikhonov, pero lo que muestra es un joyplot de
// densidades: se implementa lo que muestra la figura y la discrepancia queda
// anotada para consultarla.
import { baseOption, axisLine, formatValue, splitLine, tooltipBase } from "@/app/components/charts/options/base";
import { ridgeLabelWidth, type ChartCanvas } from "@/app/components/charts/options/canvas";
import { thresholdAwareAxis, thresholdMark } from "@/app/components/charts/options/ridgeline/threshold";
import type { RidgelineData } from "@/app/components/charts/options/ridgeline/types";
import { seriesColor, type ChartTheme } from "@/app/components/charts/theme";
import type { ChartOption } from "@/app/components/charts/echarts";

export type { DensityCurve, RidgelineData } from "@/app/components/charts/options/ridgeline/types";

/** Cuánto invade cada cresta la fila de arriba. Por encima de 1 se solapan, que
 * es justamente lo que hace legible la comparación. */
const RIDGE_AMPLITUDE = 1.7;
const AXIS_MARGIN = 0.25;
const ROW_HEIGHT_PX = 46;
const FILL_OPACITY = 0.35;
const LINE_WIDTH = 1.4;
const PERCENT = 100;
const PERCENT_DECIMALS = 1;

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
