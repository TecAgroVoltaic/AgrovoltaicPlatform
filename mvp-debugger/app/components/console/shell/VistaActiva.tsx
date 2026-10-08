import { ArqView } from "@/app/components/console/arquitectura/ArqView";
import { CalidadView } from "@/app/components/console/CalidadView";
import { CostoView } from "@/app/components/console/CostoView";
import { DatosView } from "@/app/components/console/datos/DatosView";
import { PerfView } from "@/app/components/console/PerfView";
import { PredView } from "@/app/components/console/PredView";
import { ReconView } from "@/app/components/console/ReconView";
import { SaludView } from "@/app/components/console/SaludView";
import type { Traza } from "@/app/components/TraceViewer";
import type { View } from "./vistas";

/** El lienzo con la vista activa y el pie de la consola. */
export function VistaActiva({ view, agent, theme, sesion }: {
  view: View; agent: string; theme: string; sesion: { agent: string; traza: Traza }[];
}) {
  return (
    <main className="content">
      {view === "recon" && <ReconView />}
      {view === "pred" && <PredView theme={theme} />}
      {view === "arq" && <ArqView agent={agent} />}
      {view === "calidad" && <CalidadView />}
      {view === "datos" && <DatosView />}
      {view === "perf" && <PerfView theme={theme} />}
      {view === "costo" && <CostoView agent={agent} theme={theme} sesion={sesion} />}
      {view === "salud" && <SaludView />}
      <div className="foot">
        <span>AgroVoltaic · debugger de agentes</span>
        <span>datos: Supabase PV · San Carlos (10.33°N, 84.42°O) · UTC−6</span>
      </div>
    </main>
  );
}
