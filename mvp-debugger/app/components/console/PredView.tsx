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

  const unidad = vari === "irradiancia" ? "W/m²" : "crudo";
  const dec = vari === "irradiancia" ? 1 : 0;

  // 1. Rango disponible -> día por defecto: el último COMPLETO (el del último
  //    dato viene cortado a media madrugada y no se ve nada).
  //
  //    El rango se recuerda en localStorage porque, si no, la vista queda
  //    SECUENCIAL: hay que esperar a /serie para saber qué día pedir, y recién
  //    entonces sale la llamada del gráfico. Con el rango recordado las dos
  //    salen a la vez y la revalidación corrige si la ingesta avanzó.
  useEffect(() => {
    setDia(null); setErrDia(null);
    const clave = `agrov-rango-${vari}`;
    const aplicar = (r: { desde: string; hasta: string }, esCache: boolean) => {
      setRango(r);
      const ultimo = new Date(r.hasta + "T00:00:00");
      const porDefecto = new Date(ultimo.getTime() - MS_POR_DIA).toISOString().slice(0, 10);
      // Del caché solo se toma el día inicial; si el usuario ya eligió otro, no
      // se le pisa la selección cuando llega la revalidación.
      setFecha((f) => (esCache || !f ? porDefecto : f));
    };
    let cacheado: { desde: string; hasta: string } | null = null;
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado) cacheado = JSON.parse(guardado);
    } catch { /* caché corrupto: se ignora y manda la red */ }
    if (cacheado) aplicar(cacheado, true);

    jget(`/api/pronostico/serie?variable=${vari}&bucket=D&ultimos_dias=1`).then((r: Resp) => {
      const resumen = r.ok ? (r.data as any)?.resumen : null;
      if (!resumen?.hasta) { if (!cacheado) setRango(null); return; }
      const nuevo = { desde: resumen.desde.slice(0, 10), hasta: resumen.hasta.slice(0, 10) };
      try { localStorage.setItem(clave, JSON.stringify(nuevo)); } catch { /* modo privado */ }
      setRango(nuevo);
      // El día por defecto solo se recalcula si el rango cambió respecto al
      // caché: si no, se respeta lo que ya se está mostrando.
      if (!cacheado || cacheado.hasta !== nuevo.hasta) aplicar(nuevo, !cacheado);
    });
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

  const hayTecho = !!dia?.puntos?.[0] && dia.puntos[0].cs != null;

  const chart = useMemo(() => {
    if (!dia?.puntos?.length) return "";
    void theme;                                      // recomputar al cambiar tema
    const P = palette();
    const pts = dia.puntos as any[];
    // El gráfico muestra el TERRENO: lo que midió el sensor y el máximo físico
    // posible. Sin el techo no se puede leer nada — un medido de 33 W/m² no dice
    // si el día estuvo tapado o si simplemente era temprano.
    const series: any[] = [
      { points: pts.map((p) => p.real), color: P.real, area: true, width: 2.4, name: "Medido" },
    ];
    if (pts[0].cs != null) {
      series.push({ points: pts.map((p) => p.cs), color: P.ceil, width: 1.4,
                    name: "Techo (cielo despejado)" });
    }
    return lineChart(series, {
      x: momentos, height: 300, unit: unidad,
      yfmt: (v) => fmt(v, 0), tipfmt: (v) => fmt(v, dec),
      marca: idx >= 0 ? { i: idx, label: momento } : null,
    });
  }, [dia, momentos, idx, momento, theme, unidad, dec]);

  // Al agente se le manda la PREGUNTA, nunca los números: llama a su herramienta
  // con la hora exacta y las cifras salen de ahí. Si se los pasáramos en el
  // prompt sería un redactor de datos que no verificó.
  //
  // Se le pide JUSTIFICACIÓN y CRÍTICA, no descripción: las cifras ya están en
  // las fichas de al lado, repetirlas no aporta nada. Lo único que el agente
  // puede agregar es por qué salió ese número, cuánto vale y qué lo limitó.
  const preguntaAgente =
    `Analizá tu pronóstico de ${vari === "irradiancia" ? "irradiancia" : "humedad de suelo"} `
    + `del ${fecha} a las ${momento} con ${etiqueta(bucket)} de anticipación `
    + `(usá bucket "${bucket}"). No describas las cifras, que ya están a la vista: `
    + `justificá por qué te dio ese valor, juzgá con honestidad qué tan bueno fue `
    + `—en escala, no en impresión— y decí qué limitación tuya lo explica. `
    + `Si te equivocaste, empezá por ahí. 3 o 4 frases, sin tablas ni listas.`;

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
          <span className="lbl" title="Cuánto ANTES se hizo la predicción. Con 1 hora, el valor del momento elegido se reconstruye con el índice de claridad de la franja anterior, proyectado sobre el techo de cielo despejado del momento. No se adelantan datos: el algoritmo solo ve lo que ya había ocurrido.">
            Anticipación
          </span>
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
              {hayTecho && (
                <span title="Máximo físico posible con el sol en esa posición y el cielo sin nubes. La razón medido/techo es el índice de claridad kt*.">
                  <span className="sw" style={{ background: "var(--ceil)" }} />Techo (cielo despejado)
                </span>
              )}
              <span className="muted">{fecha} · hora local (UTC−6)</span>
            </div>
            {hayTecho && (
              <p className="note">
                <b>Techo</b>: la luz que habría con el cielo despejado (modelo Ineichen, puramente
                astronómico). La distancia entre las dos curvas son las nubes.{" "}
                <a href="/docs#metodo">Ver el método completo ↗</a>
              </p>
            )}
          </>
        )}
      </div>

      {punto && <LecturaAgente pregunta={preguntaAgente}
                               contexto={`Predicción vs Real · ${vari} · ${fecha} ${momento}`}
                               esperado={{ real: punto.real, pred: punto.pred }} />}
    </section>
  );
}
