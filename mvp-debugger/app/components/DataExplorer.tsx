"use client";
// Explorador de datos del analizador: cobertura de todas las relaciones + ver
// filas crudas + serie temporal graficada. Es "la data en vivo" contra la que se
// cruza lo que respondió el agente.
import { useEffect, useState } from "react";
import { jget, nfmt } from "@/app/lib/client";
import { Sparkline, type Punto } from "@/app/components/Sparkline";

type Rel = {
  clave: string;
  relacion: string;
  columna_tiempo: string | null;
  filas: number;
  desde: string | null;
  hasta: string | null;
};

export function DataExplorer() {
  const [rels, setRels] = useState<Rel[]>([]);
  const [sel, setSel] = useState<string>("");
  const [cols, setCols] = useState<{ nombre: string; tipo: string }[]>([]);
  const [muestra, setMuestra] = useState<{ columnas: string[]; filas: any[] } | null>(null);
  const [serieCol, setSerieCol] = useState<string>("");
  const [bucket, setBucket] = useState<string>("month");
  const [agg, setAgg] = useState<string>("avg");
  const [puntos, setPuntos] = useState<Punto[] | null>(null);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    jget<{ relaciones: Rel[] }>("/api/analizador/datos/tablas").then((r) => {
      if (r.ok) setRels(r.data.relaciones);
      else setMsg(JSON.stringify(r.data));
    });
  }, []);

  async function elegir(clave: string) {
    setSel(clave);
    setMuestra(null);
    setPuntos(null);
    setSerieCol("");
    const [m, c] = await Promise.all([
      jget(`/api/analizador/datos/muestra?tabla=${clave}&limit=15`),
      jget(`/api/analizador/datos/columnas?tabla=${clave}`),
    ]);
    if (m.ok) setMuestra(m.data);
    if (c.ok) {
      setCols(c.data.columnas);
      const num = c.data.columnas.find((x: any) =>
        /double|numeric|real|integer|boolean/.test(x.tipo),
      );
      setSerieCol(num?.nombre || "");
    }
  }

  async function graficar() {
    if (!sel || !serieCol) return;
    setPuntos(null);
    const r = await jget(
      `/api/analizador/datos/serie?tabla=${sel}&columna=${serieCol}&bucket=${bucket}&agg=${agg}`,
    );
    if (r.ok) setPuntos(r.data.puntos.map((p: any) => ({ t: p.t, v: p.v })));
    else setMsg(JSON.stringify(r.data));
  }

  return (
    <div>
      {msg && <div className="alert">{msg}</div>}
      <table className="tbl">
        <thead>
          <tr>
            <th>relación</th>
            <th>filas</th>
            <th>desde</th>
            <th>hasta</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rels.map((r) => (
            <tr key={r.clave} className={sel === r.clave ? "sel" : ""}>
              <td>
                <b>{r.clave}</b>
                <div className="muted small">{r.relacion}</div>
              </td>
              <td>{nfmt(r.filas, 0)}</td>
              <td className="small">{r.desde?.slice(0, 16) ?? "—"}</td>
              <td className="small">{r.hasta?.slice(0, 16) ?? "—"}</td>
              <td>
                <button className="btn-sm" onClick={() => elegir(r.clave)}>
                  explorar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel && (
        <div className="explorer-detail">
          <h4>
            {sel} <span className="muted">· serie</span>
          </h4>
          <div className="runner-controls">
            <select value={serieCol} onChange={(e) => setSerieCol(e.target.value)} className="select">
              {cols
                .filter((c) => /double|numeric|real|integer|boolean/.test(c.tipo))
                .map((c) => (
                  <option key={c.nombre} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
            </select>
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="select">
              {["hour", "day", "week", "month"].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select value={agg} onChange={(e) => setAgg(e.target.value)} className="select">
              {["avg", "sum", "min", "max", "count"].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button className="btn" onClick={graficar} disabled={!serieCol}>
              graficar
            </button>
          </div>
          {puntos && <Sparkline puntos={puntos} label={`${agg}(${serieCol}) por ${bucket}`} />}

          {muestra && (
            <>
              <h4>últimas filas</h4>
              <div className="tbl-scroll">
                <table className="tbl mono small">
                  <thead>
                    <tr>
                      {muestra.columnas.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {muestra.filas.map((f, i) => (
                      <tr key={i}>
                        {muestra.columnas.map((c) => (
                          <td key={c}>{fmtCell(f[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function fmtCell(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("es-CR", { maximumFractionDigits: 3 });
  const s = String(v);
  return s.length > 24 ? s.slice(0, 24) + "…" : s;
}
