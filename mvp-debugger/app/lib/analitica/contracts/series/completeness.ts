// Contrato de `/analitica/completitud`: qué hay de cada fuente física.
import { z } from "zod";

import { analysisResponse, type AnalysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { bucketSchema, type CompletenessBucket } from "@/app/lib/analitica/contracts/series/completenessBucket";
import { granularitySchema } from "@/app/lib/analitica/contracts/series/granularitySchema";
import { summarySchema, type SourceSummary } from "@/app/lib/analitica/contracts/series/sourceSummary";
import type { Granularity } from "@/app/lib/analitica/granularity";

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
