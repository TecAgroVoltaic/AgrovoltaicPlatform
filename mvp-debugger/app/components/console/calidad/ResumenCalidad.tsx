import { nfmt } from "@/app/lib/client";
import { pct } from "./textos";
import type { Resumen } from "./tipos";

/** La tarjeta de cabecera: cobertura y cielo en cuatro cifras. */
export function ResumenCalidad({ resumen }: { resumen: Resumen }) {
  const { cobertura, cielo } = resumen;
  return (
    <div className="card">
      <h3>Calidad del histórico</h3>
      <p className="hint">
        Lo que encontró el Agente Histórico barriendo día por día. La detección es
        determinista y corre por lotes; esta vista solo muestra el resultado.
      </p>
      <div className="kpi-grid">
        <div className="kpi">
          <span className="lbl">cobertura</span>
          <div className="k">{cobertura.dias_con_datos}
            <small>de {cobertura.dias_calendario} días</small></div>
          <div className="d">
            {pct(cobertura.dias_con_datos, cobertura.dias_calendario)} del calendario
          </div>
        </div>
        <div className="kpi">
          <span className="lbl">cielo despejado</span>
          <div className="k">{nfmt(cielo.kt_medio, 2)}<small>kt medio</small></div>
          <div className="d">sobre {cielo.dias} días caracterizados</div>
        </div>
        <div className="kpi">
          <span className="lbl">techo aprovechado</span>
          <div className="k">{nfmt(cielo.pct_del_techo, 0)}<small>%</small></div>
          <div className="d">de la irradiancia que habría con cielo despejado</div>
        </div>
        <div className="kpi">
          <span className="lbl">tipos de día</span>
          <div className="k">{cielo.despejados}·{cielo.parciales}·{cielo.cubiertos}·{cielo.variables}</div>
          <div className="d">despejados · parciales · cubiertos · variables</div>
        </div>
      </div>
    </div>
  );
}
