// El `DescargasSpec` v1 de `plan_exportacion` (contrato §4.1 de
// docs/referencia/contratos-asistente-plataforma.md): uno o varios archivos de
// un PlanExportacion, cada uno con su url, y el zip con todos.
import { z } from "zod";

import { parseSpec, routeWithPrefix, sourceIdSchema, type SpecParse } from "@/app/lib/asistente/contracts/parseSpec";

export const DESCARGAS_SPEC_VERSION = 1;

/** El único endpoint que una tarjeta de archivos combinados puede pedir. */
const PLAN_PATH_PREFIX = "/datos/exportar/plan?";

const nonNegativeInteger = z.number().int().nonnegative();

const columnSchema = z.object({
  nombre: z.string().min(1),
  variable: z.string().min(1),
  etiqueta: z.string().min(1),
  fuente: sourceIdSchema,
  unidad: z.string().nullable(),
});

const fileSchema = z.object({
  indice: nonNegativeInteger,
  nombre: z.string().min(1),
  formato: z.enum(["csv", "dat", "mat"]),
  filas_estimadas: nonNegativeInteger,
  columnas: z.array(columnSchema),
  fuentes: z.array(sourceIdSchema),
  url: routeWithPrefix(PLAN_PATH_PREFIX),
});

export const descargasSpecSchema = z.object({
  version: z.literal(DESCARGAS_SPEC_VERSION),
  /** El plan viaja codificado en cada url: la tarjeta no lo lee. */
  plan: z.record(z.string(), z.unknown()),
  archivos: z.array(fileSchema).min(1),
  zip_url: routeWithPrefix(PLAN_PATH_PREFIX).nullable(),
  total_filas: nonNegativeInteger,
  requiere_confirmacion: z.boolean(),
});

export type DescargasSpec = z.infer<typeof descargasSpecSchema>;
export type PlannedFile = DescargasSpec["archivos"][number];

export function parseDescargasSpec(raw: unknown): SpecParse<DescargasSpec> {
  return parseSpec(descargasSpecSchema, raw);
}
