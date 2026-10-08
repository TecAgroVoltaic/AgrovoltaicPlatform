"use client";
// La barra sobre la lista: pestañas de estado a la izquierda y filtros finos a
// la derecha, en una sola línea de base. Cambiar cualquiera escribe la URL.
import { AlertFiltersBar } from "@/app/components/analitica/alertas/AlertFiltersBar";
import styles from "@/app/components/analitica/alertas/overview.module.css";
import { StatusTabs } from "@/app/components/analitica/alertas/StatusTabs";
import type { HistoryMode } from "@/app/components/analitica/alertas/useAlertsQuery";
import type { AlertsSummary } from "@/app/lib/alertas/contracts";
import type { AlertFilters } from "@/app/lib/alertas/query";

export type AlertsToolbarProps = {
  readonly filters: AlertFilters;
  readonly summary: AlertsSummary | null;
  readonly listId: string;
  readonly onChange: (filters: AlertFilters, mode?: HistoryMode) => void;
};

export function AlertsToolbar({ filters, summary, listId, onChange }: AlertsToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <StatusTabs
        current={filters.status}
        summary={summary}
        panelId={listId}
        onSelect={(status) => onChange({ ...filters, status })}
      />
      <AlertFiltersBar filters={filters} onChange={onChange} />
    </div>
  );
}
