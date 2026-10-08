import { granularityToWire } from "@/app/lib/analitica/granularity";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import { RANGE_PARAM, type ParamEntries } from "@/app/lib/analitica/urlRange/params";

/** Los parámetros del rango, listos para una `URLSearchParams` o un `<Link>`. */
export function rangeToParams(range: DateRange): Record<string, string> {
  return {
    [RANGE_PARAM.from]: range.from,
    [RANGE_PARAM.toExclusive]: range.toExclusive,
    [RANGE_PARAM.granularity]: granularityToWire(range.granularity),
  };
}

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
