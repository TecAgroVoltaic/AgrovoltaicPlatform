import { granularityFromWire, type Granularity } from "@/app/lib/analitica/granularity";
import { DEFAULT_RANGE } from "@/app/lib/analitica/coverage";
import { isIsoDate, type DateRange } from "@/app/lib/analitica/dateRange";
import { RANGE_PARAM, type ParamReader } from "@/app/lib/analitica/urlRange/params";

export type RangeProblemCode =
  | "INVALID_DATE"
  | "INCOMPLETE_RANGE"
  | "END_NOT_AFTER_START"
  | "INVALID_GRANULARITY";

export type RangeProblem = {
  readonly code: RangeProblemCode;
  readonly param: string;
  readonly message: string;
};

/**
 * Tres desenlaces, y son distintos a propósito:
 * - `parsed`: la URL traía un rango válido.
 * - `default`: no traía ninguno (primera visita). No es un problema, no se avisa.
 * - `fallback`: traía algo y estaba mal. Se usa el rango por defecto y se avisa,
 *   porque callarlo haría que la persona lea los datos de OTRO rango creyendo
 *   que son los que pidió.
 */
export type RangeParse =
  | { readonly outcome: "parsed"; readonly range: DateRange }
  | { readonly outcome: "default"; readonly range: DateRange }
  | {
      readonly outcome: "fallback";
      readonly range: DateRange;
      readonly problems: readonly RangeProblem[];
    };

function invalidDate(param: string): RangeProblem {
  return {
    code: "INVALID_DATE",
    param,
    message: `«${param}» no es una fecha válida con formato AAAA-MM-DD.`,
  };
}

export function parseRangeParams(params: ParamReader): RangeParse {
  const rawFrom = params.get(RANGE_PARAM.from);
  const rawTo = params.get(RANGE_PARAM.toExclusive);
  const rawGranularity = params.get(RANGE_PARAM.granularity);

  const granularity = resolveGranularity(rawGranularity);
  const problems: RangeProblem[] = granularity.problem ? [granularity.problem] : [];

  if (rawFrom === null && rawTo === null) {
    const range = { ...DEFAULT_RANGE, granularity: granularity.value };
    return problems.length > 0
      ? { outcome: "fallback", range, problems }
      : { outcome: "default", range };
  }

  if (rawFrom === null || rawTo === null) {
    problems.push({
      code: "INCOMPLETE_RANGE",
      param: rawFrom === null ? RANGE_PARAM.from : RANGE_PARAM.toExclusive,
      message: "El rango necesita las dos fechas: «desde» y «hasta».",
    });
    return { outcome: "fallback", range: DEFAULT_RANGE, problems };
  }

  problems.push(...datesProblems(rawFrom, rawTo));
  if (problems.length > 0) {
    return { outcome: "fallback", range: DEFAULT_RANGE, problems };
  }
  return {
    outcome: "parsed",
    range: { from: rawFrom, toExclusive: rawTo, granularity: granularity.value },
  };
}

function resolveGranularity(
  raw: string | null,
): { value: Granularity; problem: RangeProblem | null } {
  if (raw === null) return { value: DEFAULT_RANGE.granularity, problem: null };
  const parsed = granularityFromWire(raw);
  if (parsed) return { value: parsed, problem: null };
  return {
    value: DEFAULT_RANGE.granularity,
    problem: {
      code: "INVALID_GRANULARITY",
      param: RANGE_PARAM.granularity,
      message: `«${raw}» no es un grano válido: hora, dia, semana o mes.`,
    },
  };
}

function datesProblems(rawFrom: string, rawTo: string): RangeProblem[] {
  const problems: RangeProblem[] = [];
  if (!isIsoDate(rawFrom)) problems.push(invalidDate(RANGE_PARAM.from));
  if (!isIsoDate(rawTo)) problems.push(invalidDate(RANGE_PARAM.toExclusive));
  if (problems.length === 0 && rawTo <= rawFrom) {
    problems.push({
      code: "END_NOT_AFTER_START",
      param: RANGE_PARAM.toExclusive,
      message: "«hasta» es exclusivo: tiene que ser posterior a «desde».",
    });
  }
  return problems;
}
