import { CEREBRO_H } from "../catalogoHistorico";
import type { Ficha } from "../catalogo";
import type { MapaHistorico } from "../mapaHistorico";

/** El modelo del Histórico: orquesta y redacta, no calcula. */
export function CerebroHistorico({ mapa, abrirFicha }: {
  mapa: MapaHistorico; abrirFicha: (titulo: string, clase: string, ficha: Ficha) => void;
}) {
  return (
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
  );
}
