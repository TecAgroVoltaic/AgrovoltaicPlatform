"use client";
// La vista Alertas: lee rango y consulta de la URL, pide la lista y abre la
// ficha. No calcula nada: cada número (total, ocurrencias, cifras) sale del
// servicio.
import { useCallback, useRef } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { AlertDrawer } from "@/app/components/analitica/alertas/AlertDrawer";
import { AlertFiltersBar } from "@/app/components/analitica/alertas/AlertFiltersBar";
import { AlertList } from "@/app/components/analitica/alertas/AlertList";
import { AlertsPager } from "@/app/components/analitica/alertas/AlertsPager";
import { EvaluationNote } from "@/app/components/analitica/alertas/EvaluationNote";
import { ResourceState } from "@/app/components/analitica/alertas/ResourceState";
import { useAlertsList } from "@/app/components/analitica/alertas/useAlertsData";
import { useAlertsQuery, type HistoryMode } from "@/app/components/analitica/alertas/useAlertsQuery";
import { formatRange } from "@/app/lib/analitica/dateRange";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { announceAlertsChanged } from "@/app/lib/alertas/changes";
import type { AlertFilters } from "@/app/lib/alertas/query";

const FIRST_OFFSET = 0;

export function AlertasView() {
  const { range } = useDateRange();
  const { query, change } = useAlertsQuery();
  const list = useAlertsList(range, query);
  const opener = useRef<HTMLElement | null>(null);
  const { reload: reloadList } = list;

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
  // La ficha ya se refresca sola; acá van la lista y, por evento, el contador
  // del menú y la nota de evaluación.
  const onAlertChanged = useCallback(() => {
    reloadList();
    announceAlertsChanged();
  }, [reloadList]);

  return (
    <>
      <p className="muted small">
        Período: {formatRange(range)}. <EvaluationNote />
      </p>
      <AlertFiltersBar filters={query.filters} onChange={onFiltersChange} />
      <ResourceState
        what="las alertas del rango"
        state={list.state}
        emptyAction={
          query.offset > FIRST_OFFSET
            ? { label: "Ir a la primera página", onClick: () => goTo(FIRST_OFFSET) }
            : undefined
        }
      />
      {list.state.status === "ready" ? (
        <div className={styles.listBlock}>
          <AlertList alerts={list.state.data.alerts} selectedId={query.selectedId} onSelect={select} />
          <AlertsPager page={list.state.data} onGoTo={goTo} />
        </div>
      ) : null}
      {query.selectedId !== null ? (
        <AlertDrawer alertId={query.selectedId} onClose={close} onChanged={onAlertChanged} />
      ) : null}
    </>
  );
}
