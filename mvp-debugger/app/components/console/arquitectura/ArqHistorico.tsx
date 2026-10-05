"use client";
// Arquitectura del Agente Histórico.
//
// Es una vista APARTE de la del Predictivo, no una opción de la misma, porque los
// dos agentes no están organizados igual y dibujarlos con la misma plantilla
// obligaría a mentir sobre uno de los dos. El Predictivo se explica por MODOS: su
// garantía es que la herramienta que revela la respuesta NO ESTÁ en la lista. El
// Histórico se explica por la CADENA: la detección corre por lotes, fuera del
// agente, y deja un store; las herramientas solo leen ese store, con un pool que
// no puede escribir. El LLM entra al final y nunca toca un número.
//
// Como el otro mapa, acá no se declara la estructura: se pide a
// `GET /historico/arquitectura`, que la deriva de `tools.SCHEMAS` y de los propios
// módulos. La prosa del «por qué» vive en `catalogoHistorico.ts`, y cuando el
// catálogo y el servicio se separan, la vista lo dice en pantalla.
import { useCallback, useRef, useState } from "react";

import { IconoAlerta } from "@/app/components/Iconos";
import { HERRAMIENTAS_HISTORICO } from "./catalogoHistorico";
import { LienzoHistorico } from "./LienzoHistorico";
import { NodoModal, type Detalle } from "./NodoModal";
import { useMapaHistorico } from "./useMapaHistorico";
import type { MapaHistorico } from "./mapaHistorico";

export function ArqHistorico() {
  const { mapa, esRespaldo } = useMapaHistorico();

  if (!mapa) {
    return (
      <section className="vista">
        <div className="phead">
          <h1>Arquitectura del Agente Histórico</h1>
          <p>Leyendo el mapa del servicio…</p>
        </div>
      </section>
    );
  }
  return <PanelHistorico mapa={mapa} esRespaldo={esRespaldo} />;
}

/** El render, sin fetch ni estado de red.
 *
 * Separado del componente de arriba para que se pueda RENDERIZAR con un mapa real
 * en `scripts/verificar-vistas.mjs`: el efecto que trae los datos no corre en un
 * render estático, así que si el cuerpo viviera dentro del shell, lo único
 * verificable sería la pantalla de «cargando». No hay navegador con el que mirar
 * esta consola, así que lo que no se puede renderizar en la verificación se
 * termina construyendo a ciegas.
 */
export function PanelHistorico({ mapa, esRespaldo = false }: {
  mapa: MapaHistorico; esRespaldo?: boolean;
}) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const marco = useRef<HTMLDivElement>(null);

  const pantallaCompleta = useCallback(() => {
    const el = marco.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => { /* el navegador puede negarlo */ });
  }, []);

  const publicadas = new Set(mapa.herramientas.map((h) => h.nombre));
  // Fichas del catálogo sin herramienta viva, y herramientas vivas sin ficha. Las
  // dos se avisan: una vista de arquitectura que calla la diferencia con el
  // servicio deja de servir para lo único que sirve, que es confiar en ella.
  const huerfanas = Object.keys(HERRAMIENTAS_HISTORICO).filter((n) => !publicadas.has(n));
  const sinDocumentar = mapa.herramientas.filter((h) => !HERRAMIENTAS_HISTORICO[h.nombre]);

  return (
    <section className="vista">
      <div className="phead phead-row">
        <div>
          <h1>Arquitectura del Agente Histórico</h1>
          <p>
            {mapa.objetivo} El modelo no calcula: elige qué herramienta llamar y redacta.
            Las dos familias no leen del mismo sitio, y el barrido escribe el store sin
            pasar por él. Este mapa se lee del servicio en cada carga, así que muestra el
            agente como está hoy, no como se documentó alguna vez.
          </p>
          {esRespaldo && (
            <p className="hint" style={{ marginTop: 6 }}>
              <strong>Copia guardada.</strong> El servicio no respondió, así que este mapa
              sale de la última captura y no del agente en vivo.
            </p>
          )}
        </div>
        <button className="btn-sm" onClick={pantallaCompleta}>Pantalla completa</button>
      </div>

      <div className="card arq-marco" ref={marco}>
        {/* El scroll horizontal vive SOLO acá dentro: con la leyenda dentro del
            scroller, al desplazarse el lienzo la leyenda se iba con él. */}
        <div className="arq-scroll">
          <LienzoHistorico mapa={mapa} onAbrir={setDetalle} />
        </div>
        <div className="arq-leyenda">
          <span><i style={{ background: "var(--ceil)" }} /> entrada · consola</span>
          <span><i style={{ background: "var(--warn)" }} /> puerta de acceso</span>
          <span><i style={{ background: "var(--accent)" }} /> el modelo</span>
          <span><i style={{ background: "var(--pred)" }} /> herramienta de análisis</span>
          <span><i style={{ background: "var(--real)" }} /> herramienta de calidad</span>
          <span><i style={{ background: "var(--muted)" }} /> datos · solo lectura</span>
          <span className="arq-ayuda">Pasá el mouse para el resumen · hacé clic para el detalle</span>
        </div>
      </div>

      {(huerfanas.length > 0 || sinDocumentar.length > 0) && (
        <p className="arq-aviso">
          <IconoAlerta size={14} />
          {huerfanas.length > 0 && (
            <span>
              La consola documenta {huerfanas.join(", ")}, que el servicio todavía no
              expone: el agente desplegado va detrás del código.
              {sinDocumentar.length > 0 ? " " : ""}
            </span>
          )}
          {sinDocumentar.length > 0 && (
            <span>
              {sinDocumentar.map((h) => h.nombre).join(", ")} corre en el servicio sin
              ficha en la consola: se dibuja con su contrato, sin explicación.
            </span>
          )}
        </p>
      )}

      <p className="note">
        <b>Los criterios están en la documentación.</b> Los ocho{" "}
        <a href="/docs#historico">umbrales que deciden si un dato sirve</a> y los{" "}
        {mapa.hallazgos.tipos.length} tipos de hallazgo que el barrido tipifica se leen
        mejor de corrido que al pie de un mapa, y se leen del mismo servicio que este
        dibujo, así que dicen lo mismo. Esta pantalla es la forma del agente; aquella,
        sus criterios.
      </p>

      <NodoModal detalle={detalle} onCerrar={() => setDetalle(null)} />
    </section>
  );
}
