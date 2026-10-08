"use client";
// Las tres lecturas de la vista: la lista, la ficha y el resumen. Cada una
// decide su identidad (`key`) y cómo se dice su vacío; el ciclo de carga es el
// de `useReloadableResource`.
import { useCallback, useEffect } from "react";

import { emptyChart, readyChart, type ChartState } from "@/app/components/charts";
import { useReloadableResource } from "@/app/components/analitica/alertas/useReloadableResource";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import { onAlertsChanged } from "@/app/lib/alertas/changes";
import { fetchAlertDetail, fetchAlertsPage, fetchAlertsSummary } from "@/app/lib/alertas/client";
import type { AlertDetail, AlertsPage, AlertsSummary } from "@/app/lib/alertas/contracts";
import { alertsListParams, type AlertsQuery } from "@/app/lib/alertas/query";

/** Una página sin filas es un vacío y no un error. Cuál vacío (nunca evaluado,
 *  nada abierto, filtros que no coinciden) lo decide la vista con la consulta y
 *  el resumen en la mano: ver `emptyListKind`. */
export function alertsPageToState(page: AlertsPage): ChartState<AlertsPage> {
  return page.alerts.length > 0 ? readyChart(page) : emptyChart("NO_ROWS");
}

export function useAlertsList(range: DateRange, query: AlertsQuery) {
  const key = JSON.stringify([range.from, range.toExclusive, alertsListParams(query)]);
  return useReloadableResource(
    key,
    () => fetchAlertsPage(range, query),
    alertsPageToState,
  );
}

export function useAlertDetail(id: number | null) {
  return useReloadableResource<AlertDetail>(id === null ? null : `alerta:${id}`, () =>
    id === null ? Promise.reject(new Error("sin alerta elegida")) : fetchAlertDetail(id),
  );
}

const SUMMARY_KEY = "alertas/resumen";

/** El resumen se vuelve a pedir al volver a la pestaña y cuando alguien avisa
 *  que las alertas cambiaron. Sin sondeo periódico: el evaluador corre una vez
 *  por carga de datos, y preguntar cada minuto sería tráfico sin novedades. */
export function useAlertsSummary() {
  const summary = useReloadableResource<AlertsSummary>(SUMMARY_KEY, fetchAlertsSummary);
  const { reload } = summary;
  const reloadIfVisible = useCallback(() => {
    if (document.visibilityState === "visible") reload();
  }, [reload]);

  useEffect(() => {
    document.addEventListener("visibilitychange", reloadIfVisible);
    const stopListening = onAlertsChanged(reload);
    return () => {
      document.removeEventListener("visibilitychange", reloadIfVisible);
      stopListening();
    };
  }, [reload, reloadIfVisible]);

  return summary;
}
