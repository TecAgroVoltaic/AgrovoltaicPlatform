"use client";
// Los filtros de la lista: estado, gravedad, tipo y búsqueda. Selectores nativos
// (teclado y lector de pantalla gratis) y una búsqueda que espera a que se deje
// de escribir antes de pedir nada.
import { useId } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { SearchBox } from "@/app/components/analitica/alertas/SearchBox";
import {
  STATUS_FILTER_LABEL,
  STATUS_FILTER_OPTIONS,
  typeLabel,
} from "@/app/components/analitica/alertas/labels";
import type { HistoryMode } from "@/app/components/analitica/alertas/useAlertsQuery";
import { SEVERITY_BADGE } from "@/app/components/analitica/calidad/labels";
import {
  DEFAULT_ALERT_FILTERS,
  isDefaultFilters,
  type AlertFilters,
  type StatusFilter,
} from "@/app/lib/alertas/query";
import {
  ALL_ALERT_SEVERITIES,
  KNOWN_ALERT_TYPES,
  type AlertSeverity,
} from "@/app/lib/alertas/vocabulary";

const ANY = "";

/** El `value` de un `select` es siempre `string`: se estrecha, no se castea. */
function toStatusFilter(value: string): StatusFilter {
  return STATUS_FILTER_OPTIONS.find((option) => option === value) ?? DEFAULT_ALERT_FILTERS.status;
}

function toSeverity(value: string): AlertSeverity | null {
  return ALL_ALERT_SEVERITIES.find((severity) => severity === value) ?? null;
}

export type AlertFiltersBarProps = {
  readonly filters: AlertFilters;
  readonly onChange: (filters: AlertFilters, mode?: HistoryMode) => void;
};

export function AlertFiltersBar({ filters, onChange }: AlertFiltersBarProps) {
  const statusId = useId();
  const severityId = useId();
  const typeId = useId();
  // Un tipo que llegó por URL y no está entre los conocidos sigue siendo el
  // filtro aplicado: se ofrece como opción para que el selector no mienta.
  const typeOptions =
    filters.type && !KNOWN_ALERT_TYPES.includes(filters.type)
      ? [...KNOWN_ALERT_TYPES, filters.type]
      : KNOWN_ALERT_TYPES;

  return (
    <div className={styles.filters} role="search" aria-label="Filtrar alertas">
      <p className={styles.field}>
        <label className="lbl" htmlFor={statusId}>
          Estado
        </label>
        <select
          id={statusId}
          className="select"
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: toStatusFilter(event.target.value) })}
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_FILTER_LABEL[option]}
            </option>
          ))}
        </select>
      </p>
      <p className={styles.field}>
        <label className="lbl" htmlFor={severityId}>
          Gravedad
        </label>
        <select
          id={severityId}
          className="select"
          value={filters.severity ?? ANY}
          onChange={(event) => onChange({ ...filters, severity: toSeverity(event.target.value) })}
        >
          <option value={ANY}>Todas</option>
          {ALL_ALERT_SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {SEVERITY_BADGE[severity].label}
            </option>
          ))}
        </select>
      </p>
      <p className={styles.field}>
        <label className="lbl" htmlFor={typeId}>
          Tipo
        </label>
        <select
          id={typeId}
          className="select"
          value={filters.type ?? ANY}
          onChange={(event) => onChange({ ...filters, type: event.target.value || null })}
        >
          <option value={ANY}>Todos</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
      </p>
      <SearchBox
        value={filters.search}
        onCommit={(search) => onChange({ ...filters, search }, "replace")}
      />
      {!isDefaultFilters(filters) ? (
        <button className="btn-sm" type="button" onClick={() => onChange(DEFAULT_ALERT_FILTERS)}>
          Quitar filtros
        </button>
      ) : null}
    </div>
  );
}
