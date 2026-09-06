// De un resultado de la capa de datos a uno de los cuatro estados de un gráfico.
//
// El orden de las preguntas ES la regla, y por eso vive en un solo sitio:
//
//   1. ¿La variable existía en este rango? Si no, VACÍO con motivo, sin mirar la
//      respuesta. Una nube de cero puntos se lee como "no hay relación", y no es
//      lo mismo que "estas dos variables nunca coexistieron".
//   2. ¿Ya volvió? Si no, CARGA.
//   3. ¿Falló? ERROR, con reintento solo si el fallo puede pasar solo.
//   4. ¿La respuesta trae algo pintable? Si no, VACÍO con el motivo que mande el
//      backend. Recién entonces, DATO.
import {
  emptyChart,
  errorChart,
  loadingChart,
  readyChart,
  type ChartEmptyReason,
  type ChartState,
} from "@/app/components/charts";
import { isRetryable, type AnalyticsResult } from "@/app/lib/analitica/errors";

const OUT_OF_COVERAGE_HINT = "Elegí un rango que toque esa ventana para ver el gráfico.";

export type ChartStateOptions<TResponse, TData> = {
  /** Por qué el rango no toca la ventana de la variable. `null` = sí la toca. */
  readonly outOfCoverage: string | null;
  readonly onRetry: () => void;
  /** Da forma a la respuesta. No calcula: mapea a lo que el gráfico dibuja. */
  readonly adapt: (response: TResponse) => TData;
  /** Por qué la respuesta llegó bien pero sin nada que pintar. */
  readonly emptiness?: (response: TResponse) => ChartEmptyReason | null;
};

export function chartStateFrom<TResponse, TData>(
  result: AnalyticsResult<TResponse> | null,
  { outOfCoverage, onRetry, adapt, emptiness }: ChartStateOptions<TResponse, TData>,
): ChartState<TData> {
  if (outOfCoverage) {
    return emptyChart("OUT_OF_COVERAGE", {
      message: outOfCoverage,
      hint: OUT_OF_COVERAGE_HINT,
    });
  }
  if (result === null) return loadingChart();
  if (!result.ok) {
    return isRetryable(result.failure)
      ? errorChart(result.failure.message, onRetry)
      : errorChart(result.failure.message);
  }
  const reason = emptiness?.(result.data) ?? null;
  if (reason) return { status: "empty", reason };
  return readyChart(adapt(result.data));
}

/** Atajo para los motivos que arma cada figura a partir de su payload. */
export function emptyBecause(
  code: ChartEmptyReason["code"],
  message: string,
  hint?: string,
): ChartEmptyReason {
  return { code, message, ...(hint ? { hint } : {}) };
}
