// Fig. 6, panel GHI: irradiación acumulada por mes.
import { z } from "zod";

import { analysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema } from "@/app/lib/analitica/contracts/metric";
import { countSchema, variableSchema } from "@/app/lib/analitica/contracts/estadistica/shared";

const monthlyIrradiationSchema = z
  .object({ mes: z.string(), dias_con_dato: countSchema, irradiacion: metricSchema })
  .transform((raw) => ({
    month: raw.mes,
    daysWithData: raw.dias_con_dato,
    irradiation: raw.irradiacion,
  }));

export type MonthlyIrradiation = z.infer<typeof monthlyIrradiationSchema>;

export const irradiationResponseSchema = analysisResponse({
  variable: variableSchema,
  barras: z.array(monthlyIrradiationSchema),
  total: metricSchema,
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: { variable: payload.variable, bars: payload.barras, total: payload.total },
}));

export type IrradiationResponse = z.infer<typeof irradiationResponseSchema>;
