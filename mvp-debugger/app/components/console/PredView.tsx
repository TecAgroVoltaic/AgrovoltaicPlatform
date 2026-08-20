"use client";
// Predicción vs Real: una sola fecha manda sobre TODA la vista.
//
// Diseño: se elige día, momento y anticipación, y de ahí sale todo lo demás (la
// curva medido-vs-predicho, los tres números de ese momento y la lectura del
// agente). Antes había dos relojes independientes (una ventana de N días para el
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
import { A_CIEGAS, CON_RESPUESTA, MODO } from "@/app/components/console/modos";

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
// La anticipación en segundos, para pedírsela al agente sin que tenga que
// deducirla del texto (`predecir` la exige como entero).
const SEGUNDOS: Record<string, number> = { "15min": 900, "30min": 1800, h: 3600 };

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
  // Los dos modos se distinguen por UNA sola cosa, y de ahí salen sus nombres:
  // si el agente puede ver lo que midió el sensor.
  //   con la respuesta : lo ve. ¿Qué tan bueno es el MÉTODO? Lo juzga después del hecho.
  //   a ciegas         : no lo ve. ¿Predice bien sin saber? Se compromete primero.
  // No es un matiz de presentación: en `a_ciegas` el servicio le quita `backtest`
  // del juego de herramientas, que es la única que revela lo medido. Mismos dos
  // nombres en el backend (`agent.MODOS`), en el mapa de arquitectura y acá.
  const [aCiegas, setACiegas] = useState(false);

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
    // posible. Sin el techo no se puede leer nada: un medido de 33 W/m² no dice
    // si el día estuvo tapado o si simplemente era temprano.
    // El gráfico SIEMPRE va entero, en los dos modos. Cortarlo a ciegas
    // fue un intento de "que no se vea la respuesta" que no protege nada: la
    // garantía de que el agente no la ve es que el servicio no le publica la
    // herramienta que la revela, y eso pasa del lado del servidor. Mutilar el
    // gráfico solo le saca a quien presenta la forma de leer el día.
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
    + `(en escala, no en impresión) y decí qué limitación tuya lo explica. `
    + `Si te equivocaste, empezá por ahí. 3 o 4 frases, sin tablas ni listas.`;

  // A ciegas se le pide COMPROMETERSE, no explicar. El horizonte en
  // segundos es explícito para que no tenga que deducirlo, y se le prohíbe pedir
  // el resultado: aunque la herramienta no exista, el intento ensuciaría la traza.
  const preguntaCiega =
    `Predecí la ${vari === "irradiancia" ? "irradiancia" : "humedad de suelo"} `
    + `del ${fecha} a las ${momento} (hora local), con ${etiqueta(bucket)} de anticipación `
    + `(${SEGUNDOS[bucket]} segundos). Diagnosticá primero, medí el riesgo de nubes, `
    + `y recién ahí comprometete con un número y su banda. Declará tu confianza y decí `
    + `de qué lado podría fallar. No vas a poder ver lo que midió el sensor: no lo pidas. `
    + `3 o 4 frases, sin tablas ni listas.`;

  // Instante en que el agente "se para" para predecir: el momento elegido menos
  // la anticipación. Se arma en hora local sin zona, que es como lo interpreta el
  // servicio (America/Costa_Rica).
  const corteISO = useMemo(() => {
    if (!fecha || !momento) return "";
    const t = new Date(`${fecha}T${momento}:00`).getTime() - SEGUNDOS[bucket] * 1000;
    const d = new Date(t);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
         + `T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
  }, [fecha, momento, bucket]);

  return (
    <section className="vista">
      <div className="phead phead-row">
        <div>
          <h1>Predicción vs Real</h1>
          <p>Elegí un momento: lo que midió el sensor contra lo que el modelo habría predicho.</p>
        </div>
        <div className="chips chips-modo">
          {([MODO.con_respuesta, MODO.a_ciegas] as const).map((m) => (
            <button key={m.id} title={m.ayuda}
                    className={"chip" + ((m.id === A_CIEGAS) === aCiegas ? " on" : "")}
                    onClick={() => setACiegas(m.id === A_CIEGAS)}>
              {m.etiqueta}
            </button>
          ))}
        </div>
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

      {punto && (
        <LecturaAgente
          key={aCiegas ? A_CIEGAS : CON_RESPUESTA}
          pregunta={aCiegas ? preguntaCiega : preguntaAgente}
          modo={aCiegas ? A_CIEGAS : CON_RESPUESTA}
          // OJO: el contexto viaja dentro del mensaje del usuario. A ciegas
          // NO puede llevar el valor medido, ni el error, ni nada derivado.
          contexto={`Predicción vs Real · ${vari} · ${fecha} ${momento}`}
          esperado={aCiegas ? null : { real: punto.real, pred: punto.pred }}
          // El corte: se predice `momento` con `bucket` de anticipación, así que
          // los datos visibles terminan justo esa anticipación antes.
          revelar={aCiegas ? { variable: vari, ahora: corteISO,
                             horizonte_seg: SEGUNDOS[bucket], unidad, dec } : null} />
      )}
    </section>
  );
}
