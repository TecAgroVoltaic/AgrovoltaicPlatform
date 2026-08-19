"use client";
// El grafo. Nodos posicionados sobre un lienzo de coordenadas fijas y aristas
// generadas en SVG a partir de esas posiciones.
//
// Los nodos que no son herramientas tienen coordenadas fijas (su lugar en el
// relato no cambia). La PILA DE HERRAMIENTAS se calcula desde lo que publica el
// servicio: si mañana aparece una sexta tool, entra sola y el lienzo crece. Por
// eso el alto no es una constante.
//
// El hover no tiene código propio: cada nodo lleva `data-tip` y lo atiende
// `ChartTooltip`, que ya está montado en la consola y funciona por delegación.
import type { ReactNode } from "react";
import type { Ficha, Grupo as GrupoNodo, NodoFijo } from "./catalogo";
import { ANCHO, BARRERA, CAPA, CEREBRO, COL, HERRAMIENTAS, LIENZO, NODOS_FIJOS, TOOL } from "./catalogo";
import type { Herramienta, Mapa } from "./mapa";
import type { Detalle } from "./NodoModal";

// Puertos de salida/entrada de las aristas troncales.
const PUERTO_CEREBRO = { x: CEREBRO.x + CEREBRO.w, y: CEREBRO.y + 125 };
const PUERTO_PUERTA = { x: COL.puerta, y: 185 };
// Fondo de todo lo que tiene posición fija. El lienzo termina justo debajo del
// contenido: sin esto quedaba una franja muerta al pie.
const FONDO_FIJO = Math.max(
  ...NODOS_FIJOS.map((n) => n.y + n.h),
  CEREBRO.y + CEREBRO.h,
  CAPA.y + CAPA.h,
);

const ROTULO: Record<GrupoNodo, string> = {
  entrada: "entrada · consola",
  puerta: "puerta de acceso",
  cerebro: "el modelo",
  servidor: "herramienta de servidor",
  dato: "fuente · solo lectura",
};

type Item = { h: Herramienta; ficha?: Ficha; y: number; centro: number; activa: boolean };
type Grupo = { modo: string; yEncabezado: number; items: Item[] };

/** Curva horizontal suave entre dos puertos. */
function curva(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(26, Math.abs(x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * Apila las herramientas por modo, en el orden que publica el servicio.
 * Una tool que estuviera en dos modos se dibuja una sola vez, en el primero que
 * la lista — no se duplica el nodo.
 */
function disponer(mapa: Mapa, modo: string): { grupos: Grupo[]; alto: number } {
  const porNombre = new Map(mapa.herramientas.map((h) => [h.nombre, h]));
  const ya = new Set<string>();
  const grupos: Grupo[] = [];
  let y = TOOL.y0;

  for (const [nombreModo, perfil] of Object.entries(mapa.modos)) {
    const tools = perfil.herramientas
      .filter((n) => !ya.has(n) && porNombre.has(n))
      .map((n) => { ya.add(n); return porNombre.get(n)!; });
    if (!tools.length) continue;
    grupos.push({
      modo: nombreModo,
      yEncabezado: y - TOOL.encabezado,
      items: tools.map((h, i) => {
        const top = y + i * (TOOL.h + TOOL.gap);
        return {
          h, ficha: HERRAMIENTAS[h.nombre], y: top, centro: top + TOOL.h / 2,
          activa: h.modos.includes(modo),
        };
      }),
    });
    y += tools.length * (TOOL.h + TOOL.gap) - TOOL.gap + TOOL.entreGrupos;
  }

  const ultimo = grupos.at(-1)?.items.at(-1);
  const fondoTools = ultimo ? ultimo.y + TOOL.h : TOOL.y0;
  return { grupos, alto: Math.max(fondoTools, FONDO_FIJO) + LIENZO.margenInferior };
}

function Nodo({ id, clase, x, y, w, h, titulo, sub, tip, activo, onAbrir, extra }: {
  id: string; clase: string; x: number; y: number; w: number; h: number;
  titulo: string; sub: string; tip: string; activo: boolean;
  onAbrir: () => void; extra?: ReactNode;
}) {
  return (
    <button
      className={`arq-nodo ${clase}` + (activo ? "" : " apagado")}
      style={{ left: x, top: y, width: w, height: h }}
      data-tip={tip}
      onClick={onAbrir}
      key={id}
    >
      <span className="arq-n-t">{titulo}</span>
      <span className="arq-n-s">{sub}</span>
      {extra}
    </button>
  );
}

export function Lienzo({ mapa, modo, onAbrir }: {
  mapa: Mapa;
  modo: string;
  onAbrir: (d: Detalle) => void;
}) {
  const { grupos, alto } = disponer(mapa, modo);
  const webActiva = mapa.web_search.modos.includes(modo);

  // ── Aristas ──────────────────────────────────────────────────────────────
  const aristas: { d: string; activa: boolean; clase?: string }[] = [];
  for (const n of NODOS_FIJOS.filter((n) => n.grupo === "entrada")) {
    aristas.push({ d: curva(n.x + n.w, n.y + n.h / 2, PUERTO_PUERTA.x, PUERTO_PUERTA.y), activa: true });
  }
  aristas.push({ d: curva(COL.puerta + ANCHO.puerta, PUERTO_PUERTA.y, CEREBRO.x, PUERTO_CEREBRO.y), activa: true });
  for (const g of grupos) {
    for (const it of g.items) {
      aristas.push({
        d: curva(PUERTO_CEREBRO.x, PUERTO_CEREBRO.y, COL.tool, it.centro),
        activa: it.activa,
      });
      aristas.push({
        d: curva(COL.tool + ANCHO.tool, it.centro, CAPA.puerto.x, CAPA.puerto.y),
        activa: it.activa,
      });
    }
  }
  aristas.push({ d: `M 432 ${CEREBRO.y + CEREBRO.h} L 432 344`, activa: webActiva, clase: "punteada" });
  aristas.push({ d: `M 1007 474 L 1007 ${CAPA.y + CAPA.h}`, activa: true });

  const abrirFicha = (titulo: string, clase: string, ficha: Ficha) =>
    onAbrir({ titulo, clase, ficha });

  return (
    <div className="arq-lienzo" style={{ height: alto }}>
      <svg className="arq-edges" viewBox={`0 0 ${LIENZO.w} ${alto}`} aria-hidden="true">
        {aristas.map((a, i) => (
          <path key={i} d={a.d}
                className={(a.clase || "") + (a.activa ? " viva" : " muerta")} />
        ))}
      </svg>

      <span className="arq-lane" style={{ left: COL.entrada }}>Entradas</span>
      <span className="arq-lane" style={{ left: COL.cerebro }}>El agente</span>
      <span className="arq-lane" style={{ left: COL.tool }}>Herramientas</span>
      <span className="arq-lane" style={{ left: COL.dato }}>Cálculo y datos</span>

      {/* Entradas, puerta, herramienta de servidor y fuente */}
      {NODOS_FIJOS.map((n: NodoFijo) => (
        <Nodo
          key={n.id} id={n.id} clase={`arq-${n.grupo}`}
          x={n.x} y={n.y} w={n.w} h={n.h}
          titulo={n.titulo} sub={n.sub} tip={n.ficha.hover}
          activo={n.id === "web_search" ? webActiva : true}
          onAbrir={() => abrirFicha(
            n.titulo,
            n.id === "web_search"
              ? `${ROTULO.servidor} · la ejecuta ${mapa.web_search.ejecutor}`
              : ROTULO[n.grupo],
            n.ficha,
          )}
        />
      ))}

      {/* El cerebro */}
      <button
        className="arq-nodo arq-cerebro"
        style={{ left: CEREBRO.x, top: CEREBRO.y, width: CEREBRO.w, height: CEREBRO.h }}
        data-tip={CEREBRO.ficha.hover}
        onClick={() => abrirFicha(mapa.agente.nombre, `el modelo · ${mapa.agente.modelo}`, CEREBRO.ficha)}
      >
        <span className="arq-cer-h">
          <span className="arq-n-t">{mapa.agente.nombre}</span>
          <span className="arq-chip">{mapa.agente.modelo.replace(/^claude-/, "")}</span>
        </span>
        <ul className="arq-cer-l">
          <li>Lazo <b>{mapa.agente.lazo}</b>: decide, ejecuta, vuelve a decidir</li>
          <li>Prompt de sistema <b>por modo</b>, cacheado</li>
          <li>Historial: <b>{mapa.limites.historial_mensajes}</b> mensajes · {mapa.limites.max_tokens} tokens</li>
          <li>Devuelve la <b>traza</b>: cada paso, tokens y US$</li>
        </ul>
        <span className="arq-cer-m">
          <span>modo activo</span><span>{modo}</span>
        </span>
      </button>

      {/* Herramientas, apiladas por modo */}
      {grupos.map((g) => (
        <span key={g.modo}
              className={`arq-grp arq-grp-${g.modo}` + (g.items.some((i) => i.activa) ? "" : " apagado")}
              style={{ left: COL.tool, top: g.yEncabezado }}>
          <i /> Modo {g.modo}
        </span>
      ))}
      {grupos.flatMap((g) => g.items.map((it) => (
        <Nodo
          key={it.h.nombre} id={it.h.nombre} clase={`arq-tool arq-tool-${g.modo}`}
          x={COL.tool} y={it.y} w={ANCHO.tool} h={TOOL.h}
          titulo={it.h.nombre}
          sub={it.ficha?.resumen || it.h.descripcion.slice(0, 64) + "…"}
          tip={it.ficha?.hover || it.h.descripcion}
          activo={it.activa}
          onAbrir={() => onAbrir({
            titulo: it.h.nombre,
            clase: `herramienta · modo ${it.h.modos.join(" y ")}`,
            ficha: it.ficha,
            herramienta: it.h,
          })}
          extra={it.ficha ? undefined : <span className="arq-sd">sin documentar</span>}
        />
      )))}

      {/* Capa determinista */}
      <div className="arq-capa" style={{ left: CAPA.x, top: CAPA.y, width: CAPA.w, height: CAPA.h }}>
        <span className="lbl">Capa determinista · Python</span>
        {CAPA.filas.slice(0, 2).map((f) => (
          <button key={f.id} className="arq-fila" data-tip={f.ficha.hover}
                  onClick={() => abrirFicha(f.titulo, "cálculo determinista", f.ficha)}>
            <span className="arq-n-t">{f.titulo}</span>
            <span className="arq-n-s">{f.sub}</span>
          </button>
        ))}
        <div className="arq-barrera">
          <span className="arq-b-t">{BARRERA.titulo}</span>
          <span className="arq-b-s">
            Toda lectura pasa por <code>get_recent_data</code>, que devuelve
            estrictamente <code>timestamp &lt; ahora</code>.
          </span>
        </div>
        {CAPA.filas.slice(2).map((f) => (
          <button key={f.id} className="arq-fila" data-tip={f.ficha.hover}
                  onClick={() => abrirFicha(f.titulo, "datos · solo lectura", f.ficha)}>
            <span className="arq-n-t">{f.titulo}</span>
            <span className="arq-n-s">{f.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}