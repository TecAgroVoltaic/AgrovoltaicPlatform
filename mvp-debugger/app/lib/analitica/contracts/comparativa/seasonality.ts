import { z } from "zod";

import { nullableNumber, wholeDays } from "@/app/lib/analitica/contracts/comparativa/shared";

export type SeasonalMonth = {
  readonly month: string;
  readonly coverage: number;
  readonly daysWithData: number;
  readonly tiltedWh: number | null;
  readonly verticalWh: number | null;
};

export type DiscardedMonth = {
  readonly month: string;
  readonly coverage: number;
  readonly reason: string;
};

export type Seasonality = {
  readonly sufficient: boolean;
  readonly months: readonly SeasonalMonth[];
  readonly discarded: readonly DiscardedMonth[];
  readonly minCoverage: number;
  readonly warning: string | null;
};

export const seasonalitySchema = z
  .object({
    suficiente: z.boolean(),
    meses: z.array(
      z.object({
        mes: z.string(),
        cobertura: z.number(),
        dias_con_datos: wholeDays,
        energia_inclinado_wh: nullableNumber,
        energia_vertical_wh: nullableNumber,
      }),
    ),
    descartados: z.array(
      z.object({ mes: z.string(), cobertura: z.number(), motivo: z.string() }),
    ),
    cobertura_minima: z.number(),
    advertencia: z.string().nullish(),
  })
  .transform((raw): Seasonality => ({
    sufficient: raw.suficiente,
    months: raw.meses.map((month) => ({
      month: month.mes,
      coverage: month.cobertura,
      daysWithData: month.dias_con_datos,
      tiltedWh: month.energia_inclinado_wh ?? null,
      verticalWh: month.energia_vertical_wh ?? null,
    })),
    discarded: raw.descartados.map((month) => ({
      month: month.mes,
      coverage: month.cobertura,
      reason: month.motivo,
    })),
    minCoverage: raw.cobertura_minima,
    warning: raw.advertencia ?? null,
  }));
