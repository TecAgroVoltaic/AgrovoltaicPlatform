// Formato viejo de `graficar` ({tipo:"linea", x, series}). Se mantiene solo
// hasta que el backend con ChartSpec (version 1) esté desplegado; todo lo demás
// lo pinta `ChartSpecRenderer`, que es la única forma de dibujar un gráfico del
// agente.
import { lineChart, palette } from "@/app/lib/charts";

export const serieColor = (P: any, i: number) => [P.accent, P.real, P.pred, P.ceil][i % 4];

export const esGraficoViejo = (g: any) => g?.tipo === "linea" && Array.isArray(g?.series);

export function graficoHTML(g: any): string {
  const P = palette();
  const series = g.series.map((s: any, i: number) => ({
    points: s.valores, color: serieColor(P, i), name: s.nombre, area: g.series.length === 1,
  }));
  return lineChart(series, { x: g.x, w: 500, height: 300, unit: g.unidad, yfmt: (v) => v.toLocaleString("es-CR", { maximumFractionDigits: 1 }) });
}
