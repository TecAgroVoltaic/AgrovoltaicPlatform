"use client";
// Consumo ACUMULADO del agente (GET /api/<servicio>/uso): nº de consultas, tokens
// in/out y costo USD total + desglose por modelo. Es la vista "a nivel general"
// que complementa el costo por-consulta del visor de traza. Se actualiza tras cada
// pregunta con el botón (el acumulado vive en el servicio Python).
import { useEffect, useState } from "react";
import { jget, nfmt } from "@/app/lib/client";
import { usd } from "@/app/components/TraceViewer";

type PorModelo = {
  n_consultas: number;
  input_tokens: number;
  output_tokens: number;
  usd_total: number;
};

type Resumen = {
  desde: string | null;
  n_consultas: number;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_usd: number;
  por_modelo: Record<string, PorModelo>;
};

export function Uso({ servicio }: { servicio: string }) {
  const [r, setR] = useState<Resumen | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function cargar() {
    const res = await jget<Resumen>(`/api/${servicio}/uso`);
    if (res.ok) {
      setR(res.data);
      setErr(null);
    } else {
      setErr(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <button className="btn" onClick={cargar}>
        Actualizar consumo
      </button>
      {err && <div className="alert">{err}</div>}
      {r && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-title">acumulado (todas las consultas)</div>
            <div className="kpi-fields">
              <div className="kpi-row">
                <span className="kpi-k">consultas</span>
                <span className="kpi-v">{nfmt(r.n_consultas, 0)}</span>
              </div>
              <div className="kpi-row">
                <span className="kpi-k">requests al LLM</span>
                <span className="kpi-v">{nfmt(r.total_requests, 0)}</span>
              </div>
              <div className="kpi-row">
                <span className="kpi-k">tokens in</span>
                <span className="kpi-v">{nfmt(r.total_input_tokens, 0)}</span>
              </div>
              <div className="kpi-row">
                <span className="kpi-k">tokens out</span>
                <span className="kpi-v">{nfmt(r.total_output_tokens, 0)}</span>
              </div>
              <div className="kpi-row">
                <span className="kpi-k">costo total</span>
                <span className="kpi-v">{usd(r.total_usd)}</span>
              </div>
              <div className="kpi-row">
                <span className="kpi-k">desde</span>
                <span className="kpi-v small">{r.desde?.slice(0, 19).replace("T", " ") ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-title">por modelo</div>
            {Object.keys(r.por_modelo).length === 0 ? (
              <div className="muted small">Sin consultas todavía.</div>
            ) : (
              Object.entries(r.por_modelo).map(([modelo, m]) => (
                <div key={modelo} className="kpi-fields" style={{ marginBottom: 8 }}>
                  <div className="kpi-row">
                    <span className="kpi-k mono">{modelo}</span>
                    <span className="kpi-v">{usd(m.usd_total)}</span>
                  </div>
                  <div className="kpi-row">
                    <span className="kpi-k small">consultas / in / out</span>
                    <span className="kpi-v small">
                      {nfmt(m.n_consultas, 0)} · {nfmt(m.input_tokens, 0)} · {nfmt(m.output_tokens, 0)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
