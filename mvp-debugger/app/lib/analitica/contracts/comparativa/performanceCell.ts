import { z } from "zod";

import {
  nullableNumber,
  wholeDays,
  type ArrayKey,
  type EnergySource,
  type IrradianceInput,
} from "@/app/lib/analitica/contracts/comparativa/shared";

/** Un PR agregado del período, con todo lo que hace falta para no leerlo mal. */
export type PerformanceCell = {
  readonly pr: number | null;
  readonly days: number;
  readonly daysAboveOne: number;
  readonly maxDailyPr: number | null;
  /** Un PR > 1 es imposible: lo marca el backend, acá no se decide nada. */
  readonly exceedsPhysicalLimit: boolean;
  /** Por qué ese PR no se puede leer como rendimiento. Ya viene redactado. */
  readonly warning: string | null;
  /** Por qué no hay número (`sin_lecturas`, `fuera_de_cobertura`). */
  readonly reason: string | null;
};

export const cellSchema = z
  .object({
    pr: z.number().nullable(),
    dias: wholeDays,
    dias_pr_mayor_a_uno: wholeDays,
    pr_diario_maximo: nullableNumber,
    supera_limite_fisico: z.boolean().nullish(),
    aviso: z.string().nullish(),
    motivo: z.string().nullish(),
  })
  .transform((raw): PerformanceCell => ({
    pr: raw.pr,
    days: raw.dias,
    daysAboveOne: raw.dias_pr_mayor_a_uno,
    maxDailyPr: raw.pr_diario_maximo ?? null,
    exceedsPhysicalLimit: raw.supera_limite_fisico === true,
    warning: raw.aviso ?? null,
    reason: raw.motivo ?? null,
  }));

export type PerformancePair = Readonly<Record<ArrayKey, PerformanceCell>>;
export type PerformanceMatrix = Readonly<
  Record<EnergySource, Readonly<Record<IrradianceInput, PerformancePair>>>
>;
