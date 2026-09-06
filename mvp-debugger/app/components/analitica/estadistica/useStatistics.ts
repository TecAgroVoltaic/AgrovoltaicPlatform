"use client";
// Las cinco consultas de la vista Estadística, en UNA sola espera.
//
// Son cinco endpoints distintos y cada uno tarda entre uno y dos segundos: en
// cascada la pantalla tardaría ocho, y en paralelo tarda lo que el más lento.
//
// `fetchAnalytics` devuelve un resultado y NUNCA lanza, así que el `Promise.all`
// no se puede romper por una consulta caída: los otros cuatro gráficos se pintan
// igual y el que falló muestra su error. Esa garantía es del cliente, no de acá,
// y por eso este archivo no tiene un solo try/catch.
import { useCallback, useEffect, useState } from "react";

import { fetchAnalytics } from "@/app/lib/analitica/client";
import {
  correlationResponseSchema,
  distributionResponseSchema,
  folderResponseSchema,
  irradiationResponseSchema,
  ridgesResponseSchema,
  type CorrelationResponse,
  type DistributionResponse,
  type FolderResponse,
  type IrradiationResponse,
  type RidgesResponse,
} from "@/app/lib/analitica/contracts/estadistica";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import { INCIDENT_IRRADIANCE } from "@/app/components/analitica/estadistica/focusVariables";
import { RIDGE_GROUP_KEYS, RIDGE_THRESHOLD } from "@/app/components/analitica/estadistica/ridgeGroups";

/** `null` en cualquier campo significa "todavía en vuelo". */
export type StatisticsData = {
  readonly distribution: AnalyticsResult<DistributionResponse> | null;
  readonly irradiation: AnalyticsResult<IrradiationResponse> | null;
  readonly ridges: AnalyticsResult<RidgesResponse> | null;
  readonly correlation: AnalyticsResult<CorrelationResponse> | null;
  readonly folder: AnalyticsResult<FolderResponse> | null;
  /** Vuelve a pedir las cinco. Es el reintento que ofrece cada gráfico. */
  readonly reload: () => void;
};

const IN_FLIGHT = {
  distribution: null,
  irradiation: null,
  ridges: null,
  correlation: null,
  folder: null,
} as const;

type Loaded = Omit<StatisticsData, "reload">;

export type StatisticsQuery = {
  readonly range: DateRange;
  /** Clave de catálogo de la variable en foco, no la variable entera: es lo
   *  único que viaja en la query, y depender de menos es depender mejor. */
  readonly focusKey: string;
  readonly correlationTargetKey: string;
};

export function useStatistics({
  range,
  focusKey,
  correlationTargetKey,
}: StatisticsQuery): StatisticsData {
  const [loaded, setLoaded] = useState<Loaded>(IN_FLIGHT);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);
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
      fetchAnalytics({
        path: "analitica/distribucion",
        range: activeRange,
        query: { variable: focusKey },
        schema: distributionResponseSchema,
        signal,
      }),
      fetchAnalytics({
        path: "analitica/irradiacion",
        range: activeRange,
        query: { variable: INCIDENT_IRRADIANCE.key },
        schema: irradiationResponseSchema,
        signal,
      }),
      fetchAnalytics({
        path: "analitica/crestas",
        range: activeRange,
        query: { grupos: RIDGE_GROUP_KEYS.join(","), umbral: String(RIDGE_THRESHOLD) },
        schema: ridgesResponseSchema,
        signal,
      }),
      fetchAnalytics({
        path: "analitica/correlacion",
        range: activeRange,
        query: { x: INCIDENT_IRRADIANCE.key, y: correlationTargetKey },
        schema: correlationResponseSchema,
        signal,
      }),
      fetchAnalytics({
        path: "analitica/carpeta",
        range: activeRange,
        query: { variable: focusKey },
        schema: folderResponseSchema,
        signal,
      }),
    ]).then(([distribution, irradiation, ridges, correlation, folder]) => {
      // Con la consulta abortada los cinco resultados son fallos de red que ya no
      // le importan a nadie: pintarlos sobrescribiría la respuesta buena.
      if (signal.aborted) return;
      setLoaded({ distribution, irradiation, ridges, correlation, folder });
    });

    return () => controller.abort();
  }, [from, toExclusive, granularity, focusKey, correlationTargetKey, attempt]);

  return { ...loaded, reload };
}
