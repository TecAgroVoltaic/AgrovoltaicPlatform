"use client";
// Lo que acompaña a una respuesta del agente: sus gráficos, las herramientas y
// búsquedas que usó, el costo y la traza plegable.
import { ChartSpecRenderer } from "@/app/components/asistente/ChartSpecRenderer";
import type { Traza } from "@/app/components/TraceViewer";
import { TrazaLegible } from "@/app/components/TrazaLegible";
import { palette } from "@/app/lib/charts";

import { esGraficoViejo, graficoHTML, serieColor } from "./legacyChart";

export function MsgExtras({ traza, abierto, onToggle }: { traza: Traza; abierto: boolean; onToggle: () => void }) {
  const pasos = (traza.pasos || []) as any[];
  const graficos = pasos.filter((p) => p.tipo === "tool" && p.salida && typeof p.salida === "object" && p.salida._grafico).map((p) => p.salida._grafico);
  const herramientas = pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre);
  const webs = pasos.filter((p) => p.tipo === "web").map((p) => p.query);
  const u: any = traza.usage || {};
  return (
    <>
      {graficos.map((g, i) => {
        if (!esGraficoViejo(g)) return <div key={i} className="chat-graf"><ChartSpecRenderer spec={g} /></div>;
        const P = palette();
        return (
          <div key={i} className="chat-graf">
            <div className="chat-graf-t mono">{g.titulo}{g.unidad ? ` · ${g.unidad}` : ""}</div>
            <figure dangerouslySetInnerHTML={{ __html: graficoHTML(g) }} />
            {g.series.length > 1 && (
              <div className="legend">
                {g.series.map((s: any, j: number) => (
                  <span key={j}><span className="sw" style={{ background: serieColor(P, j) }} />{s.nombre}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="chat-meta">
        <button className="chat-trazabtn" onClick={onToggle}>{abierto ? "▾" : "▸"} traza</button>
        {herramientas.map((t, i) => <span key={i} className="chat-chip">{t}</span>)}
        {webs.length > 0 && <span className="chat-chip web">web ×{webs.length}</span>}
        {(traza as any).costo && <span className="chat-chip cost">${((traza as any).costo.usd_total || 0).toFixed(5)}</span>}
      </div>
      {abierto && (
        <div className="chat-traza">
          <TrazaLegible pasos={pasos} usage={u} ms={traza.ms_total}
                        costo={(traza as any).costo?.usd_total ?? null} />
        </div>
      )}
    </>
  );
}
