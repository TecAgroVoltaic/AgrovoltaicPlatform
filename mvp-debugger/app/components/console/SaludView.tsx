"use client";
// Panel de salud operativa: frescura de la ingesta, errores recientes y gasto.
// Responsabilidad unica: MOSTRAR lo que devuelve /salud/panel; no calcula estado
// ni decide umbrales (eso vive en el agente).
import { useEffect, useState } from "react";
import { jget, nfmt } from "@/app/lib/client";

const RUTA = "/api/pronostico/salud/panel";
const REFRESCO_MS = 30000;
const HORAS_POR_DIA = 24;

type Variable = {
  ultimo_dato: string | null;
  edad_horas: number | null;
  filas: number;
  estado: "ok" | "stale" | "sin_datos";
};
type Panel = {
  estado: string;
  ingesta: { umbral_stale_horas: number; variables: Record<string, Variable>;
             ultima_corrida_etl?: { ts: string | null; edad_horas: number | null } };
  errores_recientes: { ts: string; componente: string; evento: string; error: string | null }[];
  presupuesto: { gastado_hoy_usd: number; tope_usd: number; agotado: boolean; medido: boolean };
  ultima_prediccion: { creado_en: string; variable: string; valor_esperado: number | null;
                       unidad: string | null } | null;
};
// El upstream puede responder un error en vez del panel: el tipo lo contempla
// para no castear a ciegas en la rama de fallo.
type Respuesta = Partial<Panel> & { detail?: string; error?: string };

const TEXTO_ESTADO: Record<string, string> = {
  ok: "Al día", stale: "Datos viejos", sin_datos: "Sin datos",
};

function edad(horas: number | null): string {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < HORAS_POR_DIA) return `${nfmt(horas, 1)} h`;
  return `${nfmt(horas / HORAS_POR_DIA, 1)} días`;
}

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });
}

export function SaludView() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const r = await jget<Respuesta>(RUTA);
      if (!vivo) return;
      setCargando(false);
      if (!r.ok) {
        setError(r.data?.detail || r.data?.error || `error ${r.status}`);
        return;
      }
      setError(null);
      setPanel(r.data as Panel);
    }
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  if (cargando) return <div className="card"><p className="muted">Consultando estado…</p></div>;

  if (error) {
    return (
      <div className="card">
        <h3>Salud del sistema</h3>
        <p className="hint">No se pudo consultar el estado: {String(error)}</p>
        <p className="small muted">
          Suele significar que el sidecar de pronóstico está caído o que no alcanza
          la base. Revisá <span className="mono">docker ps</span> en la EC2.
        </p>
      </div>
    );
  }
  if (!panel) return null;

  const p = panel.presupuesto;
  const pct = p.tope_usd > 0 ? Math.min(100, (p.gastado_hoy_usd / p.tope_usd) * 100) : 0;

  return (
    <>
      <div className="card">
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
            {Object.entries(panel.ingesta.variables).map(([nombre, v]) => (
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
          Se considera viejo a partir de {panel.ingesta.umbral_stale_horas} h ·
          última corrida del ETL: {edad(panel.ingesta.ultima_corrida_etl?.edad_horas ?? null)} atrás
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Gasto del día</h3>
        <p className="hint">
          {p.medido
            ? <>US${nfmt(p.gastado_hoy_usd, 4)} de US${nfmt(p.tope_usd, 2)}
               {p.agotado && <strong> · tope alcanzado, las consultas al modelo están cortadas</strong>}</>
            : <>No se pudo medir el gasto (la base no respondió); el tope no se está aplicando.</>}
        </p>
        {p.medido && p.tope_usd > 0 && (
          <div className="barra"><div className="barra-fill" style={{ width: `${pct}%` }} /></div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Errores recientes</h3>
        {panel.errores_recientes.length === 0 ? (
          <p className="hint">Sin errores registrados. </p>
        ) : (
          <div className="tbl-scroll">
          <table className="tbl">
            <thead><tr><th>Cuándo</th><th>Componente</th><th>Evento</th><th>Detalle</th></tr></thead>
            <tbody>
              {panel.errores_recientes.map((e, i) => (
                <tr key={i}>
                  <td className="mono small">{fecha(e.ts)}</td>
                  <td className="mono">{e.componente}</td>
                  <td className="mono">{e.evento}</td>
                  <td className="small muted">{(e.error || "").slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
