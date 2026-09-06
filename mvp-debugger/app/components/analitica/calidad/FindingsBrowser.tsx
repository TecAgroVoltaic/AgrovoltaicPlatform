"use client";
// El detalle: filtros arriba, hallazgos paginados abajo, y sus propios cuatro
// estados.
//
// Que el bloque tenga estados propios evita el peor final: dejar los hallazgos
// anteriores en pantalla mientras la página nueva viaja, que se lee como si el
// filtro no hubiera hecho nada.
import { FindingFiltersBar } from "@/app/components/analitica/calidad/FindingFiltersBar";
import { FindingsList } from "@/app/components/analitica/calidad/FindingsList";
import { SectionState } from "@/app/components/analitica/calidad/SectionState";
import {
  useFindingsQuery,
  withFilters,
  type FindingFilters,
  type FindingsQuery,
} from "@/app/components/analitica/calidad/useFindingsQuery";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import type { FindingsPage, QualityDay } from "@/app/lib/analitica/contracts/calidad";

const WHAT = "los hallazgos del período";

export type FindingsBrowserProps = {
  readonly range: DateRange;
  readonly firstPage: FindingsPage;
  readonly days: readonly QualityDay[];
  readonly query: FindingsQuery;
  readonly onQueryChange: (next: FindingsQuery) => void;
};

export function FindingsBrowser({
  range,
  firstPage,
  days,
  query,
  onQueryChange,
}: FindingsBrowserProps) {
  const state = useFindingsQuery(range, firstPage, query);

  const changeFilters = (filters: FindingFilters) => onQueryChange(withFilters(filters));
  const goTo = (offset: number) => onQueryChange({ ...query, offset });

  return (
    <section className="card" aria-labelledby="hallazgos">
      <h2 className="kpi-title" id="hallazgos">
        Hallazgos, uno por uno
      </h2>
      <FindingFiltersBar filters={query.filters} days={days} onChange={changeFilters} />
      <SectionState what={WHAT} state={state} />
      {state.status === "ready" ? <FindingsList page={state.data} onGoTo={goTo} /> : null}
    </section>
  );
}
