import { z } from "zod";

import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";
import { wholeDays } from "@/app/lib/analitica/contracts/primitives";

/** Las DOS respuestas a «cuánta energía»: la que quedó registrada y la que
 * produjo la planta. `unrecorded` es la diferencia y la manda el backend: acá no
 * se resta nada. */
export type EnergyAccounts = {
  readonly recorded: Metric;
  readonly plant: Metric;
  readonly unrecorded: Metric;
  readonly daysWithAcClose: number;
  readonly daysWithLifetimeCounter: number;
};

export const accountsSchema = z
  .object({
    registrada_kwh: metricSchema,
    planta_kwh: metricSchema,
    no_registrada_kwh: metricSchema,
    dias_con_cierre_ac: wholeDays,
    dias_con_contador_de_vida: wholeDays,
  })
  .transform((raw): EnergyAccounts => ({
    recorded: raw.registrada_kwh,
    plant: raw.planta_kwh,
    unrecorded: raw.no_registrada_kwh,
    daysWithAcClose: raw.dias_con_cierre_ac,
    daysWithLifetimeCounter: raw.dias_con_contador_de_vida,
  }));
