"use client";
// Una lectura que NO sale con la carga de la vista, sino la primera vez que hay
// algo que mostrar con ella.
//
// La razón es medida: `calidad/dias` pesa 221 KB y `arquitectura` 32 KB, y las
// dos alimentan pestañas que quizá nadie abra. Pedirlas al entrar es gastar el
// 84 % de lo que baja la pantalla en lo que no se está mirando.
//
// `armed` se enciende y NO se vuelve a apagar: volver a la pestaña que ya se
// visitó tiene que ser instantáneo, y un efecto que dependiera de `enabled` a
// secas volvería a pedir lo mismo en cada ida y vuelta.
import { useCallback, useEffect, useState } from "react";
import type { ZodType } from "zod";

import { fetchAnalytics } from "@/app/lib/analitica/client";
import { errorChart, loadingChart, readyChart, type ChartState } from "@/app/components/charts";
import { isRetryable } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";

export type DeferredAnalyticsRequest<TData> = {
  /** Ruta bajo `/api/historico`, sin barra inicial. */
  readonly path: string;
  readonly range: DateRange;
  /** Contrato de la respuesta. Constante de módulo: entra en las dependencias
   * del efecto y una recreada en cada render pediría en bucle. */
  readonly schema: ZodType<TData>;
  /** Si ya hay algo en pantalla que necesita este dato. */
  readonly enabled: boolean;
};

export function useDeferredAnalytics<TData>({
  path,
  range,
  schema,
  enabled,
}: DeferredAnalyticsRequest<TData>): ChartState<TData> {
  const [state, setState] = useState<ChartState<TData>>(loadingChart);
  const [armed, setArmed] = useState(enabled);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    if (enabled) setArmed(true);
  }, [enabled]);

  useEffect(() => {
    if (!armed) return;
    let cancelled = false;
    setState(loadingChart());
    void fetchAnalytics({ path, range, schema }).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? readyChart(result.data)
          : errorChart(result.failure.message, isRetryable(result.failure) ? retry : undefined),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [armed, path, range, schema, attempt, retry]);

  return state;
}
