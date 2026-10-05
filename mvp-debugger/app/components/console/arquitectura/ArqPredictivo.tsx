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
import { useCallback, useEffect, useRef, useState } from "react";
import { jget } from "@/app/lib/client";
import { IconoAlerta } from "@/app/components/Iconos";
import { HERRAMIENTAS } from "./catalogo";
import { Lienzo } from "./Lienzo";
import { NodoModal, type Detalle } from "./NodoModal";
import type { Mapa } from "./mapa";

import { MEDICION_OCULTA, MEDICION_VISIBLE, MODO } from "@/app/components/console/modos";
import { MAPA_RESPALDO } from "./mapaRespaldo";

const RUTA = "/api/predictivo/arquitectura";

// Qué gana el lector al cambiar de modo. Es el momento de la presentación: la
// garantía del sistema no es una promesa del prompt, es una herramienta ausente.
const LEYENDA: Record<string, string> = {
  [MEDICION_VISIBLE]: "El agente ve lo que midió el sensor: su trabajo es explicarlo, no adivinarlo.",
  [MEDICION_OCULTA]: "Sin `backtest` ni búsqueda web, no hay forma de ver el resultado antes de comprometerse.",
};

export function ArqPredictivo() {
  const [mapa, setMapa] = useState<Mapa | null>(null);
  // Si el mapa que se esta viendo salio de la copia y no del servicio, hay que
  // decirlo: una copia y la realidad no valen lo mismo.
  const [esRespaldo, setEsRespaldo] = useState(false);
  const [modo, setModo] = useState<string>(MEDICION_VISIBLE);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const marco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    jget<Mapa>(RUTA).then((r) => {
      if (!vivo) return;
      // El mapa describe la FORMA del agente, no datos medidos: cambia con el
      // codigo, no con la hora. Si el servicio no esta (apagado de noche o el
      // fin de semana), se dibuja la copia en vez de dejar la pantalla vacia.
      // `modos` es la firma del mapa del Predictivo. Sirve de doble chequeo: si
      // llegara un JSON de otra forma, no se dibuja como si fuera este agente.
      const vivo_ok = r.ok && !!r.data?.modos;
      const usable = vivo_ok ? r.data : (MAPA_RESPALDO as unknown as Mapa);
      setEsRespaldo(!vivo_ok);
      setMapa(usable);
      // El modo inicial es el primero que publica el servicio, no uno fijo.
      setModo(Object.keys(usable.modos ?? {})[0] || MEDICION_VISIBLE);
    });
    return () => { vivo = false; };
  }, []);

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
  const publicadas = new Set(mapa.herramientas.map((h) => h.nombre));
  // Fichas del catálogo que ya no corresponden a ninguna herramienta viva. No se
  // dibujan; se avisan. Una vista que calla esto es una vista que miente.
  const huerfanas = Object.keys(HERRAMIENTAS).filter((n) => !publicadas.has(n));
  const sinDocumentar = mapa.herramientas.filter((h) => !HERRAMIENTAS[h.nombre]);

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
        <div className="arq-leyenda">
          <span><i style={{ background: "var(--ceil)" }} /> entrada / servidor</span>
          <span><i style={{ background: "var(--warn)" }} /> puerta de acceso</span>
          <span><i style={{ background: "var(--accent)" }} /> el modelo</span>
          <span><i style={{ background: "var(--pred)" }} /> herramienta {MODO.medicion_visible.etiqueta}</span>
          <span><i style={{ background: "var(--real)" }} /> herramienta {MODO.medicion_oculta.etiqueta}</span>
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
