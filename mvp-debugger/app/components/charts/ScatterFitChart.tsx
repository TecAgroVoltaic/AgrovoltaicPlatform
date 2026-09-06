"use client";
// Nube de puntos con recta de ajuste (Fig. 8). El pie publica la ecuación y el
// R² por defecto: una recta sin su R² promete un acuerdo que nadie midió.
import { ChartFrame, type ChartProps } from "@/app/components/charts/ChartFrame";
import { guardEmptiness } from "@/app/components/charts/state";
import {
  buildScatterFitOption,
  describeFit,
  hasPlottableScatter,
  type ScatterFitData,
} from "@/app/components/charts/options/scatterFit";

export type ScatterFitChartProps = ChartProps<ScatterFitData>;

const NO_FIT_TEXT = "Sin recta: no hubo puntos suficientes para ajustarla.";

export function ScatterFitChart(props: ScatterFitChartProps) {
  return (
    <ChartFrame
      {...props}
      caption={props.caption ?? defaultCaption}
      state={guardEmptiness(props.state, hasPlottableScatter, "NO_ROWS")}
      buildOption={buildScatterFitOption}
    />
  );
}

function defaultCaption(data: ScatterFitData) {
  return data.fit ? describeFit(data.fit, data.xUnit, data.yUnit) : NO_FIT_TEXT;
}
