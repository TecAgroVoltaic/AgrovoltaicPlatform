import { nfmt } from "@/app/lib/client";
import { Dato } from "./Dato";
import { edad, fecha, MAX_DETALLE } from "./formato";
import type { Panel } from "./tipos";

/** La última corrida del ETL: si terminó bien y si trajo datos, que no es lo mismo. */
export function CorridaEtl({ ingesta, corrioSinTraer }: {
  ingesta: Panel["ingesta"]; corrioSinTraer: boolean;
}) {
  const corrida = ingesta.ultima_corrida_etl;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Última corrida del ETL</h3>
      <p className="hint">
        Que termine bien y que traiga datos son dos cosas distintas. Acá se ven las dos.
      </p>
      {!corrida?.ts ? <p className="small muted">Todavía no hay corridas registradas.</p> : (
        <>
          <div className="sal-rejilla">
            <Dato k="cuándo" v={`${fecha(corrida.ts)} (${edad(corrida.edad_horas)} atrás)`} />
            <Dato
              k="resultado"
              v={corrida.ok === false
                ? <span style={{ color: "var(--crit)" }}>falló</span>
                : <span style={{ color: "var(--good)" }}>terminó bien</span>}
              mono={false}
            />
            <Dato k="filas leídas" v={nfmt(corrida.filas_leidas ?? 0, 0)} />
            <Dato
              k="filas insertadas"
              v={<span style={{ color: corrioSinTraer ? "var(--warn)" : undefined }}>
                   {nfmt(corrida.filas_insertadas ?? 0, 0)}
                 </span>}
            />
            {corrida.duracion_seg != null && (
              <Dato k="duración" v={`${nfmt(corrida.duracion_seg, 1)} s`} />
            )}
          </div>
          {corrida.por_variable && (
            <div className="tbl-scroll" style={{ marginTop: 10 }}>
              <table className="tbl">
                <thead><tr><th>Variable</th><th>Leídas</th><th>Insertadas</th><th>Error</th></tr></thead>
                <tbody>
                  {Object.entries(corrida.por_variable).map(([v, d]) => (
                    <tr key={v}>
                      <td className="mono">{v}</td>
                      <td className="mono">{nfmt(d.leidas, 0)}</td>
                      <td className="mono">{nfmt(d.insertadas, 0)}</td>
                      <td className="small muted">{d.error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {ingesta.ultimo_error_etl && (
        <p className="note">
          <b>Último error del ETL</b> ({edad(ingesta.ultimo_error_etl.edad_horas)} atrás,{" "}
          <span className="mono">{ingesta.ultimo_error_etl.evento}</span>):{" "}
          {(ingesta.ultimo_error_etl.error || "").slice(0, MAX_DETALLE)}
        </p>
      )}
    </div>
  );
}
