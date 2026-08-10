"use client";
// Panorama de KPIs del analizador: llama cada tool con {} (todo el historico) y
// muestra sus campos. Es la vista "estado actual" para cruzar contra las
// respuestas del agente. Generico: no asume las claves de cada tool.
import { useState } from "react";
import { jpost, nfmt } from "@/app/lib/client";
import { Json } from "@/app/components/Json";

const TOOLS = [
  "energia_por_arreglo",
  "performance_ratio",
  "irradiancia_resumen",
  "temperatura_por_arreglo",
  "cobertura_datos",
];

type Resultado = { nombre: string; ok: boolean; data: any };

export function Kpis() {
  const [res, setRes] = useState<Resultado[] | null>(null);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    const salidas = await Promise.all(
      TOOLS.map(async (nombre) => {
        const r = await jpost(`/api/analizador/tool/${nombre}`, {});
        return { nombre, ok: r.ok, data: r.data } as Resultado;
      }),
    );
    setRes(salidas);
    setCargando(false);
  }

  return (
    <div>
      <button className="btn" onClick={cargar} disabled={cargando}>
        {cargando ? "Cargando KPIs…" : res ? "Recargar KPIs" : "Cargar KPIs (todo el histórico)"}
      </button>
      {res && (
        <div className="kpi-grid">
          {res.map((r) => (
            <div key={r.nombre} className="kpi-card">
              <div className="kpi-title">{r.nombre}</div>
              {!r.ok ? (
                <div className="alert">{JSON.stringify(r.data)}</div>
              ) : (
                <>
                  <div className="kpi-fields">
                    {Object.entries(r.data)
                      .filter(([k]) => !["nota", "periodo"].includes(k))
                      .map(([k, v]) => (
                        <div key={k} className="kpi-row">
                          <span className="kpi-k">{k}</span>
                          <span className="kpi-v">
                            {typeof v === "number" ? nfmt(v, 3) : String(v)}
                          </span>
                        </div>
                      ))}
                  </div>
                  {r.data?.nota && <div className="kpi-nota">ℹ {r.data.nota}</div>}
                  <Json value={r.data} collapsed />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
