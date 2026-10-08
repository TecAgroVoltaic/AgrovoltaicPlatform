import { TrazaLegible } from "@/app/components/TrazaLegible";
import type { Paso } from "./resultados";

const MS_POR_SEGUNDO = 1000;
const DECIMALES_SEGUNDOS = 1;
const DECIMALES_COSTO = 5;

/** El pie de la lectura: qué herramientas usó, cuánto tardó y costó, y la traza. */
export function PieLectura({ pasos, usage, ms, costo, verTraza, onVerTraza }: {
  pasos: Paso[]; usage: any; ms: number | null; costo: number | null;
  verTraza: boolean; onVerTraza: () => void;
}) {
  const herramientas = pasos.filter((p) => p.tipo === "tool").map((p) => p.nombre);
  const webs = pasos.filter((p) => p.tipo === "web").length;
  return (
    <>
      <div className="lectura-pie">
        <button className="btn-sm" onClick={onVerTraza}>
          {verTraza ? "▾ ocultar cómo lo obtuvo" : "▸ cómo lo obtuvo"}
        </button>
        <span className="muted small mono">
          {herramientas.length ? herramientas.join(", ") : "sin algoritmos"}
          {webs ? ` · ${webs} búsqueda${webs > 1 ? "s" : ""} web` : ""}
          {ms != null ? ` · ${(ms / MS_POR_SEGUNDO).toFixed(DECIMALES_SEGUNDOS)} s` : ""}
          {costo != null ? ` · $${costo.toFixed(DECIMALES_COSTO)}` : ""}
        </span>
      </div>
      {verTraza && <TrazaLegible pasos={pasos} usage={usage} ms={ms} costo={costo} />}
    </>
  );
}
