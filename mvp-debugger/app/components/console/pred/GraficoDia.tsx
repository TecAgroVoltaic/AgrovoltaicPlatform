import { useMemo } from "react";

import { Estado } from "@/app/components/console/Estado";
import { lineChart, palette } from "@/app/lib/charts";
import { ETIQUETA_ZONA } from "@/app/lib/tiempo";
import { fmt } from "./catalogo";

const ALTO_DEL_GRAFICO = 300;

/** El día elegido: lo medido contra el techo de cielo despejado, con el momento marcado. */
export function GraficoDia({ dia, errDia, momentos, momento, fecha, theme, unidad, dec, onReintentar }: {
  dia: any; errDia: string | null; momentos: string[]; momento: string; fecha: string;
  theme: string; unidad: string; dec: number; onReintentar: () => void;
}) {
  const idx = momentos.indexOf(momento);
  const hayTecho = !!dia?.puntos?.[0] && dia.puntos[0].cs != null;

  const chart = useMemo(() => {
    if (!dia?.puntos?.length) return "";
    void theme;                                      // recomputar al cambiar tema
    const P = palette();
    const pts = dia.puntos as any[];
    // El gráfico muestra el TERRENO: lo que midió el sensor y el máximo físico
    // posible. Sin el techo no se puede leer nada: un medido de 33 W/m² no dice
    // si el día estuvo tapado o si simplemente era temprano.
    // El gráfico SIEMPRE va entero, en los dos modos. Cortarlo con la medición oculta
    // fue un intento de "que no se vea la respuesta" que no protege nada: la
    // garantía de que el agente no la ve es que el servicio no le publica la
    // herramienta que la revela, y eso pasa del lado del servidor. Mutilar el
    // gráfico solo le saca a quien presenta la forma de leer el día.
    const series: any[] = [
      { points: pts.map((p) => p.real), color: P.real, area: true, width: 2.4, name: "Medido" },
    ];
    if (pts[0].cs != null) {
      series.push({ points: pts.map((p) => p.cs), color: P.ceil, width: 1.4,
                    name: "Techo (cielo despejado)" });
    }
    return lineChart(series, {
      x: momentos, height: ALTO_DEL_GRAFICO, unit: unidad,
      yfmt: (v) => fmt(v, 0), tipfmt: (v) => fmt(v, dec),
      marca: idx >= 0 ? { i: idx, label: momento } : null,
    });
  }, [dia, momentos, idx, momento, theme, unidad, dec]);

  return (
  <div className="card">
    {(!chart || errDia) && (
      <Estado cargando={!dia && !errDia} error={errDia} vacio={!!dia && !chart}
              que="ese día" pista="La serie tiene huecos: probá otra fecha."
              onReintentar={onReintentar} />
    )}
    {chart && !errDia && (
      <>
        <figure dangerouslySetInnerHTML={{ __html: chart }} />
        <div className="legend">
          <span><span className="sw" style={{ background: "var(--real)" }} />Medido</span>
          {hayTecho && (
            <span title="Máximo físico posible con el sol en esa posición y el cielo sin nubes. La razón medido/techo es el índice de claridad kt*.">
              <span className="sw" style={{ background: "var(--ceil)" }} />Techo (cielo despejado)
            </span>
          )}
          <span className="muted">{fecha} · {ETIQUETA_ZONA}</span>
        </div>
        {hayTecho && (
          <p className="note">
            <b>Techo</b>: la luz que habría con el cielo despejado (modelo Ineichen, puramente
            astronómico). La distancia entre las dos curvas son las nubes.{" "}
            <a href="/docs#metodo">Ver el método completo ↗</a>
          </p>
        )}
      </>
    )}
  </div>
  );
}
