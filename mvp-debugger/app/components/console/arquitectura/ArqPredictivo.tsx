"use client";
// Arquitectura del Agente PREDICTIVO: el agente dibujado como grafo.
//
// Es del Predictivo y solo del Predictivo. Se llamaba `ArqView` y la barra lateral
// la abría con los DOS agentes, así que bajo el Histórico mostraba este mapa con
// aquel rótulo. El Histórico tiene el suyo en `ArqHistorico.tsx`, con otra forma:
// se organiza por familias, no por modos.
//
// La estructura NO se escribe acá. Se pide a `GET /arquitectura`, que la deriva
// de `agent.MODOS` y de los `input_schema` reales, los mismos objetos que se le
// mandan al modelo. El catálogo local solo agrega la prosa del «por qué».
//
// De ese reparto sale la propiedad que hace confiable a la vista: no puede
// mostrar una herramienta que no existe, ni ocultar una que sí. Si el catálogo y
// el servicio se separan, la discrepancia se muestra en pantalla.
//
// El mapa se pide en `predictivo/useMapaPredictivo.ts`; la leyenda y el aviso de
// catálogo son componentes propios.
import { useCallback, useRef, useState } from "react";
import { Lienzo } from "./Lienzo";
import { NodoModal, type Detalle } from "./NodoModal";
import { MEDICION_OCULTA, MEDICION_VISIBLE } from "@/app/components/console/modos";
import { AvisoCatalogo } from "./predictivo/AvisoCatalogo";
import { LeyendaLienzo } from "./predictivo/LeyendaLienzo";
import { useMapaPredictivo } from "./predictivo/useMapaPredictivo";

// Qué gana el lector al cambiar de modo. Es el momento de la presentación: la
// garantía del sistema no es una promesa del prompt, es una herramienta ausente.
const LEYENDA: Record<string, string> = {
  [MEDICION_VISIBLE]: "El agente ve lo que midió el sensor: su trabajo es explicarlo, no adivinarlo.",
  [MEDICION_OCULTA]: "Sin `backtest` ni búsqueda web, no hay forma de ver el resultado antes de comprometerse.",
};

export function ArqPredictivo() {
  const { mapa, esRespaldo, modo, setModo } = useMapaPredictivo();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const marco = useRef<HTMLDivElement>(null);

  const pantallaCompleta = useCallback(() => {
    const el = marco.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => { /* el navegador puede negarlo */ });
  }, []);

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
          {esRespaldo && (
            <p className="hint" style={{ marginTop: 6 }}>
              <strong>Copia guardada.</strong> El servicio no respondió, así que este mapa
              sale de la última captura y no del agente en vivo. Coincide salvo que el
              código haya cambiado desde entonces.
            </p>
          )}
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
        <LeyendaLienzo />
      </div>

      <AvisoCatalogo mapa={mapa} />

      <p className="note">
        <b>Cómo se pone a prueba.</b> Pruebas unitarias sobre física, esquemas, límites y
        traza; un guion extremo a extremo contra el servicio vivo; y cuatro pruebas dedicadas
        a que el agente nunca vea la respuesta antes de comprometerse. Una de ellas recorre
        la salida de <code>predecir</code> en todos sus niveles buscando claves prohibidas.
        Además, el propio <code>backtest</code> es el banco de pruebas del método: mide error
        y <i>skill</i> contra repetir la última lectura. Detalle en{" "}
        <a href="/docs#pronostico">la documentación</a>.
      </p>

      <NodoModal detalle={detalle} onCerrar={() => setDetalle(null)} />
    </section>
  );
}
