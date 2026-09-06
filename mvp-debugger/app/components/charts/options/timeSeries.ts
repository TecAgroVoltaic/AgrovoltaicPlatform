// Serie temporal: la curva medida y, encima, lo que el backend ya calculó
// (tendencia, media móvil y banda de desviación). Acá NO se calcula estadística:
// si un número no vino del backend, no se dibuja.
import {
  formatValue,
  baseOption,
  legendBase,
  timeAxis,
  tooltipBase,
  valueAxis,
} from "@/app/components/charts/options/base";
import { bandLabel, bandSeries } from "@/app/components/charts/options/deviationBand";
import { seriesColor, type ChartTheme, type SeriesColorToken } from "@/app/components/charts/theme";
import type { ChartCanvas } from "@/app/components/charts/options/canvas";
import type { ChartOption } from "@/app/components/charts/echarts";

export type TimeSeriesPoint = { readonly timestamp: string; readonly value: number | null };

export type TimeSeriesBandPoint = {
  readonly timestamp: string;
  readonly lower: number | null;
  readonly upper: number | null;
};

export type TimeSeriesLine = {
  readonly id: string;
  readonly label: string;
  readonly points: readonly TimeSeriesPoint[];
  readonly color?: SeriesColorToken;
  /** Recta de tendencia del período, ya ajustada por el backend. */
  readonly trend?: readonly TimeSeriesPoint[];
  readonly movingAverage?: readonly TimeSeriesPoint[];
  readonly deviationBand?: readonly TimeSeriesBandPoint[];
};

export type TimeSeriesData = {
  readonly lines: readonly TimeSeriesLine[];
  readonly unit: string;
};

const TREND_SUFFIX = "tendencia";
const AVERAGE_SUFFIX = "media móvil";
/** Cómo se llama la curva medida en la leyenda cuando el nombre de la variable
 *  ya no hace falta escribirlo (ver `roleFormatter`). */
const MEASURED_LABEL = "medición";
const GRID_TOP_WITH_LEGEND = 34;
const OVERLAY_WIDTH = 1.4;
const LINE_WIDTH = 2;
const SEPARATOR = " · ";

/** true si hay al menos un punto medido. Sin esto, un rango con todo en NULL
 * dibujaría ejes vacíos en vez de decir que no hay dato. */
export function hasPlottableTimeSeries(data: TimeSeriesData): boolean {
  return data.lines.some((line) => line.points.some((point) => point.value !== null));
}

type SeriesItem = Extract<NonNullable<ChartOption["series"]>, readonly unknown[]>[number];
type SeriesList = SeriesItem[];

/**
 * Cómo se escribe cada ítem de la leyenda cuando hay UNA sola variable.
 *
 * Con una sola línea, sus cuatro series se llaman "X", "X · tendencia",
 * "X · media móvil" y "X · banda de desviación", y ese nombre de variable ya
 * está escrito en el título del gráfico, dos líneas más arriba. A 286 px las
 * cuatro entradas se recortan por donde SE DIFERENCIAN y quedan idénticas. Se
 * muestra el papel de cada curva y se deja el nombre donde ya estaba.
 *
 * Cambia lo que se LEE, no cómo se llaman las series: el tooltip sigue diciendo
 * el nombre completo. Con dos o más líneas no se toca nada, porque ahí el
 * prefijo es lo único que distingue el Inclinado del Vertical.
 */
function roleFormatter(lines: readonly TimeSeriesLine[]) {
  if (lines.length !== 1) return {};
  const only = lines[0].label;
  const prefix = `${only}${SEPARATOR}`;
  return {
    formatter: (name: string) => {
      if (name === only) return MEASURED_LABEL;
      return name.startsWith(prefix) ? name.slice(prefix.length) : name;
    },
  };
}

export function buildTimeSeriesOption(
  data: TimeSeriesData,
  theme: ChartTheme,
  canvas: ChartCanvas,
): ChartOption {
  const series: SeriesList = [];
  const legendNames: string[] = [];

  data.lines.forEach((line, index) => {
    const color = seriesColor(theme, index, line.color);
    if (line.deviationBand) series.push(...bandSeries(line, color));
    series.push({
      name: line.label,
      type: "line",
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: LINE_WIDTH, color },
      itemStyle: { color },
      data: toPairs(line.points),
    });
    legendNames.push(line.label);
    if (line.deviationBand) legendNames.push(bandLabel(line));
    for (const overlay of overlays(line, color)) {
      series.push(overlay);
      legendNames.push(String(overlay.name));
    }
  });

  const showLegend = legendNames.length > 1;
  return {
    ...baseOption(theme),
    ...(showLegend ? { grid: { ...baseOption(theme).grid, top: GRID_TOP_WITH_LEGEND } } : {}),
    legend: {
      ...legendBase(theme, canvas),
      ...roleFormatter(data.lines),
      show: showLegend,
      data: legendNames,
    },
    tooltip: {
      ...tooltipBase(theme),
      trigger: "axis",
      valueFormatter: (value) =>
        formatValue(typeof value === "number" ? value : null, data.unit),
    },
    xAxis: timeAxis(theme),
    yAxis: valueAxis(theme, data.unit),
    series,
  };
}

function toPairs(points: readonly TimeSeriesPoint[]): [string, number | null][] {
  return points.map((point) => [point.timestamp, point.value]);
}

function overlays(line: TimeSeriesLine, color: string): SeriesList {
  const built: SeriesList = [];
  if (line.trend) {
    built.push(dashedLine(`${line.label}${SEPARATOR}${TREND_SUFFIX}`, line.trend, color, [6, 4]));
  }
  if (line.movingAverage) {
    built.push(
      dashedLine(`${line.label}${SEPARATOR}${AVERAGE_SUFFIX}`, line.movingAverage, color, [2, 3]),
    );
  }
  return built;
}

function dashedLine(
  name: string,
  points: readonly TimeSeriesPoint[],
  color: string,
  dash: [number, number],
) {
  return {
    name,
    type: "line" as const,
    showSymbol: false,
    connectNulls: false,
    lineStyle: { width: OVERLAY_WIDTH, color, type: dash },
    itemStyle: { color },
    data: toPairs(points),
  };
}
