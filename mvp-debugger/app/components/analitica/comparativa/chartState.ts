// De un resultado de la capa de datos a uno de los cuatro estados de un gráfico.
//
// El orden de las preguntas ES la regla, y por eso vive en un solo sitio:
//   1. ¿Ya volvió la consulta? Si no, CARGA.
//   2. ¿Falló? ERROR, con reintento solo si el fallo puede pasar solo.
//   3. ¿La respuesta trae algo que dibujar? Si no, VACÍO con el motivo que
//      redactó el backend. Recién entonces, DATO.
//
// El motivo del vacío nunca se inventa acá: un rango sin datos vuelve con 200 y
// `pr: null` más un `motivo`, y ese texto es el que tiene que llegar a pantalla.
import {
  errorChart,
  loadingChart,
  readyChart,
  type ChartEmptyReason,
  type ChartEmptyReasonCode,
  type ChartState,
} from "@/app/components/charts";
import { isRetryable, type AnalyticsResult } from "@/app/lib/analitica/errors";

export type ChartStateOptions<TResponse, TData> = {
  readonly onRetry: () => void;
  /** Da forma a la respuesta. No calcula: mapea a lo que el gráfico dibuja. */
  readonly adapt: (response: TResponse) => TData;
  /** Por qué la respuesta llegó bien pero sin nada que pintar. */
  readonly emptiness?: (response: TResponse) => ChartEmptyReason | null;
};

export function chartStateFrom<TResponse, TData>(
  result: AnalyticsResult<TResponse> | null,
  { onRetry, adapt, emptiness }: ChartStateOptions<TResponse, TData>,
): ChartState<TData> {
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

/** Un motivo de vacío armado a partir del payload. */
export function emptyBecause(
  code: ChartEmptyReasonCode,
  message: string,
  hint?: string,
): ChartEmptyReason {
  return { code, message, ...(hint ? { hint } : {}) };
}
