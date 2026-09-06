"use client";
// El ÚNICO punto donde se toca la instancia de ECharts: init, setOption, resize
// y dispose. Escrito a mano en vez de sumar `echarts-for-react` porque son
// cuarenta líneas, evita una dependencia más y deja el control del render de
// servidor, del redimensionado y del ciclo de vida donde se puede leer.
//
// El render de servidor no se rompe: en el servidor esto es un <div> vacío con
// su alto reservado, y el gráfico aparece cuando el efecto corre en el
// navegador. Reservar el alto evita que la página salte al montar.
//
// Recibe un CONSTRUCTOR de la opción y no una opción ya hecha. Es la pieza que
// sabe cuánto mide el lienzo de verdad, y hay decisiones de la opción que no se
// pueden tomar sin ese número: cuánto puede medir un ítem de leyenda antes de
// recortarse, cuánto el nombre de una fila antes de partirse. Construir fuera y
// pasar el resultado obligaría a adivinar el ancho desde donde no se ve.
import { useCallback, useEffect, useRef, type CSSProperties } from "react";

import { CANVAS_CONTAINER_STYLE } from "@/app/components/charts/chartBox";
import { echarts, type ChartOption } from "@/app/components/charts/echarts";
import type { ChartCanvas } from "@/app/components/charts/options/canvas";

export type EChartProps = {
  readonly buildOption: (canvas: ChartCanvas) => ChartOption;
  /** Cómo se reserva el espacio del lienzo. Lo arma `canvasStyle` (chartBox). */
  readonly boxStyle: CSSProperties;
  /** Descripción del gráfico para lectores de pantalla: un lienzo no se lee. */
  readonly ariaLabel: string;
};

export function EChart({ buildOption, boxStyle, ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const builderRef = useRef(buildOption);

  const redraw = useCallback(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
    // Primero la opción y DESPUÉS el redimensionado, nunca al revés: `resize`
    // rehace el reparto del lienzo con la opción que haya, y con el orden
    // invertido ese reparto se calculaba sobre la opción vieja. Se veía: en el
    // gráfico de crestas el eje se quedaba con el reparto de antes y las líneas
    // base terminaban cruzando por encima de los nombres de los sensores.
    //
    // `notMerge`: la opción que sale del constructor es completa. Sin esto,
    // quitar una serie (o cambiar de tema) dejaría restos de la anterior.
    chart.setOption(builderRef.current({ width: container.clientWidth }), { notMerge: true });
    chart.resize();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = echarts.init(container, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    redraw();

    // ResizeObserver y no el evento `resize` de la ventana: el gráfico también
    // cambia de ancho al plegar la barra lateral o al abrir el chat, y esos no
    // disparan `resize`. Acá además no solo redimensiona: RECONSTRUYE la
    // opción, porque los presupuestos de texto dependen del ancho nuevo.
    const observer = new ResizeObserver(redraw);
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [redraw]);

  useEffect(() => {
    builderRef.current = buildOption;
    redraw();
  }, [buildOption, redraw]);

  // El envoltorio no es decorativo: le da al lienzo el contenedor contra el que
  // se mide su alto. Ver `chartBox`, que explica por qué no alcanza con poner
  // una razón de aspecto en el lienzo mismo.
  return (
    <div style={CANVAS_CONTAINER_STYLE}>
      <div
        ref={containerRef}
        className="gr-lienzo"
        style={boxStyle}
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}
