import type { SeriesColorToken } from "@/app/components/charts/theme";

export type DensityCurve = {
  readonly id: string;
  readonly label: string;
  /** Soporte de la densidad, en las unidades de la variable. */
  readonly x: readonly number[];
  /** Densidad normalizada a [0, 1] por el backend, punto a punto con `x`. */
  readonly density: readonly number[];
  /** Probabilidad de cola, si el backend la calculó (0 a 1). */
  readonly tailProbability?: number | null;
  readonly color?: SeriesColorToken;
};

export type RidgelineData = {
  readonly curves: readonly DensityCurve[];
  readonly unit: string;
  /** Umbral marcado con una línea vertical (el "85 °C", por ejemplo). */
  readonly threshold?: { readonly value: number; readonly label: string } | null;
};
