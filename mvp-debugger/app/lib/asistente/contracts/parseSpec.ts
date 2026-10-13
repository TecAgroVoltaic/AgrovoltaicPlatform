// Validación común de los specs que viajan en la salida de las tools: el spec
// válido, o el primer motivo legible para mostrarlo en la tarjeta.
import { z } from "zod";

import { describeFirstIssue } from "@/app/lib/asistente/contracts/issues";
import { SOURCE_IDS } from "@/app/lib/fuentes/registry";

export type SpecParse<Spec> =
  | { readonly ok: true; readonly spec: Spec }
  | { readonly ok: false; readonly reason: string };

export function parseSpec<Spec>(schema: z.ZodType<Spec>, raw: unknown): SpecParse<Spec> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, spec: result.data };
  return { ok: false, reason: describeFirstIssue(result.error) };
}

/** Una ruta del servicio que la tarjeta acepta pedir: solo si empieza con
 *  `prefix`. La escribe el backend a partir de lo que pidió un LLM, así que una
 *  tarjeta jamás debe volverse un botón que pida cualquier otra ruta. */
export function routeWithPrefix(prefix: string) {
  return z.string().refine((route) => route.startsWith(prefix), { message: `la ruta no empieza con ${prefix}` });
}

export const sourceIdSchema = z.enum(SOURCE_IDS);
