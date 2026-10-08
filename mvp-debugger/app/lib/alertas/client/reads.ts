"use client";
// Lecturas de `/alertas/*` y la corrida del evaluador, por el mismo proxy y con
// los mismos códigos de fallo que el resto de la capa de análisis.
import { fetchAnalytics, fetchResource, postAnalytics, type AnalyticsDeps } from "@/app/lib/analitica/client";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import {
  alertDetailSchema,
  alertsPageSchema,
  alertsSummarySchema,
  evaluationResultSchema,
  type Alert,
  type AlertDetail,
  type AlertsPage,
  type AlertsSummary,
  type EvaluationResult,
} from "@/app/lib/alertas/contracts";
import { alertsListParams, type AlertsQuery } from "@/app/lib/alertas/query";
import { PLANT_OUTAGE_ALERT_TYPE } from "@/app/lib/alertas/vocabulary";

import { ALERTS_PATH } from "./paths";

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

const OPEN_OUTAGE_QUERY: AlertsQuery = {
  filters: { status: "open", severity: "critical", type: PLANT_OUTAGE_ALERT_TYPE, search: "" },
  offset: 0,
  selectedId: null,
};

/** La última alerta grave abierta de planta sin generar, o null si no hay.
 *  Sin rango: el backend ordena por `fecha_fin` descendente y basta la primera. */
export async function fetchLatestOpenOutage(deps?: AnalyticsDeps): Promise<AnalyticsResult<Alert | null>> {
  const result = await fetchResource(
    {
      path: ALERTS_PATH,
      query: { ...alertsListParams(OPEN_OUTAGE_QUERY), limite: "1" },
      schema: alertsPageSchema,
    },
    deps,
  );
  return result.ok ? { ok: true, data: result.data.alerts[0] ?? null } : result;
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
