import { z } from "zod";

import { nullableNumber, wholeDays } from "@/app/lib/analitica/contracts/comparativa/shared";

export type DiscardedDay = {
  readonly day: string;
  readonly reasons: readonly string[];
  readonly radiationCoverage: number | null;
  readonly electricalCoverage: number | null;
  readonly offsetHours: number | null;
};

const discardedDaySchema = z
  .object({
    dia: z.string(),
    motivos_descarte: z.array(z.string()),
    cobertura_radiacion: nullableNumber,
    cobertura_electrico: nullableNumber,
    desfase_h: nullableNumber,
  })
  .transform((raw): DiscardedDay => ({
    day: raw.dia,
    reasons: raw.motivos_descarte,
    radiationCoverage: raw.cobertura_radiacion ?? null,
    electricalCoverage: raw.cobertura_electrico ?? null,
    offsetHours: raw.desfase_h ?? null,
  }));

export type DayCounts = {
  readonly withData: number;
  readonly valid: number;
  readonly discarded: number;
  /** Solo con `detalle=true`. El anexo de los días que no entraron. */
  readonly discardedDetail: readonly DiscardedDay[] | null;
};

export const dayCountsSchema = z
  .object({
    con_dato: wholeDays,
    validos: wholeDays,
    descartados: wholeDays,
    detalle_descartados: z.array(discardedDaySchema).nullish(),
  })
  .transform((raw): DayCounts => ({
    withData: raw.con_dato,
    valid: raw.validos,
    discarded: raw.descartados,
    discardedDetail: raw.detalle_descartados ?? null,
  }));
