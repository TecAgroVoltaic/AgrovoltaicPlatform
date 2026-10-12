// El catálogo de secciones de la consola (contrato §5 de
// docs/referencia/contratos-asistente-plataforma.md). El JSON es la fuente de
// verdad que comparten la barra lateral, el armador de enlaces y el agente; acá
// se valida una vez al cargar el módulo para que un JSON roto falle en el build
// y no en la mano de un usuario.
import { z } from "zod";

import { SOURCE_IDS } from "@/app/lib/fuentes/registry";
import raw from "@/app/lib/navegacion/secciones.json";

const paramSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(["fecha", "anio", "texto", "lista"]),
  descripcion: z.string(),
});

const sectionSchema = z.object({
  id: z.string().min(1),
  ruta: z.string().startsWith("/"),
  etiqueta: z.string().min(1),
  descripcion: z.string(),
  muestra: z.array(z.string()),
  fuentes: z.array(z.enum(SOURCE_IDS)),
  params: z.array(paramSchema),
});

const catalogSchema = z.object({
  version: z.literal(1),
  secciones: z.array(sectionSchema).min(1),
});

export type SectionParam = z.infer<typeof paramSchema>;
export type SectionEntry = z.infer<typeof sectionSchema>;

export const SECTION_CATALOG: readonly SectionEntry[] = catalogSchema.parse(raw).secciones;

export function findSectionEntry(id: string): SectionEntry | undefined {
  return SECTION_CATALOG.find((section) => section.id === id);
}

export function findSectionByPath(path: string): SectionEntry | undefined {
  return SECTION_CATALOG.find((section) => section.ruta === path);
}
