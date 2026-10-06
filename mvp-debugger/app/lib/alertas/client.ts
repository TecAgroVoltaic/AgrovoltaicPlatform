"use client";
// Lecturas y acciones de `/alertas/*`, por el mismo proxy y con los mismos
// códigos de fallo que el resto de la capa de análisis (`app/lib/analitica`).
// Lo único propio de acá es leer los dos 409 del contrato (`transicion_invalida`
// y `alerta_abierta_existente`) y el 422 de validación, que no son errores
// genéricos: cada uno le dice a la persona algo distinto que hacer.
import {
  fetchAnalytics,
  fetchResource,
  postAnalytics,
  type AnalyticsDeps,
} from "@/app/lib/analitica/client";
import type { AnalyticsFailure, AnalyticsResult } from "@/app/lib/analitica/errors";
import type { DateRange, IsoDate } from "@/app/lib/analitica/dateRange";
import {
  alertActionResponseSchema,
  alertDetailSchema,
  alertsPageSchema,
  alertsSummarySchema,
  alertConflictSchema,
  evaluationResultSchema,
  type Alert,
  type AlertDetail,
  type AlertsPage,
  type AlertsSummary,
  type AlertConflict,
  type EvaluationResult,
} from "@/app/lib/alertas/contracts";
import { alertsListParams, type AlertsQuery } from "@/app/lib/alertas/query";
import { ALERT_ACTION_PATH, type AlertAction } from "@/app/lib/alertas/vocabulary";

const ALERTS_PATH = "alertas";
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

export function fetchAlertsPage(
  range: DateRange,
  query: AlertsQuery,
  deps?: AnalyticsDeps,
): Promise<AnalyticsResult<AlertsPage>> {
  return fetchAnalytics(
    { path: ALERTS_PATH, range, query: alertsListParams(query), schema: alertsPageSchema },
    deps,
  );
}

export function fetchAlertsSummary(deps?: AnalyticsDeps): Promise<AnalyticsResult<AlertsSummary>> {
  return fetchResource({ path: `${ALERTS_PATH}/resumen`, schema: alertsSummarySchema }, deps);
}

export function fetchAlertDetail(
  id: number,
  deps?: AnalyticsDeps,
): Promise<AnalyticsResult<AlertDetail>> {
  return fetchResource({ path: `${ALERTS_PATH}/${id}`, schema: alertDetailSchema }, deps);
}

/** Corre el evaluador sobre el período: `hasta` exclusivo, igual que el rango
 *  de la URL y que `[desde, hasta)` del backend. */
export function runEvaluation(range: DateRange, deps?: AnalyticsDeps): Promise<AnalyticsResult<EvaluationResult>> {
  return postAnalytics(
    {
      path: `${ALERTS_PATH}/evaluar`,
      body: { desde: range.from, hasta: range.toExclusive },
      schema: evaluationResultSchema,
    },
    deps,
  );
}

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
