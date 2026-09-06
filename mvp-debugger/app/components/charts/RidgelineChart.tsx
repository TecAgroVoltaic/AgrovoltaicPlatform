"use client";
// Gráfico de crestas: densidades por sensor, apiladas (Fig. 7).
//
// El alto no sale del ancho como en los demás: con seis sensores dentro de la
// razón de aspecto las crestas se aplastan hasta no distinguirse, que es lo
// único que este gráfico tiene que dejar ver. Por eso pide alto FIJO, y solo
// cuando las filas piden más que el mínimo de todos.
import { ChartFrame, type ChartProps } from "@/app/components/charts/ChartFrame";
import { MIN_CHART_HEIGHT } from "@/app/components/charts/chartBox";
import { guardEmptiness } from "@/app/components/charts/state";
import {
  buildRidgelineOption,
  hasPlottableCurves,
  ridgelineHeight,
  type RidgelineData,
} from "@/app/components/charts/options/ridgeline";

export type RidgelineChartProps = ChartProps<RidgelineData>;

export function RidgelineChart(props: RidgelineChartProps) {
  const state = guardEmptiness(props.state, hasPlottableCurves, "NO_ROWS");
  const minimumHeight = props.height ?? MIN_CHART_HEIGHT;
  const rowsHeight =
    state.status === "ready" ? ridgelineHeight(state.data, minimumHeight) : minimumHeight;
  // Mientras las filas entren en el mínimo, se deja que el alto salga del ancho
  // como en el resto de la consola: `height` sin definir es esa regla.
  const height = rowsHeight > minimumHeight ? rowsHeight : props.height;

  return (
    <ChartFrame
      {...props}
      height={height}
      state={state}
      buildOption={buildRidgelineOption}
    />
  );
}
