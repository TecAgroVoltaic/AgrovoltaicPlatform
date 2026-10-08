import { z } from "zod";

import { wholeDays } from "@/app/lib/analitica/contracts/primitives";

export const nullableNumber = z.number().nullable();
export const countSchema = wholeDays;
export const noteSchema = z.string().nullish();

export const variableSchema = z
  .object({ clave: z.string(), etiqueta: z.string(), unidad: z.string() })
  .transform((raw) => ({ key: raw.clave, label: raw.etiqueta, unit: raw.unidad }));

/** Una variable del catálogo del backend, con su etiqueta y su unidad. */
export type AnalyzedVariable = z.infer<typeof variableSchema>;
