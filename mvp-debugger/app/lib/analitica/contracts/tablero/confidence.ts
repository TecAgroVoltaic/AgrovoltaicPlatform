import { z } from "zod";

import { wholeDays } from "@/app/lib/analitica/contracts/primitives";
import { availabilitySchema, type Availability } from "@/app/lib/analitica/contracts/tablero/availability";

export type DashboardConfidence = {
  readonly daysInRange: number;
  readonly daysWithData: number;
  readonly usableDays: number;
  readonly coverage: number;
  readonly warning: string | null;
  readonly availability: Availability | null;
};

const confidenceSchema = z
  .object({
    dias_en_rango: wholeDays,
    dias_con_datos: wholeDays,
    dias_utilizables: wholeDays,
    cobertura: z.number(),
    advertencia: z.string().nullish(),
    disponibilidad: availabilitySchema.nullish(),
  })
  .transform((raw): DashboardConfidence => ({
    daysInRange: raw.dias_en_rango,
    daysWithData: raw.dias_con_datos,
    usableDays: raw.dias_utilizables,
    coverage: raw.cobertura,
    warning: raw.advertencia ?? null,
    availability: raw.disponibilidad ?? null,
  }));

/** Perder el contexto es malo; perder las nueve casillas por un campo nuevo en
 * el contexto sería peor. Por eso se lee con `safeParse` y no dentro del sobre. */
export function readConfidence(raw: unknown): DashboardConfidence | null {
  const parsed = confidenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
