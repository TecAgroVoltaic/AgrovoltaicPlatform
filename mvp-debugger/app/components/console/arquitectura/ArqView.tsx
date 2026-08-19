"use client";
// Vista de arquitectura: el agente dibujado como grafo, tal como está construido.
//
// La estructura NO se escribe acá. Se pide a `GET /arquitectura`, que la deriva
// de `agent.MODOS` y de los `input_schema` reales — los mismos objetos que se le
// mandan al modelo. El catálogo local solo agrega la prosa del «por qué».
//
// De ese reparto sale la propiedad que hace confiable a la vista: no puede
// mostrar una herramienta que no existe, ni ocultar una que sí. Si el catálogo y
// el servicio se separan, la discrepancia se muestra en pantalla.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { jget, mensajeError, nfmt } from "@/app/lib/client";
import { IconoAlerta } from "@/app/components/Iconos";
import { HERRAMIENTAS } from "./catalogo";
import { Lienzo } from "./Lienzo";
import { NodoModal, type Detalle } from "./NodoModal";
import { dia, type Mapa } from "./mapa";

const RUTA = "/api/pronostico/arquitectura";

// Qué gana el lector al cambiar de modo. Es el momento de la presentación: la
// garantía del sistema no es una promesa del prompt, es una herramienta ausente.
const LEYENDA: Record<string, string> = {
  analisis: "El agente ve el resultado medido: su trabajo es explicarlo.",
  prediccion: "Sin backtest ni búsqueda web, no hay forma de ver el resultado antes de comprometerse.",
};

function Tarjeta({ rot, dato, children, critica }: {
  rot: string; dato: string; children: ReactNode; critica?: boolean;
}) {
  return (
    <div className={"card arq-card" + (critica ? " arq-card-crit" : "")}>
      <span className="lbl">{rot}</span>
      <span className="arq-big">{dato}</span>
      <p>{children}</p>
    </div>
  );
}

export function ArqView() {
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState("analisis");
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const marco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    jget<Mapa>(RUTA).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data?.modos) { setError(mensajeError(r)); return; }
      setMapa(r.data);
      // El modo inicial es el primero que publica el servicio, no uno fijo.
      setModo(Object.keys(r.data.modos)[0] || "analisis");
    });
    return () => { vivo = false; };
  }, []);

  const pantallaCompleta = useCallback(() => {
    const el = marco.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => { /* el navegador puede negarlo */ });
  }, []);

  if (error) {
    return (
      <section className="vista">
        <div className="phead"><h1>Arquitectura del agente</h1></div>
        <div className="card">
          <p className="hint" style={{ color: "var(--crit)" }}>
            No se pudo leer el mapa del agente: {error}
          </p>
        </div>
      </section>
    );
  }

  if (!mapa) {
    return (
      <section className="vista">
        <div className="phead">
          <h1>Arquitectura del agente</h1>
          <p>Leyendo el mapa del servicio…</p>
        </div>
      </section>
    );
  }

  const modos = Object.keys(mapa.modos);
  const publicadas = new Set(mapa.herramientas.map((h) => h.nombre));
  // Fichas del catálogo que ya no corresponden a ninguna herramienta viva. No se
  // dibujan; se avisan. Una vista que calla esto es una vista que miente.
  const huerfanas = Object.keys(HERRAMIENTAS).filter((n) => !publicadas.has(n));
  const sinDocumentar = mapa.herramientas.filter((h) => !HERRAMIENTAS[h.nombre]);
  const lim = mapa.limites;
  const horas = lim.horizonte_seg ? Math.round(lim.horizonte_seg.max / 3600) : null;
  const irr = mapa.datos.irradiancia || {};

  return (
    <section className="vista">
      <div className="phead phead-row">
        <div>
          <h1>Arquitectura del agente</h1>
          <p>
            El modelo no calcula: lee la pregunta, elige qué herramienta llamar y redacta.
            Cada número sale de una función determinista sobre datos medidos. Este mapa se
            lee del servicio en cada carga, así que muestra el agente como está hoy.
          </p>
        </div>
        <button className="btn-sm" onClick={pantallaCompleta}>Pantalla completa</button>
      </div>

      <div className="arq-barra">
        <div className="arq-seg" role="group" aria-label="Modo del agente">
          {modos.map((m) => (
            <button key={m} aria-pressed={m === modo} onClick={() => setModo(m)}>
              Modo {m}
            </button>
          ))}
        </div>
        <p className="arq-cap">
          <b>{mapa.modos[modo]?.objetivo}</b> {LEYENDA[modo] || ""}
        </p>
      </div>

      <div className="card arq-marco" ref={marco}>
        {/* El scroll horizontal vive SOLO acá dentro: con la leyenda dentro del
            scroller, al desplazarse el lienzo la leyenda se iba con él y se
            cortaba por la izquierda. */}
        <div className="arq-scroll">
          <Lienzo mapa={mapa} modo={modo} onAbrir={setDetalle} />
        </div>
        <div className="arq-leyenda">
          <span><i style={{ background: "var(--ceil)" }} /> entrada / servidor</span>
          <span><i style={{ background: "var(--warn)" }} /> puerta de acceso</span>
          <span><i style={{ background: "var(--accent)" }} /> el modelo</span>
          <span><i style={{ background: "var(--pred)" }} /> herramienta de análisis</span>
          <span><i style={{ background: "var(--real)" }} /> herramienta de predicción</span>
          <span><i style={{ background: "var(--muted)" }} /> cálculo y datos</span>
          <span className="arq-ayuda">Pasá el mouse para el resumen · hacé clic para el detalle</span>
        </div>
      </div>

      {(huerfanas.length > 0 || sinDocumentar.length > 0) && (
        <p className="arq-aviso">
          <IconoAlerta size={14} />
          {huerfanas.length > 0 && (
            <span>
              La consola documenta {huerfanas.join(", ")}, que el servicio ya no expone.
              {sinDocumentar.length > 0 ? " " : ""}
            </span>
          )}
          {sinDocumentar.length > 0 && (
            <span>
              {sinDocumentar.map((h) => h.nombre).join(", ")} corre en el servicio sin ficha
              en la consola: se dibuja con su contrato, sin explicación.
            </span>
          )}
        </p>
      )}

      <div className="arq-grid">
        <Tarjeta rot="Horizonte" dato={horas ? `60 s – ${horas} h` : "—"}>
          Validado en el <b>esquema</b> de la herramienta, no en el prompt. Más allá,
          persistir la nubosidad deja de tener sentido físico.
        </Tarjeta>
        <Tarjeta rot="Ritmo" dato={`${lim.llm_por_min} / min`}>
          Llamadas de LLM por identidad, con token bucket. Los endpoints deterministas
          van a {lim.datos_por_min}/min. Generoso para un humano, letal para un bucle.
        </Tarjeta>
        <Tarjeta rot="Presupuesto" dato={`US$ ${nfmt(lim.presupuesto_diario_usd, 2)} / día`}>
          Tope duro de gasto. Antes existía el medidor pero no el freno: un error de
          integración podía disparar la factura.
        </Tarjeta>
        <Tarjeta rot="Contexto" dato={`${lim.historial_mensajes} mensajes`}>
          Historial recortado, <b>{lim.max_tokens}</b> tokens de salida. El prompt pide una
          o dos frases por bloque: nada de tablas ni listas largas.
        </Tarjeta>
        <Tarjeta rot="Cobertura" dato={irr.n ? `${nfmt(irr.n, 0)} lecturas` : "sin datos"}>
          Irradiancia de {dia(irr.desde)} a {dia(irr.hasta)}, <b>no continua</b>: la serie
          tiene huecos, y las herramientas los reportan en vez de rellenarlos.
        </Tarjeta>
        <Tarjeta rot="Acceso" dato="solo lectura" critica>
          Base en modo lectura, <b>x-api-key</b> obligatoria en producción, y la clave nunca
          sale del servidor.
        </Tarjeta>
      </div>

      <p className="note">
        <b>Cómo se pone a prueba.</b> Pruebas unitarias sobre física, esquemas, límites y
        traza; un guion extremo a extremo contra el servicio vivo; y cuatro pruebas dedicadas
        a que el agente nunca vea la respuesta antes de comprometerse — una de ellas recorre
        la salida de <code>predecir</code> en todos sus niveles buscando claves prohibidas.
        Además, el propio <code>backtest</code> es el banco de pruebas del método: mide error
        y <i>skill</i> contra repetir la última lectura. Detalle en{" "}
        <a href="/docs#pronostico">la documentación</a>.
      </p>

      <NodoModal detalle={detalle} onCerrar={() => setDetalle(null)} />
    </section>
  );
}
