import { z } from "zod";

import { cadenceOriginSchema, type CadenceOrigin } from "@/app/lib/analitica/contracts/series/cadenceOrigin";
import { gapSchema, type DataGap } from "@/app/lib/analitica/contracts/series/dataGap";

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

export const summarySchema = z
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
