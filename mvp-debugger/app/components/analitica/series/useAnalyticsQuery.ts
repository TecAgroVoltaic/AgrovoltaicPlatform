"use client";
// Una consulta de análisis con su ciclo de vida: carga, dato, fallo y reintento.
//
// LO QUE ESTE HOOK EXISTE PARA EVITAR es la carrera de respuestas. Al cambiar de
// variable salen dos peticiones y la primera puede volver después de la segunda;
// sin cortar la vieja, el gráfico terminaría mostrando la variable anterior con
// el nombre de la nueva, que es peor que un error porque no se nota. Por eso hay
// las dos cosas: `AbortSignal` para que la petición muerta no siga viajando, y la
// bandera `active` para que su resultado no pinte aunque llegue.
//
// Las dependencias del efecto son PRIMITIVAS a propósito. Con un objeto
// (`range`, `query`) cualquier render del padre dispararía otra petición, y esto
// se convertiría en un bucle de red silencioso.
import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";

import { fetchAnalytics } from "@/app/lib/analitica/client";
import { isRetryable, type AnalyticsFailure } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";

export type QueryState<TData> =
  /** No se pidió nada, y no porque falte: la vista ya sabe que no hay que pedirlo. */
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly failure: AnalyticsFailure; readonly retry?: () => void }
  | { readonly status: "loaded"; readonly data: TData };

export type AnalyticsQuery<TData> = {
  readonly path: string;
  readonly range: DateRange;
  readonly schema: ZodType<TData>;
  readonly query?: Readonly<Record<string, string>>;
  /** false cuando pedirlo no tendría sentido (variable fuera de su cobertura). */
  readonly enabled?: boolean;
};

export function useAnalyticsQuery<TData>({
  path,
  range,
  schema,
  query,
  enabled = true,
}: AnalyticsQuery<TData>): QueryState<TData> {
  // El primer estado ya es el definitivo: sin esto, el render del servidor y el
  // primer pintado del navegador anunciarían un vacío que ni siquiera se pidió.
  const [state, setState] = useState<QueryState<TData>>(() =>
    enabled ? { status: "loading" } : { status: "idle" },
  );
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  const { from, toExclusive, granularity } = range;
  const search = new URLSearchParams(query ?? {}).toString();

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });

    void fetchAnalytics({
      path,
      range: { from, toExclusive, granularity },
      query: Object.fromEntries(new URLSearchParams(search)),
      schema,
      signal: controller.signal,
    }).then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { status: "loaded", data: result.data }
          : {
              status: "failed",
              failure: result.failure,
              ...(isRetryable(result.failure) ? { retry } : {}),
            },
      );
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, path, from, toExclusive, granularity, search, schema, retry, attempt]);

  return state;
}
