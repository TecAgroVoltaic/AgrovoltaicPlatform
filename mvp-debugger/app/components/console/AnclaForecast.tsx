"use client";
// Pronóstico anclado en un INSTANTE DE REFERENCIA.
//
// Por qué existe: la ingesta del sitio está congelada y el último dato cae de
// madrugada, así que un pronóstico "desde el último dato" da irradiancia 0 y no
// se puede ver el modelo trabajando. Anclando en un instante con sol, el agente
// pronostica de verdad — y como ese momento ya pasó, se puede poner al lado lo
// que el sensor midió en realidad.
//
// Honestidad: NO es una predicción en vivo, es un hindcast. El forecaster solo
// ve datos anteriores al ancla (barrera `< ahora` de get_recent_data), igual que
// el backtest. La vista lo dice explícitamente y el backend lo audita aparte.
import { useEffect, useState } from "react";
import { jget, jpost, mensajeError, type Resp } from "@/app/lib/client";

const HORIZONTES: [number, string][] = [
  [1800, "30 min"], [3600, "1 hora"], [7200, "2 horas"], [10800, "3 horas"],
];
const HORA_DEMO = 10;          // media mañana: sol alto y kt* con muestras.
const MS_POR_DIA = 86400000;

const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR",
    { minimumFractionDigits: d, maximumFractionDigits: d });

/** ISO local (sin zona) que espera <input type="datetime-local">. */
function paraInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function horaLegible(iso: string | null | undefined): string {
  if (!iso) return "—";
  // El backend responde hora LOCAL del sitio con offset (−06:00): se recorta en
  // vez de pasarlo por Date, que lo reinterpretaría en la zona del navegador.
  return iso.slice(0, 16).replace("T", " ");
}

export function AnclaForecast({ variable }: { variable: string }) {
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [ancla, setAncla] = useState("");
  const [horizonte, setHorizonte] = useState(3600);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Rango disponible -> ancla por defecto. Se lee de /serie (determinista, no
  // audita) en vez de hardcodear una fecha: cuando la ingesta vuelva, el default
  // se corre solo.
  useEffect(() => {
    setRes(null); setError(null);
    jget(`/api/pronostico/serie?variable=${variable}&bucket=D&ultimos_dias=9999`)
      .then((r: Resp) => {
        const resumen = r.ok ? (r.data as any)?.resumen : null;
        if (!resumen?.hasta) { setRango(null); return; }
        setRango({ desde: resumen.desde, hasta: resumen.hasta });
        // Último día COMPLETO a media mañana: el día del último dato puede estar
        // cortado (hoy termina a las 02:31), así que se retrocede uno.
        const ultimo = new Date(resumen.hasta.slice(0, 19));
        const dia = new Date(ultimo.getTime() - MS_POR_DIA);
        dia.setHours(HORA_DEMO, 0, 0, 0);
        setAncla(paraInput(dia));
      });
  }, [variable]);

  async function pronosticar() {
    if (!ancla) return;
    setCargando(true); setError(null); setRes(null);
    const r = await jpost("/api/pronostico/forecast", {
      variable, horizon_seconds: horizonte, ahora: ancla, origen: "consola",
    });
    setCargando(false);
    if (!r.ok) { setError(mensajeError(r)); return; }
    setRes(r.data);
  }

  const unidad = variable === "irradiancia" ? "W/m²" : "crudo";
  const dec = variable === "irradiancia" ? 1 : 0;
  const medido = res?.medido;
  const valor = res?.valor_esperado;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Pronóstico desde un instante de referencia</h3>
      <p className="hint">
        Elegí un momento del histórico y el agente pronostica <b>desde ahí</b>, viendo
        solo datos anteriores a ese instante. Como el momento ya pasó, abajo se muestra
        lo que el sensor midió en realidad.
      </p>

      <div className="controls">
        <div className="ctl">
          <span className="lbl">Instante de referencia</span>
          <input
            className="input" type="datetime-local" value={ancla}
            min={rango?.desde?.slice(0, 16)} max={rango?.hasta?.slice(0, 16)}
            onChange={(e) => setAncla(e.target.value)}
          />
        </div>
        <div className="ctl">
          <span className="lbl">Horizonte</span>
          <div className="chips">
            {HORIZONTES.map(([s, l]) => (
              <button key={s} className={"chip" + (horizonte === s ? " on" : "")}
                      onClick={() => setHorizonte(s)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="ctl">
          <span className="lbl">&nbsp;</span>
          <button className="btn" onClick={pronosticar} disabled={cargando || !ancla}>
            {cargando ? "Pronosticando…" : "Pronosticar"}
          </button>
        </div>
      </div>

      {rango && (
        <p className="note">
          Datos disponibles de <span className="mono">{horaLegible(rango.desde)}</span> a{" "}
          <span className="mono">{horaLegible(rango.hasta)}</span> (hora local, UTC−6).
        </p>
      )}

      {error && <p className="hint" style={{ color: "var(--crit)" }}>No se pudo pronosticar: {error}</p>}

      {res && (
        <>
          <div className="grid g4" style={{ marginTop: 16 }}>
            <div className="kpi">
              <span className="lbl">Pronosticado</span>
              <div className="k">{fmt(valor, dec)}<small>{unidad}</small></div>
              <div className="d">para las {horaLegible(res.momento_pronosticado)}</div>
            </div>
            <div className="kpi">
              <span className="lbl">Banda (±1σ)</span>
              <div className="k">{fmt(res.banda?.bajo, dec)}–{fmt(res.banda?.alto, dec)}</div>
              <div className="d">rango de incertidumbre</div>
            </div>
            <div className="kpi">
              <span className="lbl">Midió el sensor</span>
              <div className="k">{medido ? fmt(medido.valor, dec) : "—"}<small>{medido ? unidad : ""}</small></div>
              <div className="d">{medido ? `lectura real de las ${horaLegible(medido.ts)}` : "sin lectura en ese instante"}</div>
            </div>
            <div className="kpi">
              <span className="lbl">Error</span>
              <div className="k" style={{ color: medido?.error == null ? undefined : (medido.error >= 0 ? "var(--pred)" : "var(--crit)") }}>
                {medido?.error == null ? "—" : (medido.error >= 0 ? "+" : "") + fmt(medido.error, dec)}
              </div>
              <div className="d">pronosticado − medido</div>
            </div>
          </div>

          <p className="note">
            <b>Es un hindcast, no una predicción en vivo.</b> El agente se ancló en{" "}
            <span className="mono">{horaLegible(res.ancla?.instante)}</span> y solo vio lecturas
            anteriores a ese instante ({res.contexto?.muestras_recientes ?? 0} en la última hora
            {res.contexto?.kt_estrella_reciente != null &&
              <> · kt* {fmt(res.contexto.kt_estrella_reciente, 2)}</>}). El valor medido se
            consulta después y nunca entra al cálculo. Queda auditado como{" "}
            <span className="mono">instante-referencia</span>, aparte de las predicciones en vivo.
          </p>
          <p className="note">
            <b>Un instante no evalúa el método.</b> El sitio es muy nuboso y un punto suelto
            puede errar feo (o acertar de casualidad). La evaluación seria es el backtest de
            abajo, que promedia cientos de instantes y lo compara contra el modelo ingenuo.
          </p>

          {res.contexto?.advertencia && (
            <p className="hint">Advertencia del modelo: {res.contexto.advertencia}</p>
          )}
        </>
      )}
    </div>
  );
}
