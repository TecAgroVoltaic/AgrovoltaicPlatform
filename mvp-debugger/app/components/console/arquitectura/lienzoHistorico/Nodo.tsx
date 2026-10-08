import type { ReactNode } from "react";

export function Nodo({ clase, x, y, w, h, titulo, sub, tip, onAbrir, chip }: {
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
