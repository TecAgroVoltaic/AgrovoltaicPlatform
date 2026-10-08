import { z } from "zod";

export type ValidDayCriterion = {
  readonly minCoverage: number;
  readonly maxOffsetHours: number;
  readonly explanation: string;
};

export const criterionSchema = z
  .object({
    cobertura_minima: z.number(),
    desfase_maximo_h: z.number(),
    explicacion: z.string(),
  })
  .transform((raw): ValidDayCriterion => ({
    minCoverage: raw.cobertura_minima,
    maxOffsetHours: raw.desfase_maximo_h,
    explanation: raw.explicacion,
  }));
