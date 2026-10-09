"use client";
// La climatología del rango de la URL: una sola consulta para los cuatro paneles.
import { useAnalyticsQuery, type QueryState } from "@/app/components/analitica/series/useAnalyticsQuery";
import { CLIMATOLOGY_PATH } from "@/app/components/analitica/tablero/climatologia/labels";
import {
  climatologyResponseSchema,
  type ClimatologyResponse,
} from "@/app/lib/analitica/contracts/climatologia";
import type { DateRange } from "@/app/lib/analitica/dateRange";

export function useClimatology(range: DateRange): QueryState<ClimatologyResponse> {
  return useAnalyticsQuery({ path: CLIMATOLOGY_PATH, range, schema: climatologyResponseSchema });
}
