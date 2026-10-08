import { etiquetaModo } from "@/app/components/console/modos";
import { CEREBRO, type Ficha } from "../catalogo";
import type { Mapa } from "../mapa";

/** El cerebro: el modelo con su lazo, su historial y el modo activo. */
export function Cerebro({ mapa, modo, abrirFicha }: {
  mapa: Mapa; modo: string; abrirFicha: (titulo: string, clase: string, ficha: Ficha) => void;
}) {
  return (
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
        <span>modo activo</span><span>{etiquetaModo(modo)}</span>
      </span>
    </button>
  );
}
