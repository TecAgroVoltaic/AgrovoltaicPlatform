"use client";
// El detalle de hallazgos: filtro + página. Se separa de `useQualityOverview`
// porque tiene un ciclo de vida propio: la primera página llega con la carga
// única de la vista y solo se vuelve a pedir cuando cambia el filtro o la página.
//
// El filtro y el desplazamiento viajan JUNTOS en un mismo objeto, y cambiar el
// filtro reconstruye la consulta desde `offset: 0`. Separados, olvidarse de
// reponer el desplazamiento deja a la persona en la página nueve de un resultado
// de tres, viendo un vacío que parece un fallo.
//
// El estado NO vive acá: lo pasa quien llama, así la tabla de tipos y la barra
// de filtros escriben sobre la misma consulta y no hay dos copias que sincronizar.
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAnalytics } from "@/app/lib/analitica/client";
import { emptyChart, errorChart, loadingChart, readyChart, type ChartState } from "@/app/components/charts";
import { isRetryable } from "@/app/lib/analitica/errors";
import type { DateRange, IsoDate } from "@/app/lib/analitica/dateRange";
import {
  findingsPageSchema,
  severityToWire,
  type FindingsPage,
  type Severity,
} from "@/app/lib/analitica/contracts/calidad";
import { FINDINGS_PAGE_SIZE } from "@/app/components/analitica/calidad/useQualityOverview";

export type FindingFilters = {
  readonly severity: Severity | null;
  readonly type: string | null;
  readonly date: IsoDate | null;
};

export type FindingsQuery = {
  readonly filters: FindingFilters;
  readonly offset: number;
};

const FIRST_OFFSET = 0;
export const NO_FILTERS: FindingFilters = { severity: null, type: null, date: null };
export const FIRST_QUERY: FindingsQuery = { filters: NO_FILTERS, offset: FIRST_OFFSET };

export function isFiltered(filters: FindingFilters): boolean {
  return filters.severity !== null || filters.type !== null || filters.date !== null;
}

/** Cambiar un filtro SIEMPRE vuelve a la primera página. Por eso hay una sola
 * puerta para hacerlo, en vez de un `setQuery` que cada llamador use a su modo. */
export function withFilters(filters: FindingFilters): FindingsQuery {
  return { filters, offset: FIRST_OFFSET };
}

function isFirstPage(query: FindingsQuery): boolean {
  return !isFiltered(query.filters) && query.offset === FIRST_OFFSET;
}

export function useFindingsQuery(
  range: DateRange,
  firstPage: FindingsPage,
  query: FindingsQuery,
): ChartState<FindingsPage> {
  const [state, setState] = useState<ChartState<FindingsPage>>(() => pageToState(firstPage, query));
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);
  const params = useMemo(() => toParams(query), [query]);
  const isDefault = isFirstPage(query);

  useEffect(() => {
    // La página por defecto ya vino con la carga única de la vista: volver a
    // pedirla sería una cascada disfrazada de refresco.
    if (isDefault) {
      setState(pageToState(firstPage, FIRST_QUERY));
      return;
    }
    let cancelled = false;
    setState(loadingChart());
    void fetchAnalytics({ path: "calidad/hallazgos", range, query: params, schema: findingsPageSchema }).then(
      (result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? pageToState(result.data, query)
            : errorChart(result.failure.message, isRetryable(result.failure) ? retry : undefined),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [range, params, isDefault, firstPage, query, attempt, retry]);

  return state;
}

function toParams(query: FindingsQuery): Record<string, string> {
  const { filters } = query;
  return {
    limite: String(FINDINGS_PAGE_SIZE),
    offset: String(query.offset),
    ...(filters.severity ? { severidad: severityToWire(filters.severity) } : {}),
    ...(filters.type ? { tipo: filters.type } : {}),
    ...(filters.date ? { fecha: filters.date } : {}),
  };
}

function pageToState(page: FindingsPage, query: FindingsQuery): ChartState<FindingsPage> {
  if (page.total > 0) return readyChart(page);
  return isFiltered(query.filters)
    ? emptyChart("FILTERED_OUT", {
        message: "Ningún hallazgo coincide con los filtros elegidos.",
        hint: "Quitá un filtro para volver a ver el período completo.",
      })
    : emptyChart("NO_ROWS", {
        message: "El período no registró ni un hallazgo.",
        hint: "Que no haya hallazgos no dice que el dato esté limpio: mirá qué variables vigila el barrido.",
      });
}
