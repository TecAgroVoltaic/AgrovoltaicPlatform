// El `DescargaSpec` que devuelve la tool `exportar_datos` (contrato §2 de
// docs/referencia/contratos-asistente-alertas.md). La tool no genera el archivo:
// describe una descarga que sirve el mismo `GET /datos/exportar` de la vista
// Descargas.
import { z } from "zod";

import { describeFirstIssue } from "@/app/lib/asistente/contracts/issues";

export const DESCARGA_SPEC_VERSION = 1;

/** La `url` la escribe el backend a partir de lo que pidió un LLM. Se acepta
 * solo si apunta al endpoint de exportación: la tarjeta jamás debe convertirse
 * en un botón que pida cualquier otra ruta del servicio. */
const EXPORT_PATH_PREFIX = "/datos/exportar?";

export const descargaSpecSchema = z.object({
  version: z.literal(DESCARGA_SPEC_VERSION),
  tabla: z.string().min(1),
  fuente: z.enum(["supabase", "agrodash"]),
  formato: z.enum(["csv", "dat", "mat"]),
  desde: z.string().nullable().optional(),
  hasta: z.string().nullable().optional(),
  columnas: z.array(z.string()).optional(),
  filas_estimadas: z.number().int().nonnegative(),
  cota: z.boolean(),
  nombre_sugerido: z.string().min(1),
  url: z
    .string()
    .refine((url) => url.startsWith(EXPORT_PATH_PREFIX), {
      message: "la url no apunta a /datos/exportar",
    }),
});

export type DescargaSpec = z.infer<typeof descargaSpecSchema>;

export type DescargaSpecParse =
  | { readonly ok: true; readonly spec: DescargaSpec }
  | { readonly ok: false; readonly reason: string };

export function parseDescargaSpec(raw: unknown): DescargaSpecParse {
  const result = descargaSpecSchema.safeParse(raw);
  if (result.success) return { ok: true, spec: result.data };
  return { ok: false, reason: describeFirstIssue(result.error) };
}
