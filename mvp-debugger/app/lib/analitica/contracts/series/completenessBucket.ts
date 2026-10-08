import { z } from "zod";

import { cadenceOriginSchema, type CadenceOrigin } from "@/app/lib/analitica/contracts/series/cadenceOrigin";

export type CompletenessBucket = {
  readonly period: string;
  readonly readings: number;
  readonly expected: number;
  readonly cadenceSeconds: number;
  readonly cadenceOrigin: CadenceOrigin;
};

export const bucketSchema = z
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
