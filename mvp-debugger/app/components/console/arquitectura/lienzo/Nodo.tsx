import type { ReactNode } from "react";

export function Nodo({ id, clase, x, y, w, h, titulo, sub, tip, activo, onAbrir, extra }: {
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
