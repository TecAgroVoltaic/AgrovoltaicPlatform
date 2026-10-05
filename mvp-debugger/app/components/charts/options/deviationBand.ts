// La banda de desviación, que es la única pieza de la serie temporal que se
// dibuja con un truco: ECharts no tiene "área entre dos curvas", así que se
// apilan dos series, una base invisible en el borde inferior y encima el grosor
// de la banda con relleno. La resta es geometría del dibujo, no estadística
// nueva: los dos bordes los calculó el backend.
import type { ChartOption } from "@/app/components/charts/echarts";
import type { TimeSeriesLine } from "@/app/components/charts/options/timeSeries";

const BAND_SUFFIX = "banda de desviación";
const BAND_OPACITY = 0.13;

type SeriesItem = Extract<NonNullable<ChartOption["series"]>, readonly unknown[]>[number];

export function bandLabel(line: TimeSeriesLine): string {
  return `${line.label} · ${BAND_SUFFIX}`;
}

export function bandSeries(line: TimeSeriesLine, color: string): SeriesItem[] {
  const band = line.deviationBand ?? [];
  const stack = `band-${line.id}`;
  const invisible = { lineStyle: { opacity: 0 }, symbol: "none" as const, z: 1 };
  return [
    {
      name: `${line.id}-banda-base`,
      type: "line",
      stack,
      silent: true,
      tooltip: { show: false },
      data: band.map((point) => [point.timestamp, point.lower]),
      ...invisible,
    },
    {
      name: bandLabel(line),
      type: "line",
      stack,
      silent: true,
      tooltip: { show: false },
      // La muestra de color de la leyenda sale de `itemStyle`, no del relleno.
      // Sin esto la banda salía en la leyenda con el siguiente color de la
      // paleta (un verde) mientras se dibujaba del color de su curva: la
      // leyenda decía una cosa y el lienzo otra. No se veía porque hasta ahora
      // la leyenda de este gráfico salía recortada.
      itemStyle: { color },
      areaStyle: { color, opacity: BAND_OPACITY },
      data: band.map((point) => [
        point.timestamp,
        point.lower === null || point.upper === null ? null : point.upper - point.lower,
      ]),
      ...invisible,
    },
  ];
}
