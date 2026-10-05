// El puente entre el ciclo de vida de una consulta y los cuatro estados de un
// gráfico, en un solo sitio.
//
// Existe para que ninguna sección invente su propia traducción: si cada una
// decidiera por su cuenta cuándo se ofrece reintentar o qué se muestra mientras
// no hay nada pedido, dos gráficos de la misma pantalla se comportarían distinto
// ante el mismo fallo.
import { emptyChart, errorChart, loadingChart, type ChartState } from "@/app/components/charts";
import type { QueryState } from "@/app/components/analitica/series/useAnalyticsQuery";

/** Una consulta que todavía no trajo datos. El tipo excluye `loaded` a
 *  propósito: quien llame tiene que haberlo tratado antes, y así no queda una
 *  rama muerta que finja saber pintar un gráfico sin datos. */
export type PendingQuery = Exclude<QueryState<unknown>, { readonly status: "loaded" }>;

const IDLE_MESSAGE = "No se pidió esta serie porque no había nada que pedir.";
const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;

/** Un 4xx de estos endpoints es determinista y ya viene explicado ("569 días por
 *  hora pasan del techo de 1500 puntos"). Repetir la misma petición daría el
 *  mismo 4xx, así que ofrecer «Reintentar» sería invitar a perder el tiempo. */
function isWorthRetrying(status: number | undefined): boolean {
  return status === undefined || status < CLIENT_ERROR_FLOOR || status >= SERVER_ERROR_FLOOR;
}

export function pendingChartState<TData>(query: PendingQuery): ChartState<TData> {
  if (query.status === "loading") return loadingChart();
  if (query.status === "failed") {
    const retry = isWorthRetrying(query.failure.status) ? query.retry : undefined;
    return errorChart(query.failure.message, retry);
  }
  return emptyChart("NO_ROWS", { message: IDLE_MESSAGE });
}
