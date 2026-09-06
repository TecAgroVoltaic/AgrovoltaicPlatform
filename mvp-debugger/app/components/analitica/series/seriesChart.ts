// De la respuesta de `/analitica/series` a lo que dibuja `TimeSeriesChart`.
//
// Acá NO se calcula nada: la tendencia, la media móvil y los dos bordes de la
// banda vienen resueltos del backend, punto a punto. Lo único que se decide es si
// una capa se dibuja, y se decide MIRÁNDOLA: una media móvil que llegó entera en
// null no se pasa, porque produciría una entrada de leyenda sin curva debajo.
//
// Los nulls de `points` se conservan tal cual, y ese es el detalle que importa:
// `TimeSeriesChart` va con `connectNulls: false` sobre un eje de tiempo, así que
// cada bucket vacío corta la línea y ocupa su lugar en el eje. Un hueco de 126
// días se ve como 126 días de nada, no como una recta entre sus dos extremos.
import { isMeasured } from "@/app/lib/analitica/contracts/metric";
import type { TimeSeriesData, TimeSeriesPoint } from "@/app/components/charts";
import type { SeriesPoint, VariableSeries } from "@/app/lib/analitica/contracts/series";

const LOCALE = "es-CR";
const SLOPE_DECIMALS = 3;
const R_SQUARED_DECIMALS = 3;

type PointReader = (point: SeriesPoint) => number | null;

/** null si ninguna capa trae un solo valor: no hay curva que dibujar. */
function layer(points: readonly SeriesPoint[], read: PointReader): readonly TimeSeriesPoint[] | null {
  if (!points.some((point) => read(point) !== null)) return null;
  return points.map((point) => ({ timestamp: point.timestamp, value: read(point) }));
}

export function toTimeSeriesData(series: VariableSeries): TimeSeriesData {
  const trend = layer(series.points, (point) => point.trend);
  const movingAverage = layer(series.points, (point) => point.movingAverage);
  const hasBand = series.points.some((point) => point.bandLower !== null);
  return {
    unit: series.unit,
    lines: [
      {
        id: series.key,
        label: series.label,
        points: series.points.map((point) => ({ timestamp: point.timestamp, value: point.value })),
        ...(trend ? { trend } : {}),
        ...(movingAverage ? { movingAverage } : {}),
        ...(hasBand
          ? {
              deviationBand: series.points.map((point) => ({
                timestamp: point.timestamp,
                lower: point.bandLower,
                upper: point.bandUpper,
              })),
            }
          : {}),
      },
    ],
  };
}

function decimal(value: number, digits: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

/** La pendiente del ajuste con su unidad y su R2, o por qué no hay ajuste. */
export function describeTrend(series: VariableSeries): string {
  if (!isMeasured(series.slope)) return `Sin tendencia: ${series.slope.reason}`;
  const slope = `${decimal(series.slope.value, SLOPE_DECIMALS)} ${series.slope.unit}`;
  const fit = series.rSquared === null ? "" : ` (R² ${decimal(series.rSquared, R_SQUARED_DECIMALS)})`;
  return `Tendencia ${slope}${fit}`;
}

/** Cuántos buckets traen medición contra cuántos abarca el rango. Que la línea
 *  no cruce los huecos se VE en el gráfico, así que no se escribe. */
export function describeCoverageOfSeries(series: VariableSeries): string {
  return `${series.bucketsWithData} de ${series.points.length} tramos con medición`;
}
