// Barras por categoría (irradiación mensual, energía por arreglo...). Admite
// varias series para comparar Inclinado contra Vertical en la misma categoría.
//
// Un valor nulo NO dibuja barra: una barra de altura cero se lee como "produjo
// cero", y en este histórico casi siempre significa "ese mes no vino la columna".
//
// La ORIENTACIÓN es opcional y por defecto vertical, que es lo que necesitan las
// categorías cortas (meses, horas, arreglos). Con nombres largos, como las 18
// variables del veredicto de calidad, la etiqueta pide más ancho del que tiene su
// hueco y `hideOverlap` esconde la mayoría; en horizontal el nombre va al eje Y y
// entra entero.
import {
  CHART_GRID,
  baseOption,
  categoryAxis,
  formatValue,
  legendBase,
  tooltipBase,
  valueAxis,
} from "@/app/components/charts/options/base";
import { seriesColor, type ChartTheme, type SeriesColorToken } from "@/app/components/charts/theme";
import type { ChartCanvas } from "@/app/components/charts/options/canvas";
import type { ChartOption } from "@/app/components/charts/echarts";

export type BarsOrientation = "vertical" | "horizontal";

export type BarSeries = {
  readonly id: string;
  readonly label: string;
  readonly values: readonly (number | null)[];
  readonly color?: SeriesColorToken;
  /** Texto fijo junto a cada barra, en el mismo orden que `values`. Sin esto la
   * cifra solo aparece al pasar el ratón, y una pantalla proyectada en una
   * reunión no recibe ningún ratón. */
  readonly valueLabels?: readonly (string | null)[];
};

export type BarsData = {
  readonly categories: readonly string[];
  readonly series: readonly BarSeries[];
  readonly unit: string;
  /** Por defecto `"vertical"`. En horizontal las categorías se leen de arriba
   * hacia abajo, en el mismo orden en que llegan. */
  readonly orientation?: BarsOrientation;
};

const BAR_RADIUS = 3;
const GRID_TOP_WITH_LEGEND = 34;
/** Sitio para la etiqueta que se dibuja pasado el extremo de la barra. */
const GRID_RIGHT_WITH_BAR_LABEL = 96;
const BAR_LABEL_FONT_SIZE = 11;

const VERTICAL_RADIUS: [number, number, number, number] = [BAR_RADIUS, BAR_RADIUS, 0, 0];
/** La barra horizontal crece hacia la derecha: se redondea ese extremo. */
const HORIZONTAL_RADIUS: [number, number, number, number] = [0, BAR_RADIUS, BAR_RADIUS, 0];

export function hasPlottableBars(data: BarsData): boolean {
  return data.series.some((series) => series.values.some((value) => value !== null));
}

function labelAt(labels: readonly (string | null)[], index: number | undefined): string {
  if (index === undefined) return "";
  return labels[index] ?? "";
}

export function buildBarsOption(
  data: BarsData,
  theme: ChartTheme,
  canvas: ChartCanvas,
): ChartOption {
  const showLegend = data.series.length > 1;
  const isHorizontal = data.orientation === "horizontal";
  const hasBarLabels = data.series.some((series) => series.valueLabels !== undefined);
  const categories = categoryAxis(theme, data.categories);
  const values = valueAxis(theme, data.unit);

  return {
    ...baseOption(theme),
    grid: {
      ...CHART_GRID,
      ...(showLegend ? { top: GRID_TOP_WITH_LEGEND } : {}),
      ...(isHorizontal && hasBarLabels ? { right: GRID_RIGHT_WITH_BAR_LABEL } : {}),
    },
    legend: {
      ...legendBase(theme, canvas),
      show: showLegend,
    },
    tooltip: {
      ...tooltipBase(theme),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) =>
        formatValue(typeof value === "number" ? value : null, data.unit),
    },
    // El eje de categorías se invierte al girar: sin `inverse` ECharts pone la
    // primera categoría abajo, y una lista ordenada se lee de arriba hacia abajo.
    xAxis: isHorizontal ? values : categories,
    yAxis: isHorizontal ? { ...categories, inverse: true } : values,
    series: data.series.map((series, index) => ({
      name: series.label,
      type: "bar" as const,
      data: [...series.values],
      itemStyle: {
        color: seriesColor(theme, index, series.color),
        borderRadius: isHorizontal ? HORIZONTAL_RADIUS : VERTICAL_RADIUS,
      },
      ...(series.valueLabels
        ? {
            label: {
              show: true,
              position: isHorizontal ? ("right" as const) : ("top" as const),
              color: theme.ink2,
              fontSize: BAR_LABEL_FONT_SIZE,
              formatter: (params: { readonly dataIndex?: number }) =>
                labelAt(series.valueLabels ?? [], params.dataIndex),
            },
          }
        : {}),
    })),
  };
}
