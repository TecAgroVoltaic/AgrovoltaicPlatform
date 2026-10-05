// Lo que recibe cualquier figura de la vista: su resultado, por qué podría estar
// fuera de cobertura, y cómo se reintenta. Nada más.
//
// La figura NO conoce el hook ni el rango: recibe el resultado ya resuelto. Así
// se prueba con un objeto literal, sin red y sin router.
import type { AnalyticsResult } from "@/app/lib/analitica/errors";

export type FigureProps<TResponse> = {
  /** `null` mientras la consulta está en vuelo. */
  readonly result: AnalyticsResult<TResponse> | null;
  /** Motivo legible de que el rango no toque la ventana de la variable. */
  readonly outOfCoverage: string | null;
  readonly onRetry: () => void;
};

/** Las figuras que siguen a la variable en foco necesitan además su nombre. */
export type FocusedFigureProps<TResponse> = FigureProps<TResponse> & {
  readonly focusLabel: string;
};
