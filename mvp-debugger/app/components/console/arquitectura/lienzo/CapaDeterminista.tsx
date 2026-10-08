import { BARRERA, CAPA, type Ficha } from "../catalogo";
import type { Mapa } from "../mapa";
import { cobertura } from "./disposicion";

const FILAS_DE_CALCULO = 2;

/** La capa determinista: cálculo, la barrera anti-fuga y la fuente de datos. */
export function CapaDeterminista({ mapa, abrirFicha }: {
  mapa: Mapa; abrirFicha: (titulo: string, clase: string, ficha: Ficha) => void;
}) {
  return (
    <div className="arq-capa" style={{ left: CAPA.x, top: CAPA.y, width: CAPA.w, height: CAPA.h }}>
      <span className="lbl">Capa determinista · Python</span>
      {CAPA.filas.slice(0, FILAS_DE_CALCULO).map((f) => (
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
      {CAPA.filas.slice(FILAS_DE_CALCULO).map((f) => (
        <button key={f.id} className="arq-fila" data-tip={f.ficha.hover}
                onClick={() => abrirFicha(f.titulo, "datos · solo lectura", {
                  ...f.ficha,
                  limites: [...cobertura(mapa.datos), ...(f.ficha.limites || [])],
                })}>
          <span className="arq-n-t">{f.titulo}</span>
          <span className="arq-n-s">{f.sub}</span>
        </button>
      ))}
    </div>
  );
}
