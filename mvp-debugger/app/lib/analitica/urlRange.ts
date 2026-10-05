// El rango vive en la URL (`?desde=&hasta=&granularidad=`), no en un estado de
// React. Así una pantalla se comparte por chat tal cual se está mirando, el
// navegador la puede cachear, y un Server Component puede leerla sin hidratar.
//
// Los nombres de los parámetros van en español porque son parte del contrato
// público (URL + backend); los identificadores, en inglés. La frontera es este
// archivo.
import {
  granularityFromWire,
  granularityToWire,
  type Granularity,
} from "@/app/lib/analitica/granularity";
import { DEFAULT_RANGE } from "@/app/lib/analitica/coverage";
import { isIsoDate, type DateRange } from "@/app/lib/analitica/dateRange";

export const RANGE_PARAM = {
  from: "desde",
  toExclusive: "hasta",
  granularity: "granularidad",
} as const;

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

/** Lo mínimo que hace falta para leer parámetros: lo cumplen `URLSearchParams` y
 * el `ReadonlyURLSearchParams` de Next sin adaptador de por medio. */
export type ParamReader = { get(name: string): string | null };

/** Adapta el `searchParams` que recibe una página (Server Component). */
export function readerFromRecord(
  record: Readonly<Record<string, string | string[] | undefined>>,
): ParamReader {
  return {
    get(name) {
      const value = record[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

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

/** Los parámetros del rango, listos para una `URLSearchParams` o un `<Link>`. */
export function rangeToParams(range: DateRange): Record<string, string> {
  return {
    [RANGE_PARAM.from]: range.from,
    [RANGE_PARAM.toExclusive]: range.toExclusive,
    [RANGE_PARAM.granularity]: granularityToWire(range.granularity),
  };
}

/** Lo mínimo para RECORRER una query. Lo cumplen `URLSearchParams` y el
 *  `ReadonlyURLSearchParams` de Next sin adaptador de por medio. */
export type ParamEntries = Iterable<readonly [string, string]>;

const RANGE_PARAM_NAMES: ReadonlySet<string> = new Set(Object.values(RANGE_PARAM));

/**
 * Query string con el `?` incluido. Con `current`, el rango se escribe ENCIMA de
 * esa query en vez de reemplazarla.
 *
 * QUÉ SOBREVIVE Y POR QUÉ: todo lo que ya estaba, salvo los tres parámetros del
 * rango (que se reescriben, nunca se duplican) y los vacíos (`?variable=` no es
 * estado, es ruido que alarga el enlace). El criterio es de propiedad: el rango
 * es del cascarón y la vista es dueña del resto, y mover una fecha NO cambia de
 * vista, así que todo lo demás de esa URL es parte de lo que se está mirando
 * ahora. Una lista blanca acá sería peor: la vista que olvidara registrar su
 * parámetro volvería a perderlo EN SILENCIO, que es justo el defecto que esto
 * arregla. Los parámetros que sí quedan muertos son los que cruzan de una
 * sección a otra, y esa frontera es la navegación (`SectionNav`), no esta.
 */
export function rangeToQuery(range: DateRange, current?: ParamEntries): string {
  const params = new URLSearchParams();
  for (const [name, value] of current ?? []) {
    if (value !== "" && !RANGE_PARAM_NAMES.has(name)) params.append(name, value);
  }
  for (const [name, value] of Object.entries(rangeToParams(range))) params.set(name, value);
  return `?${params.toString()}`;
}
