// El rango mientras se edita en el formulario, con el fin INCLUSIVO.
//
// La URL y el backend usan [desde, hasta) con `hasta` exclusivo; una persona
// piensa en «del 3 de mayo al 1 de junio». El borrador guarda lo que ve la
// persona y la conversión (+1 día) pasa en un solo lugar: `draftToRange`.
import { addDays, type DateRange, type IsoDate } from "@/app/lib/analitica/dateRange";
import { granularityToWire, type Granularity } from "@/app/lib/analitica/granularity";
import {
  RANGE_PARAM,
  parseRangeParams,
  readerFromRecord,
  type RangeProblem,
} from "@/app/lib/analitica/urlRange";

export type RangeDraft = {
  readonly from: IsoDate;
  /** Último día que entra en el rango (el «Hasta» del formulario). */
  readonly lastIncludedDay: IsoDate;
  readonly granularity: Granularity;
};

export type DraftResult =
  | { readonly ok: true; readonly range: DateRange }
  | { readonly ok: false; readonly problems: readonly RangeProblem[] };

const END_BEFORE_START: RangeProblem = {
  code: "END_NOT_AFTER_START",
  param: RANGE_PARAM.toExclusive,
  message: "«Hasta» no puede ser anterior a «Desde».",
};

export function draftFromRange(range: DateRange): RangeDraft {
  return {
    from: range.from,
    lastIncludedDay: addDays(range.toExclusive, -1),
    granularity: range.granularity,
  };
}

/**
 * El borrador como rango de URL, validado por el MISMO intérprete que lee la
 * URL. Con fin inclusivo, «Hasta» igual a «Desde» es un día y es válido; el
 * caso al revés se dice en palabras del formulario y no con el «hasta es
 * exclusivo» del intérprete, que acá no tendría sentido.
 */
export function draftToRange(draft: RangeDraft): DraftResult {
  if (draft.lastIncludedDay < draft.from) return { ok: false, problems: [END_BEFORE_START] };
  const attempt = parseRangeParams(
    readerFromRecord({
      [RANGE_PARAM.from]: draft.from,
      [RANGE_PARAM.toExclusive]: addDays(draft.lastIncludedDay, 1),
      [RANGE_PARAM.granularity]: granularityToWire(draft.granularity),
    }),
  );
  if (attempt.outcome === "parsed") return { ok: true, range: attempt.range };
  return { ok: false, problems: attempt.outcome === "fallback" ? attempt.problems : [] };
}
