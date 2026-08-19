"use client";
// Predicción vs Real — una sola fecha manda sobre TODA la vista.
//
// Diseño: se elige día, momento y anticipación, y de ahí sale todo lo demás — la
// curva medido-vs-predicho, los tres números de ese momento y la lectura del
// agente. Antes había dos relojes independientes (una ventana de N días para el
// backtest y un instante suelto para el pronóstico anclado) que además hablaban
// en granularidades distintas: el gráfico en promedios horarios y los KPI en
// lecturas instantáneas. Los dos números eran ciertos y aun así se contradecían
// en pantalla, que es lo peor que puede pasar en una vista de validación.
//
// Ahora hay UNA sola fuente: el backtest del día a la resolución elegida. El
// gráfico, los KPI y el agente leen exactamente los mismos valores.
//
// Todo esto es RECONSTRUCCIÓN sobre datos ya medidos, no predicción en vivo. Se
// dice una vez, en una etiqueta, no en tres párrafos.
import { useEffect, useMemo, useState } from "react";
import { jget, mensajeError, type Resp } from "@/app/lib/client";
import { Estado } from "@/app/components/console/Estado";
import { PuntoEvaluado } from "@/app/components/console/PuntoEvaluado";
import { LecturaAgente } from "@/app/components/console/LecturaAgente";
import { lineChart, palette } from "@/app/lib/charts";

const VARIABLES: [string, string][] = [
  ["irradiancia", "Irradiancia"], ["humedad_suelo", "Humedad de suelo"],
];
// La anticipación ES la resolución del backtest: reconstruir un bucket = predecir
// ese bucket con el anterior. Que sean el mismo control evita el desfase entre
// "lo que veo" y "lo que se predijo".
const ANTICIPACIONES: [string, string][] = [
  ["15min", "15 min"], ["30min", "30 min"], ["h", "1 hora"],
];
const DIAS_REFERENCIA = 7;      // ventana del dato agregado de contexto
const MS_POR_DIA = 86400000;

const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR",
    { minimumFractionDigits: d, maximumFractionDigits: d });

const diaSiguiente = (f: string) =>
  new Date(new Date(`${f}T00:00:00`).getTime() + MS_POR_DIA).toISOString().slice(0, 10);

const etiqueta = (s: string) => ANTICIPACIONES.find(([b]) => b === s)?.[1] || s;

export function PredView({ theme }: { theme: string }) {
  const [vari, setVari] = useState("irradiancia");
  const [fecha, setFecha] = useState("");
  const [momento, setMomento] = useState("");        // "HH:MM"
  const [bucket, setBucket] = useState("h");

  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [dia, setDia] = useState<any>(null);
  const [errDia, setErrDia] = useState<string | null>(null);
  const [ref, setRef] = useState<any>(null);         // métricas de los últimos N días

  const unidad = vari === "irradiancia" ? "W/m²" : "crudo";
  const dec = vari === "irradiancia" ? 1 : 0;

  // 1. Rango disponible -> día por defecto: el último COMPLETO (el del último
  //    dato viene cortado a media madrugada y no se ve nada).
  useEffect(() => {
    setDia(null); setErrDia(null);
    jget(`/api/pronostico/serie?variable=${vari}&bucket=D&ultimos_dias=9999`).then((r: Resp) => {
      const resumen = r.ok ? (r.data as any)?.resumen : null;
      if (!resumen?.hasta) { setRango(null); return; }
      setRango({ desde: resumen.desde.slice(0, 10), hasta: resumen.hasta.slice(0, 10) });
      const ultimo = new Date(resumen.hasta.slice(0, 10) + "T00:00:00");
      setFecha(new Date(ultimo.getTime() - MS_POR_DIA).toISOString().slice(0, 10));
    });
    jget(`/api/pronostico/backtest?variable=${vari}&dias=${DIAS_REFERENCIA}&bucket=h`)
      .then((r: Resp) => setRef(r.ok ? (r.data as any)?.metricas : null));
  }, [vari]);

  // 2. El día elegido a la resolución elegida: única fuente de la vista.
  useEffect(() => {
    if (!fecha) return;
    setDia(null); setErrDia(null);
    jget(`/api/pronostico/backtest?variable=${vari}&desde=${fecha}`
         + `&hasta=${diaSiguiente(fecha)}&bucket=${bucket}`)
      .then((r: Resp) => {
        if (!r.ok) { setErrDia(mensajeError(r)); return; }
        const pts = (r.data as any)?.puntos;
        if (!Array.isArray(pts) || !pts.length) { setErrDia("ese día no devolvió puntos"); return; }
        setDia(r.data);
        const etiquetas = pts.map((p: any) => p.t.slice(11, 16));
        // Se elige entre los momentos que SÍ existen: no hay selección inválida.
        setMomento((m) => (etiquetas.includes(m) ? m : etiquetas[Math.floor(etiquetas.length / 2)]));
      });
  }, [vari, fecha, bucket]);

  const momentos: string[] = useMemo(
    () => (dia?.puntos || []).map((p: any) => p.t.slice(11, 16)), [dia]);
  const idx = momentos.indexOf(momento);
  const punto = idx >= 0 ? dia.puntos[idx] : null;

  const chart = useMemo(() => {
    if (!dia?.puntos?.length) return "";
    void theme;                                      // recomputar al cambiar tema
    const P = palette();
    const pts = dia.puntos as any[];
    return lineChart([
      { points: pts.map((p) => p.real), color: P.real, area: true, width: 2.4, name: "Medido" },
      { points: pts.map((p) => p.pred), color: P.pred, dash: true, width: 2.2, name: "Predicho" },
    ], {
      x: momentos, height: 300, unit: unidad,
      yfmt: (v) => fmt(v, 0), tipfmt: (v) => fmt(v, dec),
      marca: idx >= 0 ? { i: idx, label: momento } : null,
    });
  }, [dia, momentos, idx, momento, theme, unidad, dec]);

  // Al agente se le manda la PREGUNTA, nunca los números: llama a su herramienta
  // con la hora exacta y las cifras salen de ahí. Si se los pasáramos en el
  // prompt sería un redactor de datos que no verificó.
  //
  // Se le pide prosa breve a propósito: los tres números ya están en los KPI de
  // arriba, así que repetirlos en una tabla es ruido. Lo que aporta el agente es
  // la INTERPRETACIÓN — por qué el método acertó o falló en ese momento.
  const preguntaAgente =
    `Evaluá la ${vari === "irradiancia" ? "irradiancia" : "humedad de suelo"} del ${fecha} `
    + `a las ${momento} (usá bucket "${bucket}"). ¿Por qué el método acertó o falló con `
    + `${etiqueta(bucket)} de anticipación, y qué dice eso del día? `
    + `Respondé en 3 o 4 frases, sin tablas ni listas: los valores ya están en pantalla, `
    + `citalos dentro del texto solo cuando hagan falta para el argumento.`;

  return (
    <section className="vista">
      <div className="phead phead-row">
        <div>
          <h1>Predicción vs Real</h1>
          <p>Elegí un momento: lo que midió el sensor contra lo que el modelo habría predicho.</p>
        </div>
        <span className="pill pill-modo"
              title="Reconstrucción: se reaplica el método sobre datos ya medidos. No son predicciones que el agente hizo en vivo — esas se auditan en la tabla `predicciones`.">
          modo backtest
        </span>
      </div>

      <div className="controls">
        <div className="ctl">
          <span className="lbl">Variable</span>
          <div className="chips">
            {VARIABLES.map(([v, l]) => (
              <button key={v} className={"chip" + (vari === v ? " on" : "")}
                      onClick={() => setVari(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="ctl">
          <span className="lbl">Fecha</span>
          <input className="input input-sm" type="date" value={fecha}
                 min={rango?.desde} max={rango?.hasta}
                 onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="ctl">
          <span className="lbl">Momento</span>
          <select className="input input-sm" value={momento} disabled={!momentos.length}
                  onChange={(e) => setMomento(e.target.value)}>
            {momentos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="ctl">
          <span className="lbl">Anticipación</span>
          <div className="chips">
            {ANTICIPACIONES.map(([b, l]) => (
              <button key={b} className={"chip" + (bucket === b ? " on" : "")}
                      onClick={() => setBucket(b)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        {(!chart || errDia) && (
          <Estado cargando={!dia && !errDia} error={errDia} vacio={!!dia && !chart}
                  que="ese día" pista="La serie tiene huecos: probá otra fecha."
                  onReintentar={() => setFecha((f) => f)} />
        )}
        {chart && !errDia && (
          <>
            <figure dangerouslySetInnerHTML={{ __html: chart }} />
            <div className="legend">
              <span><span className="sw" style={{ background: "var(--real)" }} />Medido</span>
              <span><span className="sw" style={{ background: "var(--pred)" }} />Predicho</span>
              <span className="muted">{fecha} · hora local (UTC−6)</span>
            </div>
          </>
        )}
      </div>

      {punto && <PuntoEvaluado punto={punto} unidad={unidad} dec={dec} anticipacion={etiqueta(bucket)} />}

      {punto && <LecturaAgente pregunta={preguntaAgente}
                               contexto={`Predicción vs Real · ${vari} · ${fecha} ${momento}`}
                               esperado={{ real: punto.real, pred: punto.pred }} />}

      <div className="pie-metricas">
        <span><b>Ese día:</b> error medio {fmt(dia?.metricas?.mae, 1)} {unidad} · sesgo {fmt(dia?.metricas?.bias, 1)} · {dia?.n ?? "—"} puntos</span>
        <span>
          <b>Últimos {DIAS_REFERENCIA} días:</b> error medio {fmt(ref?.mae, 1)} {unidad}
          {vari === "irradiancia"
            ? <> · mejora sobre el modelo ingenuo {fmt(ref?.skill_pct, 0)} %</>
            : <> · sin mejora medible: acá el método <em>es</em> la persistencia</>}
        </span>
      </div>
    </section>
  );
}
