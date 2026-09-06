"use client";
// Las consultas de la vista Comparativa.
//
// Las dos que necesita la primera pantalla salen JUNTAS, en una sola espera: en
// cascada la pantalla tardaría el doble y en paralelo tarda lo que la más lenta.
// `fetchAnalytics` devuelve un resultado y NUNCA lanza, así que el `Promise.all`
// no se puede romper por una consulta caída: la figura que dependía de ella
// muestra su error y las demás se pintan igual. Esa garantía es del cliente, y
// por eso acá no hay un solo try/catch.
//
// El detalle diario va aparte porque pesa más de diez veces que las otras dos
// juntas, y la vista se entiende entera sin él.
import { useCallback, useEffect, useState } from "react";

import { fetchAnalytics } from "@/app/lib/analitica/client";
import {
  arrayComparisonSchema,
  performanceReportSchema,
  type ArrayComparison,
  type PerformanceReport,
} from "@/app/lib/analitica/contracts/comparativa";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const COMPARISON_PATH = "analitica/comparativa";
const PERFORMANCE_PATH = "analitica/rendimiento";
const DETAIL_QUERY = { detalle: "true" } as const;

type Loaded = {
  readonly comparison: AnalyticsResult<ArrayComparison> | null;
  readonly report: AnalyticsResult<PerformanceReport> | null;
};

const IN_FLIGHT: Loaded = { comparison: null, report: null };

export type ComparisonData = Loaded & {
  /** null mientras nadie lo pidió o mientras viene en camino. */
  readonly detail: AnalyticsResult<PerformanceReport> | null;
  readonly detailRequested: boolean;
  readonly requestDetail: () => void;
  /** Vuelve a pedir todo lo que esté a la vista. Es el reintento de cada figura. */
  readonly reload: () => void;
};

export function useComparison(range: DateRange): ComparisonData {
  const [loaded, setLoaded] = useState<Loaded>(IN_FLIGHT);
  const [detail, setDetail] = useState<AnalyticsResult<PerformanceReport> | null>(null);
  const [detailRequested, setDetailRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);
  const requestDetail = useCallback(() => setDetailRequested(true), []);

  // Las dependencias son los VALORES del rango y no el objeto: un llamador que
  // reconstruya el rango en cada render dispararía una consulta por render, y
  // cada una abortaría a la anterior sin llegar nunca a pintar nada.
  const { from, toExclusive, granularity } = range;

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const activeRange: DateRange = { from, toExclusive, granularity };
    setLoaded(IN_FLIGHT);

    Promise.all([
      fetchAnalytics({ path: COMPARISON_PATH, range: activeRange, schema: arrayComparisonSchema, signal }),
      fetchAnalytics({ path: PERFORMANCE_PATH, range: activeRange, schema: performanceReportSchema, signal }),
    ]).then(([comparison, report]) => {
      // Con la consulta abortada los dos resultados son fallos de red que ya no
      // le importan a nadie: pintarlos sobrescribiría la respuesta buena.
      if (signal.aborted) return;
      setLoaded({ comparison, report });
    });

    return () => controller.abort();
  }, [from, toExclusive, granularity, attempt]);

  // El detalle sigue al rango una vez pedido: dejar abierto un panel con los días
  // de OTRO período sería peor que volver a bajarlo.
  useEffect(() => {
    if (!detailRequested) return undefined;
    const controller = new AbortController();
    const signal = controller.signal;
    setDetail(null);

    fetchAnalytics({
      path: PERFORMANCE_PATH,
      range: { from, toExclusive, granularity },
      query: DETAIL_QUERY,
      schema: performanceReportSchema,
      signal,
    }).then((result) => {
      if (signal.aborted) return;
      setDetail(result);
    });

    return () => controller.abort();
  }, [from, toExclusive, granularity, attempt, detailRequested]);

  return { ...loaded, detail, detailRequested, requestDetail, reload };
}
