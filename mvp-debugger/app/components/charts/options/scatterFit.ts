// Nube de puntos con su recta de ajuste (irradiancia contra potencia, Fig. 8).
//
// El ajuste (pendiente, intersección y R²) llega calculado del backend: acá solo
// se dibujan los dos extremos de esa recta. Recalcularlo en el navegador
// permitiría que la consola y el agente den dos rectas distintas del mismo dato.
import { baseOption, formatValue, tooltipBase, valueAxis } from "@/app/components/charts/options/base";
import { seriesColor, type ChartTheme, type SeriesColorToken } from "@/app/components/charts/theme";
import type { ChartOption } from "@/app/components/charts/echarts";

export type ScatterPoint = {
  readonly x: number;
  readonly y: number;
  /** Qué es el punto (un día, una hora): sin esto el hover no dice nada útil. */
  readonly label?: string;
};

export type LinearFit = {
  readonly slope: number;
  readonly intercept: number;
  readonly r2: number;
};

export type ScatterFitData = {
  readonly points: readonly ScatterPoint[];
  /** `null` cuando el backend no pudo ajustar (pocos puntos, x constante). */
  readonly fit: LinearFit | null;
  readonly xUnit: string;
  readonly yUnit: string;
  readonly color?: SeriesColorToken;
};

const POINT_SIZE = 6;
const POINT_OPACITY = 0.6;
const FIT_WIDTH = 1.8;
const FIT_LABEL = "ajuste lineal";
const POINTS_LABEL = "mediciones";
const FIT_DECIMALS = 3;

export function hasPlottableScatter(data: ScatterFitData): boolean {
  return data.points.length > 0;
}

/** La ecuación y el R², para el pie del gráfico. El PDF los pide a la vista. */
export function describeFit(fit: LinearFit, xUnit: string, yUnit: string): string {
  const slope = formatValue(fit.slope, "", FIT_DECIMALS);
  const intercept = formatValue(Math.abs(fit.intercept), "", FIT_DECIMALS);
  const sign = fit.intercept < 0 ? "−" : "+";
  const r2 = formatValue(fit.r2, "", FIT_DECIMALS);
  return `y = ${slope}·x ${sign} ${intercept} (R² = ${r2}), con x en ${xUnit} e y en ${yUnit}`;
}

export function buildScatterFitOption(data: ScatterFitData, theme: ChartTheme): ChartOption {
  const color = seriesColor(theme, 0, data.color);
  return {
    ...baseOption(theme),
    tooltip: {
      ...tooltipBase(theme),
      trigger: "item",
      formatter: (params) => formatPointTooltip(params, data),
    },
    xAxis: valueAxis(theme, data.xUnit),
    yAxis: valueAxis(theme, data.yUnit),
    series: [
      {
        name: POINTS_LABEL,
        type: "scatter",
        symbolSize: POINT_SIZE,
        itemStyle: { color, opacity: POINT_OPACITY },
        data: data.points.map((point) => [point.x, point.y]),
      },
      ...fitSeries(data, theme),
    ],
  };
}

function fitSeries(data: ScatterFitData, theme: ChartTheme) {
  const fit = data.fit;
  if (!fit || data.points.length === 0) return [];
  const xs = data.points.map((point) => point.x);
  const ends = [Math.min(...xs), Math.max(...xs)];
  return [
    {
      name: FIT_LABEL,
      type: "line" as const,
      showSymbol: false,
      silent: true,
      lineStyle: { color: theme.ink2, width: FIT_WIDTH, type: "dashed" as const },
      data: ends.map((x) => [x, fit.slope * x + fit.intercept]),
    },
  ];
}

function formatPointTooltip(params: unknown, data: ScatterFitData): string {
  if (typeof params !== "object" || params === null) return "";
  const index = "dataIndex" in params && typeof params.dataIndex === "number" ? params.dataIndex : null;
  const seriesName = "seriesName" in params ? params.seriesName : null;
  if (seriesName !== POINTS_LABEL || index === null) return "";
  const point = data.points[index];
  if (!point) return "";
  const head = point.label ? `${point.label}<br/>` : "";
  return `${head}${formatValue(point.x, data.xUnit)}<br/>${formatValue(point.y, data.yUnit)}`;
}
