import { nfmt } from "@/app/lib/client";
import { IconoAlerta, IconoCheck } from "@/app/components/Iconos";
import { fecha } from "./formato";
import type { Panel } from "./tipos";

/** El diagnóstico, antes que cualquier tabla: por qué los números no avanzan. */
export function Diagnostico({ panel, corrioSinTraer }: { panel: Panel; corrioSinTraer: boolean }) {
  const { fuente, ingesta } = panel;
  const cong = ingesta.congelamiento;
  return (
    <div className={"card sal-diag" + (cong?.congelada ? " sal-diag-alerta" : "")}>
      <div className="sal-diag-ic">
        {cong?.congelada ? <IconoAlerta size={18} /> : <IconoCheck size={18} />}
      </div>
      <div>
        <h3>
          {cong?.congelada
            ? `No entran datos nuevos desde hace ${nfmt(cong.dias, 1)} días`
            : "La ingesta está al día"}
        </h3>
        {cong?.congelada && (
          <p className="hint">
            El último dato es del <b>{fecha(cong.desde)}</b>. Después de ese instante
            no entró nada, ni de irradiancia ni de humedad de suelo.
            {fuente?.es_snapshot && (
              <> Y no puede entrar: la fuente es <b>{fuente.etiqueta.toLowerCase()}</b>,
                 o sea una foto fija. {corrioSinTraer
                   ? "El ETL corrió hace un rato y terminó bien, pero leyó 0 filas: no porque esté roto, sino porque no hay filas nuevas que leer."
                   : ""}</>
            )}
          </p>
        )}
        {ingesta.etl_fallando && (
          <p className="hint" style={{ color: "var(--crit)" }}>
            Además el ETL <b>está fallando ahora</b>: su último error es posterior a
            su última corrida completa. Mirá el detalle abajo.
          </p>
        )}
        {ingesta.error && (
          <p className="hint" style={{ color: "var(--warn)" }}>
            No se pudo medir la ingesta: {ingesta.error}. El resto del panel es lo
            último que sí se pudo leer.
          </p>
        )}
      </div>
    </div>
  );
}
