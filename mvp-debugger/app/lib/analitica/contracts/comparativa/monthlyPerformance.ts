import { z } from "zod";

import {
  byArray,
  byInput,
  bySource,
  type ArrayKey,
  type EnergySource,
  type IrradianceInput,
} from "@/app/lib/analitica/contracts/comparativa/shared";

export type MonthlyPr = Readonly<
  Record<EnergySource, Readonly<Record<IrradianceInput, Readonly<Record<ArrayKey, number | null>>>>>
>;

export type MonthlyPerformance = {
  readonly month: string;
  readonly pr: MonthlyPr;
  /** Rutas `fuente/insumo/arreglo` que superan el límite físico ese mes. */
  readonly exceedsPhysicalLimit: readonly string[];
};

export const monthlySchema = z
  .object({
    mes: z.string(),
    pr: bySource(byInput(byArray(z.number().nullable()))),
    supera_limite_fisico: z.array(z.string()).nullish(),
  })
  .transform((raw): MonthlyPerformance => ({
    month: raw.mes,
    pr: raw.pr,
    exceedsPhysicalLimit: raw.supera_limite_fisico ?? [],
  }));
