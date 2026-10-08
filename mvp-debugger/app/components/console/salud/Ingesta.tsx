import { nfmt } from "@/app/lib/client";
import { edad, fecha, TEXTO_ESTADO } from "./formato";
import type { Panel } from "./tipos";

/** Estado de cada variable ingerida: el «ahora» del pronóstico sale de acá. */
export function Ingesta({ ingesta }: { ingesta: Panel["ingesta"] }) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Ingesta de datos</h3>
      <p className="hint">
        El pronóstico usa como “ahora” el último dato ingerido, no el reloj. Si esto
        está viejo, todo lo que se muestre abajo también lo está.
      </p>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr><th>Variable</th><th>Estado</th><th>Último dato</th><th>Antigüedad</th><th>Filas</th></tr>
          </thead>
          <tbody>
            {Object.entries(ingesta.variables || {}).map(([nombre, v]) => (
              <tr key={nombre}>
                <td className="mono">{nombre}</td>
                <td><span className={`pill pill-${v.estado}`}>{TEXTO_ESTADO[v.estado] || v.estado}</span></td>
                <td className="mono small">{fecha(v.ultimo_dato)}</td>
                <td className="mono">{edad(v.edad_horas)}</td>
                <td className="mono">{nfmt(v.filas, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Se considera viejo a partir de {ingesta.umbral_stale_horas} h.
      </p>
    </div>
  );
}
