// Los bloques de la climatología mensual: uno de barras (irradiación) y tres de
// cajas (irradiancia, temperatura, humedad). Se validan en la frontera y se
// traducen al inglés acá, una sola vez.
import { z } from "zod";

import { SOURCE_IDS } from "@/app/lib/fuentes/registry";

const nullableNumber = z.number().nullable();

/** Por qué un bloque llega sin cajas. Lo decide el backend, no la vista. */
export const CLIMATOLOGY_EMPTY_REASONS = ["sin_datos", "agrodash_no_disponible"] as const;
export type ClimatologyEmptyReason = (typeof CLIMATOLOGY_EMPTY_REASONS)[number];

const sourceSchema = z.enum(SOURCE_IDS);
const reasonSchema = z.enum(CLIMATOLOGY_EMPTY_REASONS).nullish();

// Un mes sin muestras llega con `n = 0` y los cinco números en `null`.
const monthlyBoxSchema = z
  .object({
    mes: z.string(),
    min: nullableNumber,
    q1: nullableNumber,
    mediana: nullableNumber,
    q3: nullableNumber,
    max: nullableNumber,
    n: z.number().int().nonnegative(),
  })
  .transform((raw) => ({
    month: raw.mes,
    min: raw.min,
    q1: raw.q1,
    median: raw.mediana,
    q3: raw.q3,
    max: raw.max,
    count: raw.n,
  }));

export type ClimatologyBox = z.infer<typeof monthlyBoxSchema>;

export const irradiationBlockSchema = z
  .object({
    fuente: sourceSchema,
    variable: z.string(),
    unidad: z.string(),
    /** Alineados con `meses`; `null` = mes sin dato, no cero. */
    valores: z.array(nullableNumber),
    dias: z.array(z.number().int().nonnegative()),
    base: z.string().nullish(),
    motivo: reasonSchema,
  })
  .transform((raw) => ({
    source: raw.fuente,
    variable: raw.variable,
    unit: raw.unidad,
    values: raw.valores,
    days: raw.dias,
    basis: raw.base ?? null,
    reason: raw.motivo ?? null,
  }));

export const boxesBlockSchema = z
  .object({
    fuente: sourceSchema,
    variable: z.string(),
    unidad: z.string(),
    base: z.string().nullish(),
    cajas_sensor: z.array(z.string()).optional(),
    cajas: z.array(monthlyBoxSchema),
    motivo: reasonSchema,
  })
  .transform((raw) => ({
    source: raw.fuente,
    variable: raw.variable,
    unit: raw.unidad,
    basis: raw.base ?? null,
    sensorBoxes: raw.cajas_sensor ?? [],
    boxes: raw.cajas,
    reason: raw.motivo ?? null,
  }));

export type IrradiationBlock = z.infer<typeof irradiationBlockSchema>;
export type BoxesBlock = z.infer<typeof boxesBlockSchema>;
