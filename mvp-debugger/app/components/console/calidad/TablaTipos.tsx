import { nfmt } from "@/app/lib/client";
import { QUE_ES } from "./textos";
import type { Tipo } from "./tipos";

/** Días, variables y lecturas afectadas por cada tipo de hallazgo en el período. */
export function TablaTipos({ tipos }: { tipos: Tipo[] }) {
  return (
    <div className="card">
      <h3>Hallazgos por tipo</h3>
      <p className="hint">
        Días y variables afectadas en todo el período. Los días no se suman entre
        variables: un mismo día puede tener el problema en varias columnas.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>fuente</th><th>hallazgo</th>
            <th style={{ textAlign: "right" }}>días</th>
            <th style={{ textAlign: "right" }}>vars</th>
            <th style={{ textAlign: "right" }}>lecturas</th>
            <th>período</th>
          </tr>
        </thead>
        <tbody>
          {tipos.map((t, i) => (
            <tr key={i}>
              <td className="mono">{t.fuente}</td>
              <td>
                <span className={`sev sev-${t.severidad}`}>{t.tipo}</span>
                <span className="hint" style={{ margin: 0, display: "block" }}>
                  {QUE_ES[t.tipo] ?? ""}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>{t.dias}</td>
              <td style={{ textAlign: "right" }}>{t.variables}</td>
              <td style={{ textAlign: "right" }}>
                {t.lecturas == null ? "—" : nfmt(t.lecturas, 0)}
              </td>
              <td className="mono hint" style={{ margin: 0 }}>
                {t.primer_dia} a {t.ultimo_dia}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
