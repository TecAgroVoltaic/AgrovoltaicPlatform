// `GET /api/historico/fuentes`: qué contiene cada fuente de datos y qué vistas
// alimenta. Cada fuente describe su contenido a su manera (tablas, series o
// cajas), así que los tres bloques son opcionales.
import { z } from "zod";

import { SOURCE_IDS } from "@/app/lib/fuentes/registry";

const nullableDate = z.string().nullable();
const nonNegativeInteger = z.number().int().nonnegative();

const tableSchema = z
  .object({
    clave: z.string(),
    relacion: z.string(),
    variables: z.array(z.string()),
    desde: nullableDate,
    hasta: nullableDate,
    filas: nonNegativeInteger.nullable(),
  })
  .transform((raw) => ({
    key: raw.clave,
    relation: raw.relacion,
    variables: raw.variables,
    from: raw.desde,
    to: raw.hasta,
    rows: raw.filas,
  }));

const seriesSchema = z
  .object({
    caja: z.string(),
    variable: z.string(),
    unidad: z.string().nullable(),
    desde: nullableDate,
    hasta: nullableDate,
    n: nonNegativeInteger,
  })
  .transform((raw) => ({
    box: raw.caja,
    variable: raw.variable,
    unit: raw.unidad,
    from: raw.desde,
    to: raw.hasta,
    count: raw.n,
  }));

const boxSchema = z
  .object({ nombre: z.string(), sensores: z.array(z.string()) })
  .transform((raw) => ({ name: raw.nombre, sensors: raw.sensores }));

const sourceEntrySchema = z
  .object({
    id: z.enum(SOURCE_IDS),
    nombre: z.string(),
    region: z.string(),
    acceso: z.string(),
    descripcion: z.string().nullish(),
    tablas: z.array(tableSchema).optional(),
    series: z.array(seriesSchema).optional(),
    cajas: z.array(boxSchema).optional(),
    alimenta: z.array(z.string()),
    /** Por qué la fuente no pudo describirse (p. ej. AgroDash no respondió). */
    motivo: z.string().nullish(),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.nombre,
    region: raw.region,
    access: raw.acceso,
    description: raw.descripcion ?? null,
    tables: raw.tablas ?? [],
    series: raw.series ?? [],
    boxes: raw.cajas ?? [],
    feeds: raw.alimenta,
    reason: raw.motivo ?? null,
  }));

export const sourcesCatalogSchema = z
  .object({ generado_en: z.string(), fuentes: z.array(sourceEntrySchema) })
  .transform((raw) => ({ generatedAt: raw.generado_en, sources: raw.fuentes }));

export type SourcesCatalog = z.infer<typeof sourcesCatalogSchema>;
export type SourceEntry = SourcesCatalog["sources"][number];
export type SourceTable = SourceEntry["tables"][number];
export type SourceSeries = SourceEntry["series"][number];
export type SourceBox = SourceEntry["boxes"][number];
