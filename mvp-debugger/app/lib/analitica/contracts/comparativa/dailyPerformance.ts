import { z } from "zod";

import {
  byArray,
  bySource,
  type ArrayKey,
  type EnergySource,
} from "@/app/lib/analitica/contracts/comparativa/shared";

/** Un día del renglón diario. El motivo de descarte NO se repite acá: viaja en
 *  el anexo `discardedDetail`, que es donde se lee día por día. */
export type DailyPerformance = {
  readonly day: string;
  readonly valid: boolean;
  readonly pr: Readonly<Record<EnergySource, Readonly<Record<ArrayKey, number | null>>>>;
};

export const dailySchema = z
  .object({
    dia: z.string(),
    valido: z.boolean(),
    pr: z.object({ por_fuente: bySource(byArray(z.number().nullable())) }),
  })
  .transform((raw): DailyPerformance => ({
    day: raw.dia,
    valid: raw.valido,
    pr: raw.pr.por_fuente,
  }));
