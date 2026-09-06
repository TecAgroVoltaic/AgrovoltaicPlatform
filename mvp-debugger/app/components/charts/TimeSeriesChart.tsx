"use client";
// Serie temporal por variable, con tendencia, media móvil y banda de desviación
// cuando el backend las manda (Fig. 5 del PDF).
import { ChartFrame, type ChartProps } from "@/app/components/charts/ChartFrame";
import { guardEmptiness } from "@/app/components/charts/state";
import {
  buildTimeSeriesOption,
  hasPlottableTimeSeries,
  type TimeSeriesData,
} from "@/app/components/charts/options/timeSeries";

export type TimeSeriesChartProps = ChartProps<TimeSeriesData>;

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  return (
    <ChartFrame
      {...props}
      state={guardEmptiness(props.state, hasPlottableTimeSeries)}
      buildOption={buildTimeSeriesOption}
    />
  );
}
