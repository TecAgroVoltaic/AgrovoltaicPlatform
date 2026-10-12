// El `DocumentosSpec` v1 de `buscar_documentacion` (contrato §4.4): de qué
// documentos del proyecto salió la respuesta. Son referencias, no enlaces: la
// documentación no se sirve en la consola.
import { z } from "zod";

import { parseSpec, type SpecParse } from "@/app/lib/asistente/contracts/parseSpec";

export const DOCUMENTOS_SPEC_VERSION = 1;

const documentSchema = z.object({
  titulo: z.string().min(1),
  ruta: z.string().min(1),
  seccion: z.string().nullish(),
});

export const documentosSpecSchema = z.object({
  version: z.literal(DOCUMENTOS_SPEC_VERSION),
  documentos: z.array(documentSchema),
});

export type DocumentosSpec = z.infer<typeof documentosSpecSchema>;
export type DocumentReference = DocumentosSpec["documentos"][number];

export function parseDocumentosSpec(raw: unknown): SpecParse<DocumentosSpec> {
  return parseSpec(documentosSpecSchema, raw);
}
