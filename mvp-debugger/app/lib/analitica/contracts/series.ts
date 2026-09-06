// Los dos contratos de la vista Series, derivados del payload REAL de
// `/analitica/completitud` y `/analitica/series` (inspeccionados el 2026-09-01),
// no de la documentación. Van juntos porque son las dos caras de una sola
// pregunta ("qué hay y cómo evoluciona") y se consumen siempre a la vez; por eso
// el archivo pasa de las 150 líneas de referencia.
//
// Lo que el backend YA manda y por eso acá no se calcula: los tramos sin dato
// vienen contados (`tramos_sin_datos`) y la serie trae un punto por CADA bucket
// del calendario, con `valor: null` donde no hubo ninguna lectura. Ese null es lo
// que corta la línea sobre el hueco de 126 días: si se perdiera al traducir, el
// gráfico volvería a unir enero con abril con una recta.
import { z } from "zod";

import { analysisResponse, type AnalysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";
import { granularityFromWire, type Granularity } from "@/app/lib/analitica/granularity";

/** Cómo se supo la cadencia contra la que se midió lo esperado. `nominal` avisa
 *  de que el período no tenía ni una fila con la que medirla. */
export type CadenceOrigin = "measured" | "nominal";

const cadenceOriginSchema = z
  .enum(["medida", "nominal"])
  .transform((raw): CadenceOrigin => (raw === "medida" ? "measured" : "nominal"));

const granularitySchema = z.string().transform((raw, ctx): Granularity => {
  const granularity = granularityFromWire(raw);
  if (!granularity) {
    ctx.addIssue({ code: "custom", message: `granularidad desconocida: ${raw}` });
    return z.NEVER;
  }
  return granularity;
});

export type CompletenessBucket = {
  readonly period: string;
  readonly readings: number;
  readonly expected: number;
  readonly cadenceSeconds: number;
  readonly cadenceOrigin: CadenceOrigin;
};

const bucketSchema = z
  .object({
    periodo: z.string(),
    lecturas: z.number(),
    esperadas: z.number(),
    cadencia_seg: z.number(),
    cadencia_origen: cadenceOriginSchema,
  })
  .transform((raw): CompletenessBucket => ({
    period: raw.periodo,
    readings: raw.lecturas,
    expected: raw.esperadas,
    cadenceSeconds: raw.cadencia_seg,
    cadenceOrigin: raw.cadencia_origen,
  }));

/** Tramo del calendario sin una sola fila. Lo cuenta el backend. */
export type DataGap = { readonly from: string; readonly to: string; readonly days: number };

const gapSchema = z
  .object({ desde: z.string(), hasta: z.string(), dias: z.number() })
  .transform((raw): DataGap => ({ from: raw.desde, to: raw.hasta, days: raw.dias }));

export type SourceSummary = {
  readonly cadenceSeconds: number;
  readonly cadenceOrigin: CadenceOrigin;
  readonly calendarDays: number;
  readonly daysWithData: number;
  readonly readings: number;
  readonly expectedReadings: number;
  readonly completeness: number;
  readonly gaps: readonly DataGap[];
};

const summarySchema = z
  .object({
    cadencia_seg: z.number(),
    cadencia_origen: cadenceOriginSchema,
    dias_calendario: z.number(),
    dias_con_datos: z.number(),
    lecturas: z.number(),
    lecturas_esperadas: z.number(),
    completitud: z.number(),
    tramos_sin_datos: z.array(gapSchema),
  })
  .transform((raw): SourceSummary => ({
    cadenceSeconds: raw.cadencia_seg,
    cadenceOrigin: raw.cadencia_origen,
    calendarDays: raw.dias_calendario,
    daysWithData: raw.dias_con_datos,
    readings: raw.lecturas,
    expectedReadings: raw.lecturas_esperadas,
    completeness: raw.completitud,
    gaps: raw.tramos_sin_datos,
  }));

/** Una fuente física (`electrico`, `radiacion`) con sus barras y su resumen. */
export type CompletenessSource = {
  readonly key: string;
  readonly buckets: readonly CompletenessBucket[];
  readonly summary: SourceSummary;
};

export type CompletenessPayload = {
  readonly granularity: Granularity;
  /** true si el backend engordó el grano pedido por ser demasiado fino. */
  readonly degraded: boolean;
  readonly sources: readonly CompletenessSource[];
  readonly note?: string;
};

export const completenessSchema = analysisResponse({
  granularidad_serie: granularitySchema,
  granularidad_degradada: z.boolean(),
  series: z.record(z.string(), z.array(bucketSchema)),
  resumen: z.record(z.string(), summarySchema),
  nota: z.string().nullish(),
}).transform(({ window, confidence, payload }): AnalysisResponse<CompletenessPayload> => ({
  window,
  confidence,
  payload: {
    granularity: payload.granularidad_serie,
    degraded: payload.granularidad_degradada,
    sources: Object.entries(payload.resumen).map(([key, summary]) => ({
      key,
      summary,
      buckets: payload.series[key] ?? [],
    })),
    ...(payload.nota ? { note: payload.nota } : {}),
  },
}));

export type SeriesPoint = {
  readonly timestamp: string;
  readonly value: number | null;
  readonly bandLower: number | null;
  readonly bandUpper: number | null;
  readonly movingAverage: number | null;
  readonly trend: number | null;
};

const pointSchema = z
  .object({
    t: z.string(),
    valor: z.number().nullable(),
    banda_inferior: z.number().nullable(),
    banda_superior: z.number().nullable(),
    media_movil: z.number().nullable(),
    tendencia: z.number().nullable(),
  })
  .transform((raw): SeriesPoint => ({
    timestamp: raw.t,
    value: raw.valor,
    bandLower: raw.banda_inferior,
    bandUpper: raw.banda_superior,
    movingAverage: raw.media_movil,
    trend: raw.tendencia,
  }));

export type VariableSeries = {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly points: readonly SeriesPoint[];
  /** Buckets con medición. El resto son huecos del calendario. */
  readonly bucketsWithData: number;
  readonly slope: Metric;
  readonly rSquared: number | null;
};

const variableSeriesSchema = z
  .object({
    clave: z.string(),
    etiqueta: z.string(),
    unidad: z.string(),
    puntos: z.array(pointSchema),
    n_con_dato: z.number(),
    tendencia: z.object({ pendiente: metricSchema, r2: z.number().nullable() }),
  })
  .transform((raw): VariableSeries => ({
    key: raw.clave,
    label: raw.etiqueta,
    unit: raw.unidad,
    points: raw.puntos,
    bucketsWithData: raw.n_con_dato,
    slope: raw.tendencia.pendiente,
    rSquared: raw.tendencia.r2,
  }));

export type SeriesPayload = {
  /** Ancho de la media móvil, en buckets. Lo elige el backend. */
  readonly movingAverageBuckets: number;
  readonly series: readonly VariableSeries[];
};

export const variableSeriesResponseSchema = analysisResponse({
  buckets_media_movil: z.number(),
  series: z.array(variableSeriesSchema),
}).transform(({ window, confidence, payload }): AnalysisResponse<SeriesPayload> => ({
  window,
  confidence,
  payload: {
    movingAverageBuckets: payload.buckets_media_movil,
    series: payload.series,
  },
}));
