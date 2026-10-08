import { z } from "zod";

import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";

export type SpecificYield = { readonly period: Metric; readonly annualized: Metric };

export const specificYieldSchema = z
  .object({
    periodo_kwh_kwp: metricSchema,
    anualizado_sobre_dias_con_datos_kwh_kwp_ano: metricSchema,
  })
  .transform((raw): SpecificYield => ({
    period: raw.periodo_kwh_kwp,
    annualized: raw.anualizado_sobre_dias_con_datos_kwh_kwp_ano,
  }));
