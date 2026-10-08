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
//
// La disposición y las aristas viven en `lienzo/disposicion.ts`; el cerebro y
// la capa determinista son componentes propios.
import type { Ficha, NodoFijo } from "./catalogo";
import { ANCHO, COL, LIENZO, NODOS_FIJOS, TOOL } from "./catalogo";
import type { Mapa } from "./mapa";
import type { Detalle } from "./NodoModal";
import { etiquetaModo } from "@/app/components/console/modos";
import { CapaDeterminista } from "./lienzo/CapaDeterminista";
import { Cerebro } from "./lienzo/Cerebro";
import { aristasDe, disponer, ROTULO } from "./lienzo/disposicion";
import { Nodo } from "./lienzo/Nodo";

const LARGO_RESUMEN = 64;

export function Lienzo({ mapa, modo, onAbrir }: {
  mapa: Mapa;
  modo: string;
  onAbrir: (d: Detalle) => void;
}) {
  const { grupos, alto } = disponer(mapa, modo);
  const webActiva = mapa.web_search.modos.includes(modo);
  const aristas = aristasDe(grupos, webActiva);

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

      <Cerebro mapa={mapa} modo={modo} abrirFicha={abrirFicha} />

      {/* Herramientas, apiladas por modo */}
      {grupos.map((g) => (
        <span key={g.modo}
              className={`arq-grp arq-grp-${g.modo}` + (g.items.some((i) => i.activa) ? "" : " apagado")}
              style={{ left: COL.tool, top: g.yEncabezado }}>
          <i /> Modo {etiquetaModo(g.modo)}
        </span>
      ))}
      {grupos.flatMap((g) => g.items.map((it) => (
        <Nodo
          key={it.h.nombre} id={it.h.nombre} clase={`arq-tool arq-tool-${g.modo}`}
          x={COL.tool} y={it.y} w={ANCHO.tool} h={TOOL.h}
          titulo={it.h.nombre}
          sub={it.ficha?.resumen || it.h.descripcion.slice(0, LARGO_RESUMEN) + "…"}
          tip={it.ficha?.hover || it.h.descripcion}
          activo={it.activa}
          onAbrir={() => onAbrir({
            titulo: it.h.nombre,
            clase: `herramienta · modo ${(it.h.modos ?? []).map(etiquetaModo).join(" y ")}`,
            ficha: it.ficha,
            herramienta: it.h,
          })}
          extra={it.ficha ? undefined : <span className="arq-sd">sin documentar</span>}
        />
      )))}

      <CapaDeterminista mapa={mapa} abrirFicha={abrirFicha} />
    </div>
  );
}