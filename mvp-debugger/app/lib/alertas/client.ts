"use client";
// Lecturas y acciones de `/alertas/*`, por el mismo proxy y con los mismos
// códigos de fallo que el resto de la capa de análisis (`app/lib/analitica`).
// Lo único propio de acá es leer el 409 `transicion_invalida`, que no es un
// error genérico: dice que la alerta cambió de estado y hacia cuál.
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
  invalidTransitionSchema,
  type Alert,
  type AlertDetail,
  type AlertsPage,
  type AlertsSummary,
  type InvalidTransition,
} from "@/app/lib/alertas/contracts";
import { alertsListParams, type AlertsQuery } from "@/app/lib/alertas/query";
import { ALERT_ACTION_PATH, type AlertAction } from "@/app/lib/alertas/vocabulary";

const ALERTS_PATH = "alertas";
const CONFLICT_STATUS = 409;

export const INVALID_TRANSITION_MESSAGE =
  "Esa acción ya no aplica: la alerta cambió de estado desde que se abrió la ficha.";

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
      /** Presente solo si el backend rechazó la transición (409). */
      readonly transition: InvalidTransition | null;
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
  const transition = readInvalidTransition(result.failure);
  return transition
    ? {
        ok: false,
        failure: { ...result.failure, message: INVALID_TRANSITION_MESSAGE },
        transition,
      }
    : { ok: false, failure: result.failure, transition: null };
}

function readInvalidTransition(failure: AnalyticsFailure): InvalidTransition | null {
  if (failure.status !== CONFLICT_STATUS) return null;
  const parsed = invalidTransitionSchema.safeParse(failure.payload);
  return parsed.success ? parsed.data : null;
}
