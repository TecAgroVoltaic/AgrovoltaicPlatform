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
import { alertsListParams, isDefaultFilters, type AlertsQuery } from "@/app/lib/alertas/query";

const FIRST_OFFSET = 0;

/** El vacío SIEMPRE dice por qué. «No hay abiertas en este rango» y «ninguna
 *  coincide con tu filtro» piden a la persona cosas distintas. */
export function alertsPageToState(page: AlertsPage, query: AlertsQuery): ChartState<AlertsPage> {
  if (page.alerts.length > 0) return readyChart(page);
  if (query.offset > FIRST_OFFSET) {
    return emptyChart("NO_ROWS", {
      message: "Esta página quedó vacía.",
      hint: "La lista cambió desde que se abrió el enlace: volvé a la primera página.",
    });
  }
  return isDefaultFilters(query.filters)
    ? emptyChart("NO_ROWS", {
        message: "No hay alertas abiertas en este rango.",
        hint: "Que no haya alertas no dice que el dato esté sano: mirá cuándo fue la última evaluación.",
      })
    : emptyChart("FILTERED_OUT", {
        message: "Ninguna alerta coincide con los filtros elegidos.",
        hint: "Quitá un filtro para volver a ver las alertas abiertas del rango.",
      });
}

export function useAlertsList(range: DateRange, query: AlertsQuery) {
  const key = JSON.stringify([range.from, range.toExclusive, alertsListParams(query)]);
  return useReloadableResource(
    key,
    () => fetchAlertsPage(range, query),
    (page: AlertsPage) => alertsPageToState(page, query),
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
