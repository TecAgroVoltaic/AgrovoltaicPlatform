"use client";
// Un paso en que corrió el algoritmo: sus parámetros, lo que devolvió por
// relevancia y, a un click, la salida cruda.
import { useState } from "react";
import { Json } from "@/app/components/Json";
import { IconoAlgoritmo, IconoError } from "@/app/components/Iconos";

import { filas, filasDestacadas, NUM, type Paso } from "./filas";

function Chips({ obj }: { obj: any }) {
  const f = filas(obj);
  if (!f.length) return null;
  return (
    <div className="tz-chips">
      {f.map(([k, v], i) => (
        <span className="tz-chip" key={i}>
          {k && <b>{k}</b>}
          {v}
        </span>
      ))}
    </div>
  );
}

export function PasoTool({ paso }: { paso: Paso }) {
  const [crudo, setCrudo] = useState(false);
  const { filas: destacadas, ocultos } = filasDestacadas(paso.salida);
  const metodo = paso.salida && typeof paso.salida === "object" ? paso.salida.metodo : null;

  return (
    <li className="tz-paso">
      <span className={"tz-badge" + (paso.error ? " tz-badge-err" : " tz-badge-tool")}>
        {paso.error ? <IconoError size={14} /> : <IconoAlgoritmo size={14} />}
      </span>
      <div className="tz-cuerpo">
        <div className="tz-cab">
          <span className="tz-tipo">{paso.error ? "El algoritmo falló" : "Ejecutó el algoritmo"}</span>
          <code className="tz-tool">{paso.nombre}</code>
          {paso.ms != null && <span className="tz-ms">{paso.ms} ms</span>}
        </div>
        {metodo && <div className="tz-metodo">{metodo}</div>}

        {paso.error ? (
          <div className="tz-error">{String(paso.salida)}</div>
        ) : (
          <>
            <div className="tz-det">
              <span className="tz-det-h">parámetros</span>
              <Chips obj={paso.input} />
            </div>
            <div className="tz-det">
              <span className="tz-det-h">devolvió</span>
              <div className="tz-kv">
                {destacadas.map(([k, v], i) => (
                  <div className="tz-kv-row" key={i}>
                    {k && <span className="tz-k">{k}</span>}
                    <span className={"tz-v" + (NUM.test(v) ? " tz-num" : "")}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-sm tz-crudo" onClick={() => setCrudo((c) => !c)}>
              {crudo ? "ocultar salida completa" : `ver salida completa${ocultos ? ` (+${ocultos} campos)` : ""}`}
            </button>
            {crudo && <Json value={paso.salida} />}
          </>
        )}
      </div>
    </li>
  );
}
