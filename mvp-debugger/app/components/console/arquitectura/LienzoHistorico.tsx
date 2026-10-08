"use client";
// El grafo del Agente Histórico. Mismo lenguaje visual que el del Predictivo
// (nodos sobre coordenadas fijas, aristas en SVG detrás), otro relato.
//
// Lo que la imagen tiene que dejar dicho, y que una lista de herramientas no
// puede:
//
//   1. Las DOS FAMILIAS no leen del mismo sitio. Análisis lee las vistas
//      corregidas; Calidad lee el store. Son dos destinos distintos y por eso
//      son dos familias, no una agrupación cosmética.
//   2. El BARRIDO llega al store SIN pasar por el modelo. Es una flecha que
//      entra por abajo, fuera del camino del LLM, y es toda la garantía: el
//      veredicto de un día ya estaba escrito antes de que nadie preguntara.
//
// La pila de herramientas se calcula desde lo que publica el servicio: si mañana
// hay trece, entra sola y el lienzo crece. Por eso el alto no es una constante.
//
// La disposición vive en `lienzoHistorico/disposicion.ts`; el modelo, las
// herramientas y los datos de cada familia son componentes propios.
import type { Ficha } from "./catalogo";
import { ANCHO_H, COL_H, LIENZO_H, NODOS_FIJOS_H } from "./catalogoHistorico";
import type { MapaHistorico } from "./mapaHistorico";
import type { Detalle } from "./NodoModal";
import { CerebroHistorico } from "./lienzoHistorico/CerebroHistorico";
import { DatosFamilias } from "./lienzoHistorico/DatosFamilias";
import { aristasDe, disponer, PANEL } from "./lienzoHistorico/disposicion";
import { HerramientasHistorico } from "./lienzoHistorico/HerramientasHistorico";
import { Nodo } from "./lienzoHistorico/Nodo";

/** Lo que la punta de la flecha del barrido se separa del borde del panel. */
const PUNTA_DEL_BARRIDO = 7;

export function LienzoHistorico({ mapa, onAbrir }: {
  mapa: MapaHistorico;
  onAbrir: (d: Detalle) => void;
}) {
  const { grupos, alto } = disponer(mapa);
  const ultimo = grupos.at(-1);
  const aristas = aristasDe(grupos);

  const abrirFicha = (titulo: string, clase: string, ficha: Ficha) =>
    onAbrir({ titulo, clase, ficha });

  return (
    <div className="arq-lienzo" style={{ height: alto, width: LIENZO_H.w }}>
      <svg className="arq-edges" viewBox={`0 0 ${LIENZO_H.w} ${alto}`}
           style={{ width: LIENZO_H.w }} aria-hidden="true">
        {aristas.map((a, i) => (
          <path key={i} d={a.d} className={`viva ${a.clase || ""}`} />
        ))}
        {/* El barrido entra al store por abajo. Va aparte y en otro trazo porque
            es el único camino que NO pasa por el modelo, y esa es la garantía. */}
        {ultimo && (
          <path
            className="arq-escribe"
            d={`M ${COL_H.dato + ANCHO_H.dato / 2} ${ultimo.panel.y + PANEL.h + PANEL.gapBarrido}
                L ${COL_H.dato + ANCHO_H.dato / 2} ${ultimo.panel.y + PANEL.h + PUNTA_DEL_BARRIDO}`}
            markerEnd="url(#punta-h)"
          />
        )}
        <defs>
          <marker id="punta-h" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ceil)" />
          </marker>
        </defs>
      </svg>

      <span className="arq-lane" style={{ left: COL_H.entrada }}>Entradas</span>
      <span className="arq-lane" style={{ left: COL_H.cerebro }}>El agente</span>
      <span className="arq-lane" style={{ left: COL_H.tool }}>Herramientas</span>
      <span className="arq-lane" style={{ left: COL_H.dato }}>Datos · solo lectura</span>

      {/* Entradas y puerta de acceso */}
      {NODOS_FIJOS_H.map((n) => (
        <Nodo key={n.id} clase={`arq-${n.grupo}`} x={n.x} y={n.y} w={n.w} h={n.h}
              titulo={n.titulo} sub={n.sub} tip={n.ficha.hover}
              onAbrir={() => abrirFicha(n.titulo,
                n.grupo === "puerta" ? "puerta de acceso" : "entrada · consola", n.ficha)} />
      ))}

      <CerebroHistorico mapa={mapa} abrirFicha={abrirFicha} />

      <HerramientasHistorico grupos={grupos} onAbrir={onAbrir} />

      <DatosFamilias grupos={grupos} abrirFicha={abrirFicha} />
    </div>
  );
}
