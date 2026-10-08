"use client";
// Acciones sobre una alerta. Lo único propio es leer los dos 409 del contrato
// (`transicion_invalida` y `alerta_abierta_existente`) y el 422 de validación,
// que no son errores genéricos: cada uno le dice a la persona algo distinto.
import { postAnalytics, type AnalyticsDeps } from "@/app/lib/analitica/client";
import type { AnalyticsFailure } from "@/app/lib/analitica/errors";
import type { IsoDate } from "@/app/lib/analitica/dateRange";
import {
  alertActionResponseSchema,
  alertConflictSchema,
  type Alert,
  type AlertConflict,
} from "@/app/lib/alertas/contracts";
import { ALERT_ACTION_PATH, type AlertAction } from "@/app/lib/alertas/vocabulary";

import { ALERTS_PATH } from "./paths";

const CONFLICT_STATUS = 409;
const VALIDATION_STATUS = 422;

export const INVALID_TRANSITION_MESSAGE =
  "Esa acción ya no aplica: la alerta cambió de estado desde que se abrió la ficha.";
export const OPEN_ALERT_EXISTS_MESSAGE =
  "Ya hay una alerta abierta por esta misma causa: no se puede reabrir esta.";
export const VALIDATION_MESSAGE =
  "El servicio rechazó los datos de la acción: revisá que la nota no esté vacía ni pase de 2.000 caracteres.";

const CONFLICT_MESSAGE: Readonly<Record<AlertConflict["kind"], string>> = {
  invalidTransition: INVALID_TRANSITION_MESSAGE,
  openAlertExists: OPEN_ALERT_EXISTS_MESSAGE,
};
export type AlertActionInput = {
  readonly action: AlertAction;
  /** Obligatoria en `followUp`; opcional en el resto. */
  readonly note?: string;
  /** Solo `followUp`. */
  readonly nextReview?: IsoDate;
};

export type AlertActionOutcome =
  | { readonly ok: true; readonly alert: Alert }
  | {
      readonly ok: false;
      readonly failure: AnalyticsFailure;
      /** Presente solo si el backend respondió uno de los 409 del contrato. */
      readonly conflict: AlertConflict | null;
    };

function actionBody(input: AlertActionInput): Record<string, string> {
  const note = input.note?.trim();
  return {
    ...(note ? { nota: note } : {}),
    ...(input.action === "followUp" && input.nextReview
      ? { proxima_revision: input.nextReview }
      : {}),
  };
}

export async function runAlertAction(
  id: number,
  input: AlertActionInput,
  deps?: AnalyticsDeps,
): Promise<AlertActionOutcome> {
  const result = await postAnalytics(
    {
      path: `${ALERTS_PATH}/${id}/${ALERT_ACTION_PATH[input.action]}`,
      body: actionBody(input),
      schema: alertActionResponseSchema,
    },
    deps,
  );
  if (result.ok) return { ok: true, alert: result.data };
  const conflict = readConflict(result.failure);
  if (conflict) {
    return {
      ok: false,
      failure: { ...result.failure, message: CONFLICT_MESSAGE[conflict.kind] },
      conflict,
    };
  }
  // El 422 de FastAPI trae `detail` como lista de errores de campo, que no es
  // texto para una persona: se reemplaza por una frase que dice qué revisar.
  const failure =
    result.failure.status === VALIDATION_STATUS
      ? { ...result.failure, message: VALIDATION_MESSAGE }
      : result.failure;
  return { ok: false, failure, conflict: null };
}

function readConflict(failure: AnalyticsFailure): AlertConflict | null {
  if (failure.status !== CONFLICT_STATUS) return null;
  const parsed = alertConflictSchema.safeParse(failure.payload);
  return parsed.success ? parsed.data : null;
}
