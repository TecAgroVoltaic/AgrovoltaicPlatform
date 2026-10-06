"use client";
// Pinta un `_grafico` del agente con la primitiva que le corresponde.
//
// Es la ÚNICA forma de dibujar un gráfico del agente: el widget de la consola usa
// `ChartSpecRenderer` y la tarjeta del Asistente usa sus dos piezas
// (`ChartSpecChart` e `InvalidChartSpec`). No transforma nada: valida el
// ChartSpec y le pasa `datos` tal cual a la primitiva. Si el spec no cumple el
// contrato, se dice por qué y no se dibuja nada: un gráfico a medias se lee como
// un dato real.
import { useMemo, type ReactNode } from "react";

import {
  BarsChart,
  BoxPlotChart,
  CalendarHeatmapChart,
  RidgelineChart,
  ScatterFitChart,
  TimeSeriesChart,
  emptyChart,
  readyChart,
  type ChartState,
} from "@/app/components/charts";
import styles from "@/app/components/asistente/cards.module.css";
import { parseChartSpec, type ChartSpec } from "@/app/lib/asistente/contracts/chartSpec";

export type ChartSpecRendererProps = {
  readonly spec: unknown;
  /** Lo que va debajo de un gráfico VÁLIDO (p. ej. «Descargar estos datos»).
   * Recibe el spec ya validado; con un spec inválido no se pinta. */
  readonly footer?: (spec: ChartSpec) => ReactNode;
};

export function ChartSpecRenderer({ spec, footer }: ChartSpecRendererProps) {
  const parsed = useMemo(() => parseChartSpec(spec), [spec]);
  if (!parsed.ok) return <InvalidChartSpec reason={parsed.reason} />;
  return (
    <div className={styles.chart}>
      <ChartSpecChart spec={parsed.spec} />
      {footer ? footer(parsed.spec) : null}
    </div>
  );
}

/** Vacío con motivo cuando la colección principal no trae nada: la primitiva
 * lo pintaría igual, pero así el motivo es «no hay filas» y no «todo nulo». */
function stateFor<TData>(data: TData, rows: number): ChartState<TData> {
  return rows > 0 ? readyChart(data) : emptyChart("NO_ROWS");
}

export type ChartSpecChartProps = {
  readonly spec: ChartSpec;
  /** Alto fijo del lienzo; sin él lo decide el ancho (ver `chartBox`). */
  readonly height?: number;
};

export function ChartSpecChart({ spec, height }: ChartSpecChartProps) {
  const frame = { title: spec.titulo, subtitle: spec.subtitulo ?? spec.unidad, height };
  switch (spec.tipo) {
    case "serie":
      return <TimeSeriesChart {...frame} state={stateFor(spec.datos, spec.datos.lines.length)} />;
    case "barras":
      return <BarsChart {...frame} state={stateFor(spec.datos, spec.datos.categories.length)} />;
    case "cajas":
      return <BoxPlotChart {...frame} state={stateFor(spec.datos, spec.datos.boxes.length)} />;
    case "carpeta":
      return <CalendarHeatmapChart {...frame} state={stateFor(spec.datos, spec.datos.cells.length)} />;
    case "dispersion":
      return <ScatterFitChart {...frame} state={stateFor(spec.datos, spec.datos.points.length)} />;
    case "crestas":
      return <RidgelineChart {...frame} state={stateFor(spec.datos, spec.datos.curves.length)} />;
  }
}

export function InvalidChartSpec({ reason }: { reason: string }) {
  return (
    <div className="gr gr-estado gr-error" role="alert">
      <p className="gr-estado-t">El gráfico del asistente no se puede dibujar</p>
      <p className="muted small">Sus datos no cumplen el formato esperado ({reason}).</p>
    </div>
  );
}
