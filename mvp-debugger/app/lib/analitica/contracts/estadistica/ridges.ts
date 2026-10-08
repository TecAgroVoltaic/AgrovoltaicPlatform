// Fig. 7: densidades por sensor.
import { z } from "zod";

import { analysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema } from "@/app/lib/analitica/contracts/metric";
import { countSchema, noteSchema, nullableNumber } from "@/app/lib/analitica/contracts/estadistica/shared";

const densityGroupSchema = z
  .object({
    grupo: z.string(),
    etiqueta: z.string(),
    n: countSchema,
    n_usadas: countSchema,
    densidad: z.array(z.number()).nullable(),
    prob_sobre_umbral: metricSchema,
    fuera_de_cobertura: noteSchema,
  })
  .transform((raw) => ({
    key: raw.grupo,
    label: raw.etiqueta,
    readings: raw.n,
    usedReadings: raw.n_usadas,
    density: raw.densidad,
    tailProbability: raw.prob_sobre_umbral,
    outOfCoverage: raw.fuera_de_cobertura ?? null,
  }));

export type DensityGroup = z.infer<typeof densityGroupSchema>;

export const ridgesResponseSchema = analysisResponse({
  unidad: z.string(),
  rejilla: z.array(z.number()),
  umbral: nullableNumber,
  grupos: z.array(densityGroupSchema),
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: {
    unit: payload.unidad,
    grid: payload.rejilla,
    threshold: payload.umbral,
    groups: payload.grupos,
  },
}));

export type RidgesResponse = z.infer<typeof ridgesResponseSchema>;
