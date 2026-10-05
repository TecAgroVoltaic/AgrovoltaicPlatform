"use client";
// La evolución de una variable con su tendencia, su media móvil y su banda de
// desviación (Fig. 5). Las tres capas las calcula el backend punto a punto.
//
// El vacío se reparte en tres motivos distintos porque son tres problemas
// distintos: `NO_SOURCE` no se arregla nunca, `OUT_OF_COVERAGE` se arregla
// moviendo el rango, y `NO_ROWS` significa que la variable sí existía y aun así
// no hubo lecturas. El backend responde 200 con todo en null para los dos
// últimos, así que si esta vista no los separara, nadie podría.
import { TimeSeriesChart, emptyChart, readyChart, type ChartState, type TimeSeriesData } from "@/app/components/charts";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import { variableSeriesResponseSchema, type SeriesPayload } from "@/app/lib/analitica/contracts/series";
import { availabilityOf } from "@/app/components/analitica/series/availability";
import { pendingChartState } from "@/app/components/analitica/series/chartState";
import { useAnalyticsQuery } from "@/app/components/analitica/series/useAnalyticsQuery";
import {
  describeCoverageOfSeries,
  describeTrend,
  toTimeSeriesData,
} from "@/app/components/analitica/series/seriesChart";
import type { CatalogVariable } from "@/app/lib/analitica/contracts/variables";

const SERIES_PATH = "analitica/series";
const VARIABLE_PARAM = "variables";
const MISSING_SERIES_MESSAGE = "El servicio no devolvió esta variable en su respuesta.";

export type VariableSeriesSectionProps = {
  readonly range: DateRange;
  readonly variable: CatalogVariable;
};

export function VariableSeriesSection({ range, variable }: VariableSeriesSectionProps) {
  const availability = availabilityOf(variable, range);
  const query = useAnalyticsQuery({
    path: SERIES_PATH,
    range,
    schema: variableSeriesResponseSchema,
    query: { [VARIABLE_PARAM]: variable.key },
    enabled: availability.status === "available",
  });

  const state: ChartState<TimeSeriesData> =
    availability.status === "unavailable"
      ? { status: "empty", reason: availability.reason }
      : query.status === "loaded"
        ? readyState(query.data.payload, variable)
        : pendingChartState<TimeSeriesData>(query);

  const movingAverage =
    query.status === "loaded" ? query.data.payload.movingAverageBuckets : null;

  return (
    <>
      {/* El hueco INTERIOR se avisa SIEMPRE, con dato o sin él: es el caso que
          `dato_desde`/`dato_hasta` no puede expresar, y una curva que se ve
          entera puede estar saltándose cuatro meses en medio sin decirlo. */}
      {variable.innerGap ? (
        <p className="rng-aviso" role="status">
          Hueco conocido de esta variable: {variable.innerGap}.
        </p>
      ) : null}
      <TimeSeriesChart
        title={`${variable.label} (${variable.unit})`}
        {...subtitleFor(movingAverage)}
        state={state}
        caption={() => captionFor(query.status === "loaded" ? query.data.payload : null)}
      />
    </>
  );
}

/** Lo único que el subtítulo aportaba y el gráfico no: el ANCHO de la media
 * móvil. El grano y el rango ya los declara la barra de arriba, y «cada punto es
 * un día» describe un eje que se está viendo. */
function subtitleFor(movingAverageBuckets: number | null): { readonly subtitle?: string } {
  if (movingAverageBuckets === null) return {};
  return { subtitle: `Media móvil de ${movingAverageBuckets} tramos.` };
}

function captionFor(payload: SeriesPayload | null): string {
  const series = payload?.series[0];
  if (!series) return "";
  return `${describeTrend(series)} · ${describeCoverageOfSeries(series)}`;
}

function readyState(payload: SeriesPayload, variable: CatalogVariable): ChartState<TimeSeriesData> {
  const series = payload.series.find((candidate) => candidate.key === variable.key);
  if (!series) return emptyChart("NO_ROWS", { message: MISSING_SERIES_MESSAGE });
  if (series.bucketsWithData === 0) {
    return emptyChart("NO_ROWS", {
      message:
        `«${variable.label}» ya existía en el rango, pero no hay ni una lectura ` +
        `suya en sus ${series.points.length} tramos.`,
      ...(variable.innerGap ? { hint: `Hueco conocido: ${variable.innerGap}.` } : {}),
    });
  }
  return readyChart(toTimeSeriesData(series));
}
