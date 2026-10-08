"use client";
// Una lectura de la vista Alertas: carga, error con reintento y RECARGA SIN
// PARPADEO. Lo último es lo que la separa de las lecturas de Calidad: después
// de aprobar una alerta, la lista y la ficha se vuelven a pedir, y pasar por
// «Cargando…» haría saltar la pantalla justo donde la persona acaba de pulsar.
//
// - Cambia `key` (otro filtro, otra alerta): estado de carga.
// - Cambia `generation` (alguien avisó que hubo cambios): se pide de nuevo
//   dejando a la vista lo que había hasta que llega lo nuevo.
import { useCallback, useEffect, useRef, useState } from "react";

import { errorChart, loadingChart, readyChart, type ChartState } from "@/app/components/charts";
import { isRetryable, type AnalyticsFailure, type AnalyticsResult } from "@/app/lib/analitica/errors";
import { describeFailure } from "@/app/components/analitica/alertas/labels";

/** El último fallo tal como llegó y cuándo, para el detalle técnico de la
 *  pantalla de error («GET /alertas → 500», «último intento hace 8 s»). */
export type ResourceFailure = { readonly failure: AnalyticsFailure; readonly at: Date };

export type ReloadableResource<TData> = {
  readonly state: ChartState<TData>;
  /** Vuelve a pedir sin pasar por el estado de carga. */
  readonly reload: () => void;
  /** Solo mientras `state` es un error; nulo en cualquier otro estado. */
  readonly lastFailure: ResourceFailure | null;
};

export function useReloadableResource<TData>(
  /** Identidad de la lectura; `null` = no hay nada que pedir. */
  key: string | null,
  load: () => Promise<AnalyticsResult<TData>>,
  toState: (data: TData) => ChartState<TData> = readyChart,
): ReloadableResource<TData> {
  const [state, setState] = useState<ChartState<TData>>(loadingChart);
  const [lastFailure, setLastFailure] = useState<ResourceFailure | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((previous) => previous + 1), []);
  // En refs porque quien llama los crea en cada render: como dependencias del
  // efecto, pedirían en bucle. La identidad de la lectura la lleva `key`.
  const loadRef = useRef(load);
  const toStateRef = useRef(toState);
  const shownKey = useRef<string | null>(null);

  useEffect(() => {
    loadRef.current = load;
    toStateRef.current = toState;
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    if (shownKey.current !== key) {
      shownKey.current = key;
      setState(loadingChart());
    } else {
      // Un reintento tras un error SÍ pasa por la carga: si no, el botón
      // «Reintentar» no daría ninguna señal de haber hecho algo.
      setState((previous) => (previous.status === "error" ? loadingChart() : previous));
    }
    void loadRef.current().then((result) => {
      if (cancelled) return;
      setLastFailure(result.ok ? null : { failure: result.failure, at: new Date() });
      setState(
        result.ok
          ? toStateRef.current(result.data)
          : errorChart(describeFailure(result.failure), isRetryable(result.failure) ? reload : undefined),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key, generation, reload]);

  return { state, reload, lastFailure: state.status === "error" ? lastFailure : null };
}
