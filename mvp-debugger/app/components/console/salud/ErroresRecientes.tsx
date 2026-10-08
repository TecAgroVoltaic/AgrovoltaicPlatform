import { fecha, MAX_DETALLE } from "./formato";
import type { Panel } from "./tipos";

/** Los errores recientes del agente, con su componente y evento. */
export function ErroresRecientes({ errores }: { errores: Panel["errores_recientes"] }) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Errores recientes</h3>
      {errores.length === 0 ? (
        <p className="hint">Sin errores registrados.</p>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead><tr><th>Cuándo</th><th>Componente</th><th>Evento</th><th>Detalle</th></tr></thead>
            <tbody>
              {errores.map((e, i) => (
                <tr key={i}>
                  <td className="mono small">{fecha(e.ts)}</td>
                  <td className="mono">{e.componente}</td>
                  <td className="mono">{e.evento}</td>
                  <td className="small muted">{(e.error || "").slice(0, MAX_DETALLE)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
