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
import {
  overlays,
  roleFormatter,
  toPairs,
  type SeriesList,
} from "@/app/components/charts/options/timeSeries/overlays";
import type { TimeSeriesData } from "@/app/components/charts/options/timeSeries/types";
import { seriesColor, type ChartTheme } from "@/app/components/charts/theme";
import type { ChartCanvas } from "@/app/components/charts/options/canvas";
import type { ChartOption } from "@/app/components/charts/echarts";

export type {
  TimeSeriesBandPoint,
  TimeSeriesData,
  TimeSeriesLine,
  TimeSeriesPoint,
} from "@/app/components/charts/options/timeSeries/types";

const GRID_TOP_WITH_LEGEND = 34;
const LINE_WIDTH = 2;

/** true si hay al menos un punto medido. Sin esto, un rango con todo en NULL
 * dibujaría ejes vacíos en vez de decir que no hay dato. */
export function hasPlottableTimeSeries(data: TimeSeriesData): boolean {
  return data.lines.some((line) => line.points.some((point) => point.value !== null));
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
