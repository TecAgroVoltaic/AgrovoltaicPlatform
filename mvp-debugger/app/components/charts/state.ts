// Los cuatro estados de un gráfico, como un tipo y no como tres banderas.
//
// EL VACÍO ES UN CASO DE PRIMERA CLASE, no un borde: hay cuatro meses con la
// potencia AC en NULL al 100 % y 329 días de calendario sin ninguna fila. Por
// eso `empty` EXIGE un motivo: un gráfico que se queda en blanco sin decir por
// qué se lee como una falla de la aplicación, y uno que dibuja una línea en cero
// donde no hubo medición miente.
//
// Con `status: "ready"` los datos existen; con cualquier otro, el campo `data`
// ni siquiera está. No hay forma de pintar un gráfico sin datos por descuido.
export type ChartEmptyReasonCode =
  /** El backend no devolvió ninguna fila para el rango. */
  | "NO_ROWS"
  /** Hay filas, pero todas las lecturas de la variable son nulas. */
  | "ALL_NULL"
  /** El rango cae fuera de la cobertura de la base. */
  | "OUT_OF_COVERAGE"
  /** La variable no tiene fuente hoy (RH, viento, precipitación...). */
  | "NO_SOURCE"
  /** Las pruebas de calidad descartaron todo lo que había. */
  | "FILTERED_OUT";

export type ChartEmptyReason = {
  readonly code: ChartEmptyReasonCode;
  /** Qué se le dice a la persona. Si el backend manda `motivo`, va acá tal cual. */
  readonly message: string;
  /** Segunda línea opcional: qué puede hacer al respecto. */
  readonly hint?: string;
};

export const EMPTY_REASON_MESSAGE: Readonly<Record<ChartEmptyReasonCode, string>> = {
  NO_ROWS: "No hay ninguna medición en el rango seleccionado.",
  ALL_NULL: "Hay filas en el rango, pero todas las lecturas de esta variable son nulas.",
  OUT_OF_COVERAGE: "El rango seleccionado está fuera de la cobertura de la base.",
  NO_SOURCE: "Esta variable todavía no tiene ninguna fuente de datos ingestada.",
  FILTERED_OUT: "Las pruebas de calidad descartaron todas las lecturas del rango.",
};

export type ChartState<TData> =
  | { readonly status: "loading" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly onRetry?: () => void;
    }
  | { readonly status: "empty"; readonly reason: ChartEmptyReason }
  | { readonly status: "ready"; readonly data: TData };

export function loadingChart<TData>(): ChartState<TData> {
  return { status: "loading" };
}

export function errorChart<TData>(message: string, onRetry?: () => void): ChartState<TData> {
  return onRetry ? { status: "error", message, onRetry } : { status: "error", message };
}

export function emptyChart<TData>(
  code: ChartEmptyReasonCode,
  overrides: Partial<Omit<ChartEmptyReason, "code">> = {},
): ChartState<TData> {
  return {
    status: "empty",
    reason: {
      code,
      message: overrides.message ?? EMPTY_REASON_MESSAGE[code],
      ...(overrides.hint ? { hint: overrides.hint } : {}),
    },
  };
}

export function readyChart<TData>(data: TData): ChartState<TData> {
  return { status: "ready", data };
}

/**
 * Última red antes de dibujar: si los datos llegaron pero no hay ni un punto
 * pintable, el estado pasa a vacío CON motivo en vez de producir un lienzo con
 * ejes y nada dentro.
 */
export function guardEmptiness<TData>(
  state: ChartState<TData>,
  hasPlottableData: (data: TData) => boolean,
  code: ChartEmptyReasonCode = "ALL_NULL",
): ChartState<TData> {
  if (state.status !== "ready" || hasPlottableData(state.data)) return state;
  return emptyChart(code);
}
