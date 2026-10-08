// Contrato de `/analitica/series`: cómo evoluciona cada variable.
import { z } from "zod";

import { analysisResponse, type AnalysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { variableSeriesSchema, type VariableSeries } from "@/app/lib/analitica/contracts/series/variableSeries";

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
