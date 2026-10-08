import { z } from "zod";

import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";
import { pointSchema, type SeriesPoint } from "@/app/lib/analitica/contracts/series/seriesPoint";

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

export const variableSeriesSchema = z
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
