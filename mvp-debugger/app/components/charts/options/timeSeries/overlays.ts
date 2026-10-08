// Las curvas que el backend ya calculó y se dibujan encima de la medida
// (tendencia y media móvil), y cómo se rotulan en la leyenda.
import type { ChartOption } from "@/app/components/charts/echarts";
import type { TimeSeriesLine, TimeSeriesPoint } from "@/app/components/charts/options/timeSeries/types";

const TREND_SUFFIX = "tendencia";
const AVERAGE_SUFFIX = "media móvil";
/** Cómo se llama la curva medida en la leyenda cuando el nombre de la variable
 *  ya no hace falta escribirlo (ver `roleFormatter`). */
const MEASURED_LABEL = "medición";
const OVERLAY_WIDTH = 1.4;
const SEPARATOR = " · ";
const TREND_DASH: readonly [number, number] = [6, 4];
const AVERAGE_DASH: readonly [number, number] = [2, 3];

type SeriesItem = Extract<NonNullable<ChartOption["series"]>, readonly unknown[]>[number];
export type SeriesList = SeriesItem[];

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
export function roleFormatter(lines: readonly TimeSeriesLine[]) {
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

export function toPairs(points: readonly TimeSeriesPoint[]): [string, number | null][] {
  return points.map((point) => [point.timestamp, point.value]);
}

export function overlays(line: TimeSeriesLine, color: string): SeriesList {
  const built: SeriesList = [];
  if (line.trend) {
    built.push(dashedLine(`${line.label}${SEPARATOR}${TREND_SUFFIX}`, line.trend, color, [...TREND_DASH]));
  }
  if (line.movingAverage) {
    built.push(
      dashedLine(`${line.label}${SEPARATOR}${AVERAGE_SUFFIX}`, line.movingAverage, color, [...AVERAGE_DASH]),
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
