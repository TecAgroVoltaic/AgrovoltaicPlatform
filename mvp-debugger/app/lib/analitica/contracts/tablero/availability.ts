import { z } from "zod";

import { wholeDays } from "@/app/lib/analitica/contracts/primitives";

/** La planta parada: una AVERÍA del equipo, no un problema del dato. Tiene tipo
 * propio para que ninguna vista la funda con la calidad. */
export type Availability = {
  readonly stoppedDays: number;
  readonly stoppedUnderSunDays: number;
  readonly ofDaysWithData: number;
  readonly warning: string;
};

export const availabilitySchema = z
  .object({
    dias_con_planta_parada: wholeDays,
    dias_parada_bajo_sol: wholeDays,
    de_dias_con_datos: wholeDays,
    advertencia: z.string(),
  })
  .transform((raw): Availability => ({
    stoppedDays: raw.dias_con_planta_parada,
    stoppedUnderSunDays: raw.dias_parada_bajo_sol,
    ofDaysWithData: raw.de_dias_con_datos,
    warning: raw.advertencia,
  }));
