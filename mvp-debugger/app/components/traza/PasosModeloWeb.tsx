// Los pasos que no son el algoritmo: una búsqueda en la web, o el modelo
// pidiendo una herramienta o redactando la respuesta.
import { IconoModelo, IconoTexto, IconoWeb } from "@/app/components/Iconos";

import type { Paso } from "./filas";

const TEXTO_MAX = 200;

export function PasoWeb({ paso }: { paso: Paso }) {
  return (
    <li className="tz-paso">
      <span className="tz-badge tz-badge-web"><IconoWeb size={14} /></span>
      <div className="tz-cuerpo">
        <div className="tz-cab"><span className="tz-tipo">Buscó en la web</span></div>
        <div className="tz-texto">«{paso.query}»</div>
      </div>
    </li>
  );
}

/** Paso del modelo: o pide una herramienta, o redacta la respuesta. */
export function PasoModelo({ paso }: { paso: Paso }) {
  const pide = (paso.solicita || []).map((s: any) => s.nombre);
  const redacta = !pide.length;
  return (
    <li className="tz-paso">
      <span className={"tz-badge " + (redacta ? "tz-badge-texto" : "tz-badge-modelo")}>
        {redacta ? <IconoTexto size={14} /> : <IconoModelo size={14} />}
      </span>
      <div className="tz-cuerpo">
        <div className="tz-cab">
          <span className="tz-tipo">
            {redacta ? "Redactó la respuesta" : "Eligió qué algoritmo usar"}
          </span>
          {pide.map((n: string) => <code className="tz-tool" key={n}>{n}</code>)}
        </div>
        {paso.texto && (
          <div className="tz-texto">
            {paso.texto.length > TEXTO_MAX ? paso.texto.slice(0, TEXTO_MAX) + "…" : paso.texto}
          </div>
        )}
      </div>
    </li>
  );
}
