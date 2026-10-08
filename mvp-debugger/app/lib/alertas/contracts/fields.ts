// Piezas compartidas por los esquemas de `/alertas/*`: palabras cerradas del
// vocabulario, fechas, conteos y rutas internas.
import { z } from "zod";

import { isIsoDate } from "@/app/lib/analitica/dateRange";
import type { WireReader } from "@/app/lib/alertas/vocabulary";

/** Una palabra del backend que solo puede tomar los valores de `reader`; otra
 *  cualquiera es un error de contrato, no un valor a mostrar. */
export function closedWord<TKey extends string>(reader: WireReader<TKey>, what: string) {
  return z.string().transform((wire, ctx): TKey => {
    const key = reader.get(wire);
    if (key === undefined) {
      ctx.addIssue({ code: "custom", message: `${what} desconocido: ${wire}` });
      return z.NEVER;
    }
    return key;
  });
}

export const isoDateSchema = z.string().refine(isIsoDate, { message: "fecha fuera de formato AAAA-MM-DD" });

export const countSchema = z.number().int().nonnegative();

/** Solo rutas internas: un enlace del backend nunca puede sacar de la consola
 *  (`//otro.sitio`) ni ejecutar código (`javascript:`). */
export const internalPathSchema = z
  .string()
  .refine((path) => path.startsWith("/") && !path.startsWith("//"), {
    message: "el enlace no es una ruta interna",
  });
