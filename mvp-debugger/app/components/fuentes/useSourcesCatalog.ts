"use client";
// El catálogo de fuentes, con carga, error con reintento y vacío. No depende del
// rango: describe qué hay en cada fuente, no un período.
import { useCallback, useEffect, useState } from "react";

import { emptyChart, errorChart, loadingChart, readyChart, type ChartState } from "@/app/components/charts";
import { fetchResource } from "@/app/lib/analitica/client";
import { isRetryable } from "@/app/lib/analitica/errors";
import { sourcesCatalogSchema, type SourcesCatalog } from "@/app/lib/fuentes/contracts";

const SOURCES_PATH = "fuentes";
const NO_SOURCES_MESSAGE = "El servicio no informó ninguna fuente de datos.";

export function useSourcesCatalog(): ChartState<SourcesCatalog> {
  const [state, setState] = useState<ChartState<SourcesCatalog>>(loadingChart);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState(loadingChart());
    void fetchResource({ path: SOURCES_PATH, schema: sourcesCatalogSchema, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setState(errorChart(result.failure.message, isRetryable(result.failure) ? retry : undefined));
          return;
        }
        setState(
          result.data.sources.length === 0
            ? emptyChart("NO_SOURCE", { message: NO_SOURCES_MESSAGE })
            : readyChart(result.data),
        );
      },
    );
    return () => controller.abort();
  }, [attempt, retry]);

  return state;
}
