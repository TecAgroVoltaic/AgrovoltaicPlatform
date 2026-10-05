"use client";
// Box plots por categoría: la distribución mensual de una variable (Fig. 6).
import { ChartFrame, type ChartProps } from "@/app/components/charts/ChartFrame";
import { guardEmptiness } from "@/app/components/charts/state";
import {
  buildBoxPlotOption,
  hasPlottableBoxes,
  type BoxPlotData,
} from "@/app/components/charts/options/boxPlot";

export type BoxPlotChartProps = ChartProps<BoxPlotData>;

export function BoxPlotChart(props: BoxPlotChartProps) {
  return (
    <ChartFrame
      {...props}
      state={guardEmptiness(props.state, hasPlottableBoxes, "NO_ROWS")}
      buildOption={buildBoxPlotOption}
    />
  );
}
