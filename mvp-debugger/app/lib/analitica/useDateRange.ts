"use client";
// Leer y escribir el rango de la URL desde un componente de cliente.
//
// El estado del rango NO se duplica en React: la URL es la única fuente de
// verdad. Dos fuentes producirían pantallas que se comparten mostrando algo
// distinto de lo que se estaba mirando.
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseRangeParams, rangeToQuery, type RangeParse } from "@/app/lib/analitica/urlRange";
import type { DateRange } from "@/app/lib/analitica/dateRange";

export type DateRangeController = {
  /** El rango vigente, ya validado. */
  readonly range: DateRange;
  /** Cómo se llegó a él: `fallback` trae además los problemas que hubo. */
  readonly parse: RangeParse;
  /** Reemplaza el rango en la URL conservando la ruta Y el resto de la query:
   *  la variable elegida, el filtro abierto y cualquier otro estado de la vista
   *  sobreviven al cambio de período, así que el enlace se puede compartir tal
   *  como se está mirando. */
  readonly setRange: (range: DateRange) => void;
};

export function useDateRange(): DateRangeController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parse = useMemo(() => parseRangeParams(searchParams), [searchParams]);

  const setRange = useCallback(
    (range: DateRange) => router.push(`${pathname}${rangeToQuery(range, searchParams)}`),
    [router, pathname, searchParams],
  );

  return { range: parse.range, parse, setRange };
}
