"use client";
// Los filtros finos de la lista, a la derecha de las pestañas: gravedad como dos
// chips conmutables, tipo como chip con menú y la búsqueda. Todo escribe la
// misma consulta de la URL por el mismo reductor que antes.
import { useId } from "react";

import { IconChevronDown, IconClose } from "@/app/components/asistente/AssistantIcons";
import { SearchBox } from "@/app/components/analitica/alertas/SearchBox";
import { STATUS_FILTER_LABEL, STATUS_TABS, typeLabel } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/overview.module.css";
import type { HistoryMode } from "@/app/components/analitica/alertas/useAlertsQuery";
import { DEFAULT_ALERT_FILTERS, type AlertFilters } from "@/app/lib/alertas/query";
import { KNOWN_ALERT_TYPES, type AlertSeverity } from "@/app/lib/alertas/vocabulary";

const ANY_TYPE = "";
const ICON_SIZE = 12;
const ICON_STROKE = 2;

const SEVERITY_CHIPS: readonly { readonly severity: AlertSeverity; readonly label: string }[] = [
  { severity: "critical", label: "Graves" },
  { severity: "warning", label: "Avisos" },
];

/** Los dos chips encendidos = sin filtro. Apagar uno deja solo el otro; apagar
 *  el único encendido no hace nada: una lista sin ninguna gravedad no existe. */
function toggleSeverity(current: AlertSeverity | null, clicked: AlertSeverity): AlertSeverity | null {
  if (current === null) return clicked === "critical" ? "warning" : "critical";
  return current === clicked ? current : null;
}

export type AlertFiltersBarProps = {
  readonly filters: AlertFilters;
  readonly onChange: (filters: AlertFilters, mode?: HistoryMode) => void;
};

export function AlertFiltersBar({ filters, onChange }: AlertFiltersBarProps) {
  const typeId = useId();
  // Un tipo que llegó por URL y no está entre los conocidos sigue siendo el
  // filtro aplicado: se ofrece como opción para que el chip no mienta.
  const typeOptions =
    filters.type && !KNOWN_ALERT_TYPES.includes(filters.type) ? [...KNOWN_ALERT_TYPES, filters.type] : KNOWN_ALERT_TYPES;
  const statusOutsideTabs = !STATUS_TABS.includes(filters.status);

  return (
    <div className={styles.filters} role="search" aria-label="Filtrar alertas">
      {statusOutsideTabs ? (
        <button
          type="button"
          className={styles.chip}
          aria-label={`Quitar el filtro de estado ${STATUS_FILTER_LABEL[filters.status]}`}
          onClick={() => onChange({ ...filters, status: DEFAULT_ALERT_FILTERS.status })}
        >
          Estado: {STATUS_FILTER_LABEL[filters.status]}
          <IconClose size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </button>
      ) : null}
      <div role="group" aria-label="Gravedad" className={styles.chipGroup}>
        {SEVERITY_CHIPS.map(({ severity, label }) => (
          <button
            key={severity}
            type="button"
            className={styles.chip}
            aria-pressed={filters.severity === null || filters.severity === severity}
            onClick={() => onChange({ ...filters, severity: toggleSeverity(filters.severity, severity) })}
          >
            {label}
          </button>
        ))}
      </div>
      <span className={styles.separator} aria-hidden="true" />
      <label className={styles.typeChip} htmlFor={typeId}>
        <span className={styles.srOnly}>Tipo</span>
        <select
          id={typeId}
          value={filters.type ?? ANY_TYPE}
          onChange={(event) => onChange({ ...filters, type: event.target.value || null })}
        >
          <option value={ANY_TYPE}>Tipo: todos</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
        <IconChevronDown size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </label>
      <SearchBox value={filters.search} onCommit={(search) => onChange({ ...filters, search }, "replace")} />
    </div>
  );
}
