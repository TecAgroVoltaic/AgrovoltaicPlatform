// El `SelectorVariablesSpec` v1 de `catalogo_datos` (contrato §4.2): grupos del
// catálogo unificado (`GET /datos/catalogo`, §2) para elegir variables a mano.
import { z } from "zod";

import { parseSpec, sourceIdSchema, type SpecParse } from "@/app/lib/asistente/contracts/parseSpec";

export const SELECTOR_VARIABLES_SPEC_VERSION = 1;

/** `"<SourceId>:<clave>"`: el identificador estable de una variable. */
const VARIABLE_ID_PATTERN = /^[a-z_]+:.+$/;

const variableSchema = z.object({
  id: z.string().regex(VARIABLE_ID_PATTERN, { message: "el id no tiene la forma <fuente>:<clave>" }),
  etiqueta: z.string().min(1),
  unidad: z.string().nullable(),
  desde: z.string().nullable(),
  hasta: z.string().nullable(),
  cadencia_s: z.number().nonnegative().nullable(),
  nota: z.string().nullable(),
});

export const catalogGroupSchema = z.object({
  fuente: sourceIdSchema,
  grupo: z.string().min(1),
  etiqueta: z.string().min(1),
  variables: z.array(variableSchema),
});

export const selectorVariablesSpecSchema = z.object({
  version: z.literal(SELECTOR_VARIABLES_SPEC_VERSION),
  titulo: z.string().nullish(),
  preseleccion: z.array(z.string()).default([]),
  grupos: z.array(catalogGroupSchema).min(1, { message: "no hay variables para elegir" }),
});

export type SelectorVariablesSpec = z.infer<typeof selectorVariablesSpecSchema>;
export type CatalogGroup = z.infer<typeof catalogGroupSchema>;
export type CatalogVariable = CatalogGroup["variables"][number];

export function parseSelectorVariablesSpec(raw: unknown): SpecParse<SelectorVariablesSpec> {
  return parseSpec(selectorVariablesSpecSchema, raw);
}
