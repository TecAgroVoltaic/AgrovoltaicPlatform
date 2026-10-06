"use client";
// La vista Alertas: cabecera propia, cifras, pestañas y filtros, la lista y la
// ficha. Lee rango y consulta de la URL y no calcula nada: cada número (total,
// ocurrencias, cifras) sale del servicio.
import { useCallback, useId, useRef } from "react";

import { AlertDrawer } from "@/app/components/analitica/alertas/AlertDrawer";
import { AlertsHeader } from "@/app/components/analitica/alertas/AlertsHeader";
import { AlertsListArea } from "@/app/components/analitica/alertas/AlertsListArea";
import { AlertsToolbar } from "@/app/components/analitica/alertas/AlertsToolbar";
import { EvaluationNotice } from "@/app/components/analitica/alertas/EvaluationNotice";
import styles from "@/app/components/analitica/alertas/overview.module.css";
import { SummaryCards } from "@/app/components/analitica/alertas/SummaryCards";
import { useAlertsList, useAlertsSummary } from "@/app/components/analitica/alertas/useAlertsData";
import { useAlertsQuery, type HistoryMode } from "@/app/components/analitica/alertas/useAlertsQuery";
import { useEvaluation } from "@/app/components/analitica/alertas/useEvaluation";
import { rangeLabel } from "@/app/lib/analitica/rangeLabel";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { announceAlertsChanged } from "@/app/lib/alertas/changes";
import { DEFAULT_ALERT_FILTERS, type AlertFilters } from "@/app/lib/alertas/query";

export function AlertasView() {
  const { range } = useDateRange();
  const { query, change } = useAlertsQuery();
  const list = useAlertsList(range, query);
  const summary = useAlertsSummary();
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();
  const { reload: reloadList } = list;

  // La ficha ya se refresca sola; acá van la lista y, por evento, el resumen de
  // arriba y el contador del menú.
  const onAlertsChanged = useCallback(() => {
    reloadList();
    announceAlertsChanged();
  }, [reloadList]);
  const evaluation = useEvaluation(range, onAlertsChanged);

  const onFiltersChange = useCallback(
    (filters: AlertFilters, mode?: HistoryMode) => change({ kind: "filters", filters }, mode),
    [change],
  );
  const goTo = useCallback((offset: number) => change({ kind: "page", offset }), [change]);
  const select = useCallback(
    (id: number, row: HTMLElement) => {
      opener.current = row;
      change({ kind: "select", id });
    },
    [change],
  );
  const close = useCallback(() => {
    change({ kind: "select", id: null });
    opener.current?.focus();
  }, [change]);

  const summaryData = summary.state.status === "ready" ? summary.state.data : null;
  const lastEvaluation = summaryData ? summaryData.lastEvaluation : undefined;
  // Sin ninguna evaluación las cifras y los filtros no tienen nada que contar:
  // queda solo el panel que explica por qué y ofrece evaluar.
  const neverEvaluated = lastEvaluation === null;

  return (
    <>
      <AlertsHeader summary={summary.state} evaluation={evaluation} />
      <div className={styles.page}>
        <EvaluationNotice evaluation={evaluation} />
        {neverEvaluated ? null : (
          <>
            <SummaryCards state={summary.state} />
            <AlertsToolbar filters={query.filters} summary={summaryData} listId={listId} onChange={onFiltersChange} />
          </>
        )}
        <AlertsListArea
          id={listId}
          state={list.state}
          lastFailure={list.lastFailure}
          query={query}
          lastEvaluation={lastEvaluation}
          periodLabel={rangeLabel(range)}
          evaluation={evaluation}
          onSelect={select}
          onGoTo={goTo}
          onClearFilters={() => onFiltersChange(DEFAULT_ALERT_FILTERS)}
          onShowClosed={() => onFiltersChange({ ...DEFAULT_ALERT_FILTERS, status: "closed" })}
        />
      </div>
      {query.selectedId !== null ? (
        <AlertDrawer alertId={query.selectedId} onClose={close} onChanged={onAlertsChanged} />
      ) : null}
    </>
  );
}
