import { z } from "zod";

import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";
import { wholeDays } from "@/app/lib/analitica/contracts/comparativa/shared";

export type ArrayTotals = {
  readonly energy: Metric;
  readonly specificYield: Metric;
  readonly readings: number;
};

export const totalsSchema = z
  .object({
    energia_wh: metricSchema,
    rendimiento_especifico_kwh_kwp: metricSchema,
    lecturas: wholeDays,
  })
  .transform((raw): ArrayTotals => ({
    energy: raw.energia_wh,
    specificYield: raw.rendimiento_especifico_kwh_kwp,
    readings: raw.lecturas,
  }));
