import { nfmt } from "@/app/lib/client";
import { CLASE_CIELO, QUE_ES } from "./textos";
import type { Dia, Hallazgo } from "./tipos";

/** El día elegido en el mapa: sus lecturas, su cielo y sus hallazgos. */
export function DetalleDia({ diaSel, detalle }: { diaSel: Dia; detalle: Hallazgo[] | null }) {
  return (
    <div className="card">
      <h3>{diaSel.fecha}</h3>
      <p className="hint">
        {nfmt(diaSel.filas_radiacion, 0)} lecturas de radiación ·{" "}
        {nfmt(diaSel.filas_electrico, 0)} del inversor
        {diaSel.clase ? ` · cielo ${CLASE_CIELO[diaSel.clase] ?? diaSel.clase}` : ""}
        {diaSel.kt_medio != null ? ` · kt ${nfmt(diaSel.kt_medio, 2)}` : ""}
        {diaSel.indice_variabilidad != null
          ? ` · variabilidad ${nfmt(diaSel.indice_variabilidad, 1)}` : ""}
      </p>
      {detalle === null ? <p className="hint">Cargando…</p>
        : detalle.length === 0 ? <p className="hint">Sin hallazgos ese día.</p> : (
        <table className="tbl">
          <thead>
            <tr><th>fuente</th><th>variable</th><th>hallazgo</th>
                <th style={{ textAlign: "right" }}>lecturas</th></tr>
          </thead>
          <tbody>
            {detalle.map((h, i) => (
              <tr key={i}>
                <td className="mono">{h.fuente}</td>
                <td className="mono">{h.variable}</td>
                <td>
                  <span className={`sev sev-${h.severidad}`}>{h.tipo}</span>
                  <span className="hint" style={{ margin: 0, display: "block" }}>
                    {QUE_ES[h.tipo] ?? ""}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {h.n_afectadas == null ? "—" : nfmt(h.n_afectadas, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
