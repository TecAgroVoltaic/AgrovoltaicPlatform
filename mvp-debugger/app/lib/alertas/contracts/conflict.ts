// Conflictos (409) de `/alertas/*`.
// El backend responde `{detail: "<prosa>", codigo, ...datos}` (historico.errores):
// `codigo` es lo estable, `detail` cambia. Se acepta además el objeto envuelto
// en `detail`, que es como lo serializa un `HTTPException` de FastAPI.
import { z } from "zod";

import { STATUS_FROM_WIRE } from "@/app/lib/alertas/vocabulary";

const invalidTransitionBodySchema = z
  .object({ codigo: z.literal("transicion_invalida"), de: z.string(), a: z.string() })
  .transform((raw) => ({
    kind: "invalidTransition" as const,
    from: STATUS_FROM_WIRE.get(raw.de) ?? null,
    to: STATUS_FROM_WIRE.get(raw.a) ?? null,
  }));

const openAlertExistsBodySchema = z
  .object({
    codigo: z.literal("alerta_abierta_existente"),
    abierta_id: z.number().int().nullable().optional(),
  })
  .transform((raw) => ({ kind: "openAlertExists" as const, openAlertId: raw.abierta_id ?? null }));

const conflictBodySchema = z.union([invalidTransitionBodySchema, openAlertExistsBodySchema]);

/** Los dos 409 del contrato: la alerta cambió de estado, o reabrirla chocaría
 *  con otra abierta por la misma causa (misma `clave`). */
export const alertConflictSchema = z.union([
  conflictBodySchema,
  z.object({ detail: conflictBodySchema }).transform((raw) => raw.detail),
]);

export type AlertConflict = z.infer<typeof alertConflictSchema>;
