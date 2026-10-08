import type { SeriesColorToken } from "@/app/components/charts/theme";

export type TimeSeriesPoint = { readonly timestamp: string; readonly value: number | null };

export type TimeSeriesBandPoint = {
  readonly timestamp: string;
  readonly lower: number | null;
  readonly upper: number | null;
};

export type TimeSeriesLine = {
  readonly id: string;
  readonly label: string;
  readonly points: readonly TimeSeriesPoint[];
  readonly color?: SeriesColorToken;
  /** Recta de tendencia del período, ya ajustada por el backend. */
  readonly trend?: readonly TimeSeriesPoint[];
  readonly movingAverage?: readonly TimeSeriesPoint[];
  readonly deviationBand?: readonly TimeSeriesBandPoint[];
};

export type TimeSeriesData = {
  readonly lines: readonly TimeSeriesLine[];
  readonly unit: string;
};
