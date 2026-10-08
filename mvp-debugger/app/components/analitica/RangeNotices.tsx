"use client";
// Lo que hay que decir sobre el rango vigente: cuánto abarca, qué venía mal en
// la URL y si cae fuera de la cobertura de la base.
//
// El aviso de cobertura no es decoración: con el sistema PV parado desde el
// 2026-06-01, pedir "los últimos 30 días" contra el reloj devuelve una pantalla
// entera vacía, y sin este texto parece una avería.
import {
  GRANULARITY_LABEL,
  GRANULARITY_POINT_LABEL,
} from "@/app/lib/analitica/granularity";
import { OUT_OF_COVERAGE_NOTICE, VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { formatRange, rangeDays, rangesOverlap, type DateRange } from "@/app/lib/analitica/dateRange";
import { rangeDataDays, rangeDataNotice } from "@/app/lib/analitica/rangeDataDays";
import type { RangeParse, RangeProblem } from "@/app/lib/analitica/urlRange";
import type { DaysWithDataState } from "@/app/lib/analitica/useDaysWithData";

export type RangeNoticesProps = {
  readonly range: DateRange;
  readonly parse: RangeParse;
  /** Problemas de lo que se acaba de escribir en el formulario. */
  readonly formProblems: readonly RangeProblem[];
  readonly summaryId: string;
  /** Con la lista de días cargada, el resumen cuenta los días con datos y el
   *  aviso de cobertura sale de ella y no de `VERIFIED_COVERAGE`. */
  readonly daysWithData: DaysWithDataState;
};

export function RangeNotices({ range, parse, formProblems, summaryId, daysWithData }: RangeNoticesProps) {
  const urlProblems = parse.outcome === "fallback" ? parse.problems : [];
  const problems = [...formProblems, ...urlProblems];
  const days = rangeDays(range);
  const dataDays = daysWithData.status === "ready" ? rangeDataDays(range, daysWithData.days) : null;
  const coverageNotice =
    daysWithData.status === "ready" && dataDays
      ? rangeDataNotice(range, dataDays, daysWithData.bounds)
      : fallbackCoverageNotice(range);

  return (
    <>
      <p className="rng-resumen" id={summaryId}>
        <b>{formatRange(range)}</b> ·{" "}
        {dataDays ? `${dataDays.daysWithData} de ${days} días con datos` : daysLabel(days)} ·{" "}
        {GRANULARITY_LABEL[range.granularity]} ({GRANULARITY_POINT_LABEL[range.granularity].toLowerCase()})
      </p>
      {problems.length > 0 ? (
        <div className="rng-aviso" role="alert">
          <b>El rango no se pudo aplicar</b>
          {problems.map((problem) => (
            <span key={`${problem.code}-${problem.param}`}>{problem.message}</span>
          ))}
        </div>
      ) : null}
      {coverageNotice ? (
        <p className="rng-aviso" role="status">
          {coverageNotice}
        </p>
      ) : null}
    </>
  );
}

/** Sin la lista de días, solo se puede comparar contra la cobertura escrita a mano. */
function fallbackCoverageNotice(range: DateRange): string | null {
  return rangesOverlap(range, VERIFIED_COVERAGE) ? null : OUT_OF_COVERAGE_NOTICE;
}

function daysLabel(days: number): string {
  return `${days} ${days === 1 ? "día" : "días"}`;
}
