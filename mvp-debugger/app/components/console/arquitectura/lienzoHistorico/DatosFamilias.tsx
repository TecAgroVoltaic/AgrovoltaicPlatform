import { ANCHO_H, BARRIDO, COL_H, DESTINO } from "../catalogoHistorico";
import type { Ficha } from "../catalogo";
import { PANEL, type Grupo } from "./disposicion";

/** A dónde lee cada familia, y el barrido que escribe el store sin pasar por el modelo. */
export function DatosFamilias({ grupos, abrirFicha }: {
  grupos: Grupo[]; abrirFicha: (titulo: string, clase: string, ficha: Ficha) => void;
}) {
  const ultimo = grupos.at(-1);
  return (
    <>
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
    </>
  );
}
