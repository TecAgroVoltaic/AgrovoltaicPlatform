// El umbral del gráfico de crestas: el eje estirado hasta él y la línea que lo marca.
import { valueAxis } from "@/app/components/charts/options/base";
import type { RidgelineData } from "@/app/components/charts/options/ridgeline/types";
import type { ChartTheme } from "@/app/components/charts/theme";

/** Sitio que se deja pasado el umbral cuando cae fuera de lo medido, como
 *  fracción del rango medido. */
const THRESHOLD_MARGIN_SHARE = 0.06;

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
export function thresholdAwareAxis(data: RidgelineData, theme: ChartTheme) {
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

export function thresholdMark(data: RidgelineData, theme: ChartTheme) {
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
