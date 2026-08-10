"use client";
// Reconciliación: la respuesta del agente (traza) muestra los números que salen de
// tools SQL = la verdad de la DB. Debajo, los datos crudos en vivo (buscables, con
// cargar más) para cruzar a mano. Todo real, vía /api/analizador/*.
import { useEffect, useState } from "react";
import { jget, type Resp } from "@/app/lib/client";
import { Ask } from "@/app/components/Ask";
import type { Traza } from "@/app/components/TraceViewer";

const EJEMPLOS = [
  "¿Cuál arreglo generó más energía en todo el histórico y cuál fue su Performance Ratio?",
  "¿Cuánta energía generó cada arreglo?",
  "¿Qué temperatura promedio tuvo cada arreglo?",
  "¿Qué datos hay disponibles y desde cuándo?",
];

const COLS: [string, string, number][] = [
  ["timestamp", "timestamp", -1],
  ["potencia_pv1_w", "P PV1 · W", 0],
  ["potencia_pv2_w", "P PV2 · W", 0],
  ["potencia_total_wac", "P AC · W", 0],
  ["temp_inclinado", "T incl · °C", 1],
  ["temp_vertical", "T vert · °C", 1],
];

const nf = (v: any, d: number) =>
  v == null ? "—" : d < 0 ? String(v).slice(0, 16).replace("T", " ")
    : Number(v).toLocaleString("es-CR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function ReconView({ onResult }: { onResult?: (t: Traza) => void }) {
  const [filas, setFilas] = useState<any[]>([]);
  const [cob, setCob] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [n, setN] = useState(14);

  useEffect(() => {
    jget("/api/analizador/datos/muestra?tabla=electrico_corregido&limit=400").then((r: Resp) => {
      if (r.ok) setFilas(r.data.filas || []);
    });
    jget("/api/analizador/datos/tablas").then((r: Resp) => {
      if (r.ok) setCob(r.data.relaciones || []);
    });
  }, []);

  const ql = q.trim().toLowerCase();
  const filt = ql ? filas.filter((f) => String(f.timestamp).toLowerCase().includes(ql)) : filas;
  const vis = filt.slice(0, n);
  const cards = [
    cToCard(cob, "electrico_crudo", "Cobertura eléctrica"),
    cToCard(cob, "radiacion_15s_cruda", "Cobertura radiación 15 s"),
    cToCard(cob, "performance", "Cobertura performance"),
  ];

  return (
    <section>
      <div className="phead">
        <h1>Reconciliación · modelo contra base de datos</h1>
        <p>Preguntá lo que quieras: cada número de la respuesta sale de una tool SQL sobre la base — mirá la traza para ver el cálculo exacto (no inventa).</p>
      </div>

      <Ask endpoint="/api/analizador/preguntar" ejemplos={EJEMPLOS} onResult={onResult} />

      <div className="card" style={{ marginTop: 22 }}>
        <div className="livehead">
          <div>
            <h3>Datos en vivo · <span className="mono" style={{ color: "var(--accent)" }}>eléctrico corregido</span></h3>
            <p className="hint" style={{ margin: "4px 0 0" }}>La fuente de verdad contra la que se contrasta. Buscá por fecha u hora, o traé más filas.</p>
          </div>
          <div className="livetools">
            <input className="input" type="search" placeholder="Buscar por fecha u hora…" value={q}
              onChange={(e) => { setQ(e.target.value); setN(14); }} aria-label="Buscar" />
            <span className="muted small mono">{Math.min(n, filt.length)} de {filt.length} filas</span>
          </div>
        </div>
        <div className="scroll">
          <table className="data">
            <thead><tr>{COLS.map(([, h], i) => <th key={i} className={i === 0 ? "lead" : ""}>{h}</th>)}</tr></thead>
            <tbody>
              {vis.length ? vis.map((f, i) => (
                <tr key={i}>{COLS.map(([k, , d], j) => <td key={j} className={j === 0 ? "lead" : ""}>{nf(f[k], d)}</td>)}</tr>
              )) : <tr><td className="lead muted" colSpan={6}>{filas.length ? `sin coincidencias para “${q}”` : "cargando…"}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="loadmore">
          <button className="btn ghost" disabled={filt.length <= n} onClick={() => setN(n + 14)}>Cargar más filas</button>
          <span className="muted small">{filt.length > n ? `quedan ${filt.length - n} más` : "todo mostrado"}</span>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        {cards.map((c, i) => (
          <div className="card" key={i}>
            <span className="lbl">{c.label}</span>
            <div className="metric" style={{ marginTop: 6 }}>
              <span className="v">{c.v}</span><span className="muted small">{c.d}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function cToCard(cob: any[], clave: string, label: string) {
  const c = cob.find((x) => x.clave === clave);
  return c
    ? { label, v: Number(c.filas).toLocaleString("es-CR"), d: `filas · ${String(c.desde).slice(0, 10)} → ${String(c.hasta).slice(0, 10)}` }
    : { label, v: "—", d: "cargando…" };
}
