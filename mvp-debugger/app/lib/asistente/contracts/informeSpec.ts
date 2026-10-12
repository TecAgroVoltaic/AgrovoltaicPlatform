// El informe Excel que ofrece `preparar_informe` en `salida.descarga`: la ruta
// de `GET /informe` con el período (y el foco) ya puestos. El Excel se arma al
// bajarlo; la tool no lo genera.
import { z } from "zod";

import { parseSpec, routeWithPrefix, type SpecParse } from "@/app/lib/asistente/contracts/parseSpec";

const REPORT_PATH_PREFIX = "/informe?";

export const informeSpecSchema = z.object({
  ruta: routeWithPrefix(REPORT_PATH_PREFIX),
  formato: z.literal("xlsx").optional(),
});

export type InformeSpec = z.infer<typeof informeSpecSchema>;

export function parseInformeSpec(raw: unknown): SpecParse<InformeSpec> {
  return parseSpec(informeSpecSchema, raw);
}
