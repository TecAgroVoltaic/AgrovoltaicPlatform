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
import type { ReactNode } from "react";

import type { Ficha } from "./catalogo";
import {
  ANCHO_H, BARRIDO, CEREBRO_H, COL_H, DESTINO, FAMILIAS,
  HERRAMIENTAS_HISTORICO, LIENZO_H, NODOS_FIJOS_H, TOOL_H,
} from "./catalogoHistorico";
import { familiasOrdenadas, type HerramientaHist, type MapaHistorico } from "./mapaHistorico";
import type { Detalle } from "./NodoModal";

// Puerto de salida del modelo y de entrada de la puerta de acceso.
const PUERTO_CEREBRO = { x: CEREBRO_H.x + CEREBRO_H.w, y: CEREBRO_H.y + 125 };
const PUERTO_PUERTA = { x: COL_H.puerta, y: 182 };
// Alto del panel de datos de cada familia. Se centra contra su grupo.
const PANEL = { h: 168, gapBarrido: 40, altoBarrido: 96 };

type Item = { h: HerramientaHist; ficha?: Ficha; y: number; centro: number };
type Grupo = {
  familia: string; yEncabezado: number; items: Item[];
  /** Dónde va a leer esta familia: el panel de datos alineado a su altura. */
  panel: { y: number; puerto: { x: number; y: number } };
};

/** Curva horizontal suave entre dos puertos. */
function curva(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(26, Math.abs(x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Apila las herramientas por familia y alinea el panel de datos de cada una. */
function disponer(mapa: MapaHistorico): { grupos: Grupo[]; alto: number } {
  const porNombre = new Map(mapa.herramientas.map((h) => [h.nombre, h]));
  const grupos: Grupo[] = [];
  let y = TOOL_H.y0;

  for (const [familia, fam] of familiasOrdenadas(mapa)) {
    const tools = fam.herramientas.filter((n) => porNombre.has(n)).map((n) => porNombre.get(n)!);
    if (!tools.length) continue;
    const items = tools.map((h, i) => {
      const top = y + i * (TOOL_H.h + TOOL_H.gap);
      return { h, ficha: HERRAMIENTAS_HISTORICO[h.nombre], y: top, centro: top + TOOL_H.h / 2 };
    });
    const alto = tools.length * (TOOL_H.h + TOOL_H.gap) - TOOL_H.gap;
    // El panel se centra contra su grupo: la alineación ES el mensaje (esta
    // familia lee de acá), así que no puede quedar a ojo.
    const panelY = y + Math.max(0, (alto - PANEL.h) / 2);
    grupos.push({
      familia, yEncabezado: y - TOOL_H.encabezado, items,
      panel: { y: panelY, puerto: { x: COL_H.dato, y: panelY + PANEL.h / 2 } },
    });
    y += alto + TOOL_H.entreGrupos;
  }

  const ultimo = grupos.at(-1);
  const fondoTools = ultimo ? ultimo.items.at(-1)!.y + TOOL_H.h : TOOL_H.y0;
  const fondoBarrido = ultimo
    ? ultimo.panel.y + PANEL.h + PANEL.gapBarrido + PANEL.altoBarrido
    : 0;
  return { grupos, alto: Math.max(fondoTools, fondoBarrido) + LIENZO_H.margenInferior };
}

function Nodo({ clase, x, y, w, h, titulo, sub, tip, onAbrir, chip }: {
  clase: string; x: number; y: number; w: number; h: number;
  titulo: string; sub: string; tip: string; onAbrir: () => void;
  /** Marcas cortas, a la derecha del título. Ahí y no debajo: abajo empujaban el
   *  alto del nodo y terminaba tocando el de al lado. */
  chip?: ReactNode;
}) {
  return (
    <button className={`arq-nodo ${clase}`} style={{ left: x, top: y, width: w, height: h }}
            data-tip={tip} onClick={onAbrir}>
      <span className="arq-cer-h">
        <span className="arq-n-t">{titulo}</span>
        {chip}
      </span>
      <span className="arq-n-s">{sub}</span>
    </button>
  );
}

export function LienzoHistorico({ mapa, onAbrir }: {
  mapa: MapaHistorico;
  onAbrir: (d: Detalle) => void;
}) {
  const { grupos, alto } = disponer(mapa);
  const ultimo = grupos.at(-1);

  // ── Aristas ───────────────────────────────────────────────────────────────
  const aristas: { d: string; clase?: string }[] = [];
  for (const n of NODOS_FIJOS_H.filter((n) => n.grupo === "entrada")) {
    aristas.push({ d: curva(n.x + n.w, n.y + n.h / 2, PUERTO_PUERTA.x, PUERTO_PUERTA.y) });
  }
  aristas.push({
    d: curva(COL_H.puerta + ANCHO_H.puerta, PUERTO_PUERTA.y, CEREBRO_H.x, PUERTO_CEREBRO.y),
  });
  for (const g of grupos) {
    for (const it of g.items) {
      aristas.push({ d: curva(PUERTO_CEREBRO.x, PUERTO_CEREBRO.y, COL_H.tool, it.centro) });
      aristas.push({
        d: curva(COL_H.tool + ANCHO_H.tool, it.centro, g.panel.puerto.x, g.panel.puerto.y),
      });
    }
  }

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
                L ${COL_H.dato + ANCHO_H.dato / 2} ${ultimo.panel.y + PANEL.h + 7}`}
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

      {/* El modelo */}
      <button className="arq-nodo arq-cerebro"
              style={{ left: CEREBRO_H.x, top: CEREBRO_H.y, width: CEREBRO_H.w, height: CEREBRO_H.h }}
              data-tip={CEREBRO_H.ficha.hover}
              onClick={() => abrirFicha(mapa.nombre, `el modelo · ${mapa.modelo}`, CEREBRO_H.ficha)}>
        <span className="arq-cer-h">
          <span className="arq-n-t">{mapa.nombre}</span>
          <span className="arq-chip">{mapa.modelo.replace(/^claude-/, "")}</span>
        </span>
        <ul className="arq-cer-l">
          <li>Lazo <b>tool-use manual</b>: decide, ejecuta, vuelve a decidir</li>
          <li><b>No calcula</b> ni sabe SQL: elige herramienta y redacta</li>
          <li>Historial: <b>{mapa.limites.historial_mensajes}</b> mensajes · {mapa.limites.max_tokens} tokens</li>
          <li>Devuelve la <b>traza</b>: cada paso, tokens y US$</li>
        </ul>
        <span className="arq-cer-m">
          <span>herramientas</span><span>{mapa.herramientas.length}</span>
        </span>
      </button>

      {/* Herramientas, apiladas por familia */}
      {grupos.map((g) => (
        <span key={g.familia} className={`arq-grp arq-grp-${g.familia}`}
              style={{ left: COL_H.tool, top: g.yEncabezado }}>
          <i /> {FAMILIAS[g.familia]?.titulo ?? g.familia} · {g.items.length}
        </span>
      ))}
      {grupos.flatMap((g) => g.items.map((it) => (
        <Nodo key={it.h.nombre} clase={`arq-fam-${g.familia}`}
              x={COL_H.tool} y={it.y} w={ANCHO_H.tool} h={TOOL_H.h}
              titulo={it.h.nombre}
              sub={it.ficha?.resumen || it.h.descripcion.slice(0, 58) + "…"}
              tip={it.ficha?.hover || it.h.descripcion}
              onAbrir={() => onAbrir({
                titulo: it.h.nombre,
                clase: `herramienta · familia ${(FAMILIAS[g.familia]?.titulo ?? g.familia).toLowerCase()}`,
                ficha: it.ficha,
                herramienta: { ...it.h, modos: undefined },
              })}
              chip={<>
                {it.h.incrusta_confianza && (
                  <span className="arq-chip" data-tip="Su respuesta viaja con el bloque «confianza»: sobre cuántos días utilizables se calculó el número.">confianza</span>
                )}
                {!it.ficha && <span className="arq-sd">sin documentar</span>}
              </>} />
      )))}

      {/* A dónde lee cada familia */}
      {grupos.map((g) => {
        const d = DESTINO[g.familia];
        if (!d) return null;
        return (
          <button key={g.familia} className={`arq-capa arq-destino arq-dest-${g.familia}`}
                  style={{ left: COL_H.dato, top: g.panel.y, width: ANCHO_H.dato, height: PANEL.h }}
                  data-tip={d.ficha.hover}
                  onClick={() => abrirFicha(d.titulo, "datos · solo lectura", d.ficha)}>
            <span className="lbl">{d.titulo}</span>
            <span className="arq-n-s">{d.sub}</span>
            <span className="arq-dest-filas">
              {d.filas.map((f) => <span key={f} className="mono">{f}</span>)}
            </span>
          </button>
        );
      })}

      {/* El barrido: escribe el store sin pasar por el modelo */}
      {ultimo && (
        <button className="arq-nodo arq-barrido"
                style={{
                  left: COL_H.dato, top: ultimo.panel.y + PANEL.h + PANEL.gapBarrido,
                  width: ANCHO_H.dato, height: PANEL.altoBarrido,
                }}
                data-tip={BARRIDO.ficha.hover}
                onClick={() => abrirFicha(BARRIDO.titulo, "detección · por lotes", BARRIDO.ficha)}>
          <span className="arq-n-t">{BARRIDO.titulo}</span>
          <span className="arq-n-s">{BARRIDO.sub}</span>
          <span className="arq-sinllm">no pasa por el modelo</span>
        </button>
      )}
    </div>
  );
}
