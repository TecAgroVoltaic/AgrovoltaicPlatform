"use client";
// Panorama del pronostico: series del store (irradiancia + humedad de suelo) con
// resumen, y deteccion de anomalias determinista. Cruza contra lo que responde
// el agente de pronostico.
import { useState } from "react";
import { jget, jpost, nfmt } from "@/app/lib/client";
import { Sparkline, type Punto } from "@/app/components/Sparkline";
import { Json } from "@/app/components/Json";

type Serie = { resumen: any; puntos: Punto[]; variable: string } | null;

export function PronosticoPanel() {
  const [irr, setIrr] = useState<Serie>(null);
  const [hum, setHum] = useState<Serie>(null);
  const [anom, setAnom] = useState<any>(null);
  const [variable, setVariable] = useState("irradiancia");
  const [ventana, setVentana] = useState(1440);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState("");

  async function cargarSeries() {
    setCargando(true);
    setMsg("");
    const [a, b] = await Promise.all([
      jget("/api/pronostico/serie?variable=irradiancia&bucket=D&ultimos_dias=60"),
      jget("/api/pronostico/serie?variable=humedad_suelo&bucket=D&ultimos_dias=60"),
    ]);
    if (a.ok) setIrr(a.data);
    else setMsg("irradiancia: " + JSON.stringify(a.data));
    if (b.ok) setHum(b.data);
    setCargando(false);
  }

  async function detectar() {
    setAnom(null);
    const r = await jpost("/api/pronostico/anomalias", { variable, ventana_min: ventana });
    if (r.ok) setAnom(r.data);
    else setMsg("anomalias: " + JSON.stringify(r.data));
  }

  return (
    <div>
      {msg && <div className="alert">{msg}</div>}
      <button className="btn" onClick={cargarSeries} disabled={cargando}>
        {cargando ? "Cargando…" : "Cargar series del store (últimos 60 días)"}
      </button>

      {[irr, hum].map(
        (s, i) =>
          s && (
            <div key={i} className="serie-card">
              <div className="kpi-title">{s.variable}</div>
              <div className="kpi-fields">
                <div className="kpi-row">
                  <span className="kpi-k">rango</span>
                  <span className="kpi-v small">
                    {s.resumen.desde?.slice(0, 10)} → {s.resumen.hasta?.slice(0, 10)}
                  </span>
                </div>
                <div className="kpi-row">
                  <span className="kpi-k">filas</span>
                  <span className="kpi-v">{nfmt(s.resumen.filas, 0)}</span>
                </div>
                <div className="kpi-row">
                  <span className="kpi-k">cadencia (s)</span>
                  <span className="kpi-v">{nfmt(s.resumen.cadencia_mediana_seg, 0)}</span>
                </div>
                <div className="kpi-row">
                  <span className="kpi-k">min / media / max</span>
                  <span className="kpi-v">
                    {nfmt(s.resumen.valor_min)} / {nfmt(s.resumen.valor_media)} /{" "}
                    {nfmt(s.resumen.valor_max)}
                  </span>
                </div>
              </div>
              <Sparkline puntos={s.puntos} label={`${s.variable} · media diaria`} />
            </div>
          ),
      )}

      <div className="anom-box">
        <h4>Detección de anomalías (determinista)</h4>
        <div className="runner-controls">
          <select value={variable} onChange={(e) => setVariable(e.target.value)} className="select">
            <option value="irradiancia">irradiancia</option>
            <option value="humedad_suelo">humedad_suelo</option>
          </select>
          <select
            value={ventana}
            onChange={(e) => setVentana(Number(e.target.value))}
            className="select"
          >
            <option value={1440}>24 h</option>
            <option value={10080}>7 días</option>
            <option value={43200}>30 días</option>
          </select>
          <button className="btn" onClick={detectar}>
            detectar
          </button>
        </div>
        {anom && <Json value={anom} />}
      </div>
    </div>
  );
}
