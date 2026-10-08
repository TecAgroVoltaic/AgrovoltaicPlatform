"use client";
// Explorador de datos del analizador: cobertura de todas las relaciones + ver
// filas crudas + serie temporal graficada. Es "la data en vivo" contra la que se
// cruza lo que respondió el agente.
import { Sparkline } from "@/app/components/Sparkline";
import { RelationsTable } from "@/app/components/dataExplorer/RelationsTable";
import { SampleTable } from "@/app/components/dataExplorer/SampleTable";
import { SeriesControls } from "@/app/components/dataExplorer/SeriesControls";
import { useDataExplorer } from "@/app/components/dataExplorer/useDataExplorer";

export function DataExplorer() {
  const e = useDataExplorer();
  return (
    <div>
      {e.msg && <div className="alert">{e.msg}</div>}
      <RelationsTable rels={e.rels} sel={e.sel} onElegir={e.elegir} />

      {e.sel && (
        <div className="explorer-detail">
          <h4>
            {e.sel} <span className="muted">· serie</span>
          </h4>
          <SeriesControls
            cols={e.cols} serieCol={e.serieCol} bucket={e.bucket} agg={e.agg}
            onSerieCol={e.setSerieCol} onBucket={e.setBucket} onAgg={e.setAgg}
            onGraficar={e.graficar}
          />
          {e.puntos && <Sparkline puntos={e.puntos} label={`${e.agg}(${e.serieCol}) por ${e.bucket}`} />}
          {e.muestra && <SampleTable muestra={e.muestra} />}
        </div>
      )}
    </div>
  );
}
