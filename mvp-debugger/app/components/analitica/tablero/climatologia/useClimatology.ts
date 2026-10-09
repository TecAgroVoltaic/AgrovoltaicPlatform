"use client";
// La climatología de un año entero: una sola consulta para los cuatro paneles.
import { useAnalyticsQuery, type QueryState } from "@/app/components/analitica/series/useAnalyticsQuery";
import { CLIMATOLOGY_PATH } from "@/app/components/analitica/tablero/climatologia/labels";
import { yearRange } from "@/app/components/analitica/tablero/climatologia/climatologyYear";
import {
  climatologyResponseSchema,
  type ClimatologyResponse,
} from "@/app/lib/analitica/contracts/climatologia";

const LOADING: QueryState<ClimatologyResponse> = { status: "loading" };
/** Solo para cumplir la firma: con `enabled: false` nunca viaja. */
const UNREQUESTED_YEAR = 0;

/** Con `year` null (todavía no se sabe cuál) no pide nada y queda cargando. */
export function useClimatology(year: number | null): QueryState<ClimatologyResponse> {
  const query = useAnalyticsQuery({
    path: CLIMATOLOGY_PATH,
    range: yearRange(year ?? UNREQUESTED_YEAR),
    schema: climatologyResponseSchema,
    enabled: year !== null,
  });
  return year === null ? LOADING : query;
}
