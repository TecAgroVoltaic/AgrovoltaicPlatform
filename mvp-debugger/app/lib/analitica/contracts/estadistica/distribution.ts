// Fig. 6, panel superior: una caja por mes.
import { z } from "zod";

import { analysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { countSchema, nullableNumber, variableSchema } from "@/app/lib/analitica/contracts/estadistica/shared";

// Los bigotes NO son el mínimo y el máximo: llegan al dato más extremo dentro de
// la valla 1,5·IQR. Viajan los dos pares porque un mes con una sola lectura
// tiene extremos pero no tiene vallas.
const monthlyBoxSchema = z
  .object({
    mes: z.string(),
    n: countSchema,
    minimo: nullableNumber,
    q1: nullableNumber,
    mediana: nullableNumber,
    q3: nullableNumber,
    maximo: nullableNumber,
    bigote_inferior: nullableNumber,
    bigote_superior: nullableNumber,
  })
  .transform((raw) => ({
    month: raw.mes,
    count: raw.n,
    minimum: raw.minimo,
    q1: raw.q1,
    median: raw.mediana,
    q3: raw.q3,
    maximum: raw.maximo,
    lowerWhisker: raw.bigote_inferior,
    upperWhisker: raw.bigote_superior,
  }));

export type MonthlyBox = z.infer<typeof monthlyBoxSchema>;

export const distributionResponseSchema = analysisResponse({
  variable: variableSchema,
  factor_iqr: z.number(),
  cajas: z.array(monthlyBoxSchema),
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: { variable: payload.variable, iqrFactor: payload.factor_iqr, boxes: payload.cajas },
}));

export type DistributionResponse = z.infer<typeof distributionResponseSchema>;
