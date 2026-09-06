"use client";
// Barras por categoría: irradiación mensual, energía por arreglo (Fig. 6).
import { ChartFrame, type ChartProps } from "@/app/components/charts/ChartFrame";
import { guardEmptiness } from "@/app/components/charts/state";
import {
  buildBarsOption,
  hasPlottableBars,
  type BarsData,
} from "@/app/components/charts/options/bars";

export type BarsChartProps = ChartProps<BarsData>;

export function BarsChart(props: BarsChartProps) {
  return (
    <ChartFrame
      {...props}
      state={guardEmptiness(props.state, hasPlottableBars)}
      buildOption={buildBarsOption}
    />
  );
}
