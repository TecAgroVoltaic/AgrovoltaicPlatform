"use client";
// Leer y escribir el año de la climatología en la URL (`?clima=`).
//
// Como el rango, el año NO se duplica en React: la URL es la única fuente de
// verdad, así el enlace se comparte mostrando el mismo año.
import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  readYearParam,
  resolveYear,
  yearToQuery,
  yearsWithData,
} from "@/app/components/analitica/tablero/climatologia/climatologyYear";
import { useDaysWithData } from "@/app/lib/analitica/useDaysWithData";
import { calendarYear, hoyEnSitio } from "@/app/lib/tiempo";

export type ClimatologyYearController = {
  /** null mientras todavía no se sabe qué años tienen datos. */
  readonly year: number | null;
  /** Los años que se ofrecen, del más viejo al más nuevo. */
  readonly years: readonly number[];
  /** true desde el clic hasta que la URL nueva se pinta: `router.push` vuelve
   *  a pedir la página al servidor y eso tarda lo que tarden los KPIs. */
  readonly changing: boolean;
  readonly setYear: (year: number) => void;
};

const NO_YEARS: readonly number[] = [];

export function useClimatologyYear(): ClimatologyYearController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const coverage = useDaysWithData();
  const [changing, startTransition] = useTransition();

  const requested = useMemo(() => readYearParam(searchParams), [searchParams]);
  const years = useMemo(
    () => (coverage.status === "ready" ? yearsWithData(coverage.bounds) : NO_YEARS),
    [coverage],
  );

  const setYear = useCallback(
    // Sin `scroll: false` el cambio de año saltaría al tope de la portada, lejos
    // del selector que se acaba de tocar.
    (year: number) =>
      startTransition(() => router.push(`${pathname}${yearToQuery(year, searchParams)}`, { scroll: false })),
    [router, pathname, searchParams],
  );

  if (coverage.status === "loading") return { year: null, years: NO_YEARS, changing, setYear };
  if (coverage.status === "ready") return { year: resolveYear(requested, years), years, changing, setYear };
  // Sin cobertura conocida (falló o la base está vacía) no se bloquea la sección:
  // se muestra el año pedido o el actual, y la consulta dirá si está vacío.
  const fallbackYear = requested ?? calendarYear(hoyEnSitio());
  return { year: fallbackYear, years: [fallbackYear], changing, setYear };
}
