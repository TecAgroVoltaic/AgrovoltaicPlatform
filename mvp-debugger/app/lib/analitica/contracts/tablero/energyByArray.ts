import { z } from "zod";

import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";

/** Las tres energías de una ventana: el total AC y cada arreglo. */
export type EnergyByArray = {
  readonly totalAc: Metric;
  readonly tilted: Metric;
  readonly vertical: Metric;
};

export const energyByArraySchema = z
  .object({ total_ac_kwh: metricSchema, inclinado_kwh: metricSchema, vertical_kwh: metricSchema })
  .transform((raw): EnergyByArray => ({
    totalAc: raw.total_ac_kwh,
    tilted: raw.inclinado_kwh,
    vertical: raw.vertical_kwh,
  }));
