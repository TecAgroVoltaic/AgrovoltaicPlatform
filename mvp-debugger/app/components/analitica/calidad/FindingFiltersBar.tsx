"use client";
// Los filtros del explorador de hallazgos.
//
// El día se elige acá y no pinchando el mapa: el mapa tiene hasta 660 celdas por
// tira y convertirlas en botones llenaría el recorrido de tabulador. Un `select`
// nativo hace el mismo trabajo, se maneja con teclado y se puede buscar tecleando.
import { useId } from "react";

import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { DAY_VERDICT_BADGE, SEVERITY_BADGE } from "@/app/components/analitica/calidad/labels";
import {
  isFiltered,
  NO_FILTERS,
  type FindingFilters,
} from "@/app/components/analitica/calidad/useFindingsQuery";
import { SEVERITY_ORDER, type QualityDay, type Severity } from "@/app/lib/analitica/contracts/calidad";

const ANY = "";
/** Los días son una lectura aparte y más lenta que esta barra: mientras no
 * llegan, el selector se ve deshabilitado y dice por qué. Ocultarlo movería la
 * fila entera al llegar, y una lista vacía se leería como "no hay días". */
const DAYS_NOT_HERE_YET = "los días del período todavía no llegaron";

/** El `value` de un `select` es siempre `string`: se estrecha, no se castea. */
function toSeverity(value: string): Severity | null {
  return SEVERITY_ORDER.find((severity) => severity === value) ?? null;
}

export type FindingFiltersBarProps = {
  readonly filters: FindingFilters;
  readonly days: readonly QualityDay[];
  readonly onChange: (next: FindingFilters) => void;
};

export function FindingFiltersBar({ filters, days, onChange }: FindingFiltersBarProps) {
  const severityId = useId();
  const dayId = useId();
  const evaluated = days.filter((day) => day.verdict !== "noData");

  return (
    <div className={styles.filters}>
      <p className={styles.field}>
        <label className="lbl" htmlFor={severityId}>
          Gravedad
        </label>
        <select
          className="select"
          id={severityId}
          value={filters.severity ?? ANY}
          onChange={(event) => onChange({ ...filters, severity: toSeverity(event.target.value) })}
        >
          <option value={ANY}>Todas</option>
          {SEVERITY_ORDER.map((severity) => (
            <option key={severity} value={severity}>
              {SEVERITY_BADGE[severity].label}
            </option>
          ))}
        </select>
      </p>

      <p className={styles.field}>
        <label className="lbl" htmlFor={dayId}>
          Día evaluado
        </label>
        <select
          className="select"
          id={dayId}
          disabled={evaluated.length === 0}
          value={filters.date ?? ANY}
          onChange={(event) => onChange({ ...filters, date: event.target.value || null })}
        >
          <option value={ANY}>
            {evaluated.length === 0 ? DAYS_NOT_HERE_YET : "Todo el período"}
          </option>
          {[...evaluated].reverse().map((day) => (
            <option key={day.date} value={day.date}>
              {day.date} · {DAY_VERDICT_BADGE[day.verdict].label}
            </option>
          ))}
        </select>
      </p>

      {filters.type ? (
        <button className="btn-sm" type="button" onClick={() => onChange({ ...filters, type: null })}>
          Tipo: {filters.type} (quitar)
        </button>
      ) : null}

      {isFiltered(filters) ? (
        <button className="btn-sm" type="button" onClick={() => onChange(NO_FILTERS)}>
          Quitar todos los filtros
        </button>
      ) : null}
    </div>
  );
}
