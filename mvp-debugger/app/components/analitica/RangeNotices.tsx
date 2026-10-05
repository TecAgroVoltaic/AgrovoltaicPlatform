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
import type { RangeParse, RangeProblem } from "@/app/lib/analitica/urlRange";

export type RangeNoticesProps = {
  readonly range: DateRange;
  readonly parse: RangeParse;
  /** Problemas de lo que se acaba de escribir en el formulario. */
  readonly formProblems: readonly RangeProblem[];
  readonly summaryId: string;
};

export function RangeNotices({ range, parse, formProblems, summaryId }: RangeNoticesProps) {
  const urlProblems = parse.outcome === "fallback" ? parse.problems : [];
  const problems = [...formProblems, ...urlProblems];
  const days = rangeDays(range);
  const outOfCoverage = !rangesOverlap(range, VERIFIED_COVERAGE);

  return (
    <>
      <p className="rng-resumen" id={summaryId}>
        <b>{formatRange(range)}</b> · {days} {days === 1 ? "día" : "días"} ·{" "}
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
      {outOfCoverage ? (
        <p className="rng-aviso" role="status">
          {OUT_OF_COVERAGE_NOTICE}
        </p>
      ) : null}
    </>
  );
}
