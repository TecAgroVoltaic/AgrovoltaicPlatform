import { ANCHO_H, COL_H, FAMILIAS, TOOL_H } from "../catalogoHistorico";
import type { Detalle } from "../NodoModal";
import type { Grupo } from "./disposicion";
import { Nodo } from "./Nodo";

const LARGO_RESUMEN = 58;
const AYUDA_CONFIANZA = "Su respuesta viaja con el bloque «confianza»: sobre cuántos días utilizables se calculó el número.";

/** Las herramientas, apiladas por familia, con el rótulo de cada grupo. */
export function HerramientasHistorico({ grupos, onAbrir }: {
  grupos: Grupo[]; onAbrir: (d: Detalle) => void;
}) {
  return (
    <>
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
              sub={it.ficha?.resumen || it.h.descripcion.slice(0, LARGO_RESUMEN) + "…"}
              tip={it.ficha?.hover || it.h.descripcion}
              onAbrir={() => onAbrir({
                titulo: it.h.nombre,
                clase: `herramienta · familia ${(FAMILIAS[g.familia]?.titulo ?? g.familia).toLowerCase()}`,
                ficha: it.ficha,
                herramienta: { ...it.h, modos: undefined },
              })}
              chip={<>
                {it.h.incrusta_confianza && (
                  <span className="arq-chip" data-tip={AYUDA_CONFIANZA}>confianza</span>
                )}
                {!it.ficha && <span className="arq-sd">sin documentar</span>}
              </>} />
      )))}
    </>
  );
}
