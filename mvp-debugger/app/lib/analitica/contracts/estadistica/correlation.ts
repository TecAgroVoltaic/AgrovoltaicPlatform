// Fig. 8: dispersión con ajuste OLS.
import { z } from "zod";

import { analysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema } from "@/app/lib/analitica/contracts/metric";
import { countSchema, noteSchema, variableSchema } from "@/app/lib/analitica/contracts/estadistica/shared";

// `pares` y `puntos_mostrados` NO son el mismo número: el ajuste usa todos los
// pares y la nube viene adelgazada solo para dibujar.
const fitSchema = z
  .object({ pendiente: metricSchema, intercepto: metricSchema, r2: metricSchema })
  .transform((raw) => ({ slope: raw.pendiente, intercept: raw.intercepto, r2: raw.r2 }));

export const correlationResponseSchema = analysisResponse({
  x: variableSchema,
  y: variableSchema,
  pares: countSchema,
  lecturas_x: countSchema,
  lecturas_y: countSchema,
  ajuste: fitSchema,
  puntos: z.array(z.tuple([z.number(), z.number()])),
  puntos_mostrados: countSchema,
  submuestreado: z.boolean(),
  nota: noteSchema,
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: {
    x: payload.x,
    y: payload.y,
    pairs: payload.pares,
    xReadings: payload.lecturas_x,
    yReadings: payload.lecturas_y,
    fit: payload.ajuste,
    points: payload.puntos,
    drawnPoints: payload.puntos_mostrados,
    subsampled: payload.submuestreado,
    note: payload.nota ?? null,
  },
}));

export type CorrelationResponse = z.infer<typeof correlationResponseSchema>;
