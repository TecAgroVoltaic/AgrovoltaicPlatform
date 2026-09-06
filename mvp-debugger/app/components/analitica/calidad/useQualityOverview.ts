"use client";
// La carga de la vista Calidad: UNA sola espera, y solo de lo que se ve al
// entrar.
//
// Las dos lecturas van en un `Promise.all` y no en cascada: ninguna necesita el
// resultado de otra, y encadenarlas duplicaría el tiempo en blanco de una
// pantalla que ya es lenta de leer.
//
// Lo que NO está acá es tan deliberado como lo que está. `calidad/dias` (221 KB)
// y `arquitectura` (32 KB) alimentan pestañas, y se piden la primera vez que se
// abre la suya (ver `useDeferredAnalytics`). Entre las dos son el 84 % de lo que
// bajaba esta pantalla para enseñar el veredicto.
//
// `calidad/hallazgos` sí sale de entrada por dos motivos: su `total` es la
// escala de las cifras del bloque de vigilancia, que se lee sin ningún gesto, y
// de paso deja servida la primera página del explorador.
import { useCallback, useEffect, useState } from "react";

import { fetchAnalytics } from "@/app/lib/analitica/client";
import {
  emptyChart,
  errorChart,
  loadingChart,
  readyChart,
  EMPTY_REASON_MESSAGE,
  type ChartState,
} from "@/app/components/charts";
import { OUT_OF_COVERAGE_NOTICE, VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { isRetryable, type AnalyticsResult } from "@/app/lib/analitica/errors";
import { rangesOverlap, type DateRange } from "@/app/lib/analitica/dateRange";
import {
  findingsPageSchema,
  qualitySummarySchema,
  type FindingsPage,
  type QualitySummary,
} from "@/app/lib/analitica/contracts/calidad";

/** Cuántos hallazgos trae cada página. El servicio admite hasta 200. */
export const FINDINGS_PAGE_SIZE = 50;

export type QualityOverview = {
  readonly summary: QualitySummary;
  /** Primera página SIN filtrar: su `total` es el del período entero. */
  readonly findings: FindingsPage;
};

export type QualityOverviewController = {
  readonly state: ChartState<QualityOverview>;
  readonly reload: () => void;
};

export function useQualityOverview(range: DateRange): QualityOverviewController {
  const [state, setState] = useState<ChartState<QualityOverview>>(loadingChart);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    // Fuera de la cobertura conocida no hay nada que preguntar: el sistema dejó
    // de reportar el 2026-06-01 y la respuesta sería un cero sin explicación.
    if (!rangesOverlap(range, VERIFIED_COVERAGE)) {
      setState(emptyChart("OUT_OF_COVERAGE", { message: OUT_OF_COVERAGE_NOTICE }));
      return;
    }
    let cancelled = false;
    setState(loadingChart());
    void requestOverview(range).then((result) => {
      if (!cancelled) setState(toChartState(result, reload));
    });
    return () => {
      cancelled = true;
    };
  }, [range, attempt, reload]);

  return { state, reload };
}

async function requestOverview(range: DateRange): Promise<AnalyticsResult<QualityOverview>> {
  const [summary, findings] = await Promise.all([
    fetchAnalytics({ path: "calidad/resumen", range, schema: qualitySummarySchema }),
    fetchAnalytics({
      path: "calidad/hallazgos",
      range,
      query: { limite: String(FINDINGS_PAGE_SIZE) },
      schema: findingsPageSchema,
    }),
  ]);
  // Basta con que uno falle: media pantalla de calidad es peor que ninguna,
  // porque las cifras que sí llegaron se leerían como el período completo.
  if (!summary.ok) return summary;
  if (!findings.ok) return findings;
  return { ok: true, data: { summary: summary.data, findings: findings.data } };
}

function toChartState(
  result: AnalyticsResult<QualityOverview>,
  reload: () => void,
): ChartState<QualityOverview> {
  if (!result.ok) {
    const { failure } = result;
    return errorChart(failure.message, isRetryable(failure) ? reload : undefined);
  }
  const { verdict } = result.data.summary;
  if (verdict.daysWithData === 0) {
    return emptyChart("NO_ROWS", {
      message: verdict.warning ?? EMPTY_REASON_MESSAGE.NO_ROWS,
      hint: `El rango abarca ${verdict.daysInRange} días de calendario y ninguno trajo una sola fila.`,
    });
  }
  return readyChart(result.data);
}
