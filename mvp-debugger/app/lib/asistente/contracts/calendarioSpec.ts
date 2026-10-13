// El `CalendarioSpec` v1 (contrato §4.6 de
// docs/referencia/contratos-asistente-plataforma.md): días con datos por
// fuente, para el calendario de actividad, y sus huecos más largos.
import { z } from "zod";

import { parseSpec, sourceIdSchema, type SpecParse } from "@/app/lib/asistente/contracts/parseSpec";

export const CALENDARIO_SPEC_VERSION = 1;

/** Solo viajan los días CON datos: el nivel 0 es la ausencia del día. */
const DAY_LEVELS = [1, 2, 3, 4] as const;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().regex(ISO_DATE_PATTERN, { message: "la fecha no es YYYY-MM-DD" });
const nonNegativeInteger = z.number().int().nonnegative();

const daySchema = z.tuple([isoDate, z.literal(DAY_LEVELS), nonNegativeInteger]);

const gapSchema = z.object({
  desde: isoDate,
  hasta: isoDate,
  dias: z.number().int().positive(),
});

/** Una caja que no respondió y por qué: la fila queda incompleta, no vacía. */
const failureSchema = z.object({ caja: z.string(), motivo: z.string() });

const rowSchema = z.object({
  fuente: sourceIdSchema,
  etiqueta: z.string().min(1),
  dias: z.array(daySchema),
  n_dias: nonNegativeInteger,
  huecos: z.array(gapSchema).default([]),
  completa: z.boolean().default(true),
  fallas: z.array(failureSchema).default([]),
});

export const calendarioSpecSchema = z
  .object({
    version: z.literal(CALENDARIO_SPEC_VERSION),
    titulo: z.string().nullish(),
    desde: isoDate,
    hasta: isoDate,
    filas: z.array(rowSchema),
  })
  .refine((spec) => spec.desde <= spec.hasta, { message: "desde es posterior a hasta", path: ["hasta"] });

export type CalendarioSpec = z.infer<typeof calendarioSpecSchema>;
export type CalendarioRow = CalendarioSpec["filas"][number];
export type CalendarioGap = CalendarioRow["huecos"][number];

export function parseCalendarioSpec(raw: unknown): SpecParse<CalendarioSpec> {
  return parseSpec(calendarioSpecSchema, raw);
}
