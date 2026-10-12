// El `NavegacionSpec` v1 de `navegar_consola` (contrato §4.3): a qué sección
// llevar a la persona y con qué parámetros. La forma se valida acá; qué ruta y
// qué parámetros se aceptan lo decide `navegacion/sectionHref` con el catálogo.
import { z } from "zod";

import { parseSpec, type SpecParse } from "@/app/lib/asistente/contracts/parseSpec";

export const NAVEGACION_SPEC_VERSION = 1;

export const navegacionSpecSchema = z.object({
  version: z.literal(NAVEGACION_SPEC_VERSION),
  seccion: z.string().min(1),
  etiqueta: z.string().min(1),
  detalle: z.string().nullish(),
  params: z.record(z.string(), z.string()).nullish(),
});

export type NavegacionSpec = z.infer<typeof navegacionSpecSchema>;

export function parseNavegacionSpec(raw: unknown): SpecParse<NavegacionSpec> {
  return parseSpec(navegacionSpecSchema, raw);
}
