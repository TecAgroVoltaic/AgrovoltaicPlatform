"use client";
// Traza del agente en cristiano: qué decidió, qué algoritmo corrió, con qué
// entrada y qué le devolvió.
//
// Por qué existe: la traza era `JSON.stringify(pasos, null, 2)`. Eso sirve para
// depurar un bug, no para lo que la traza tiene que demostrar acá: que el
// número que ves salió de un algoritmo determinista y no de la cabeza del
// modelo. Si para verificarlo hay que leer 200 líneas de JSON, nadie lo
// verifica.
//
// Dos decisiones de diseño:
//  1. Cada paso lleva ICONO propio, porque lo que hay que distinguir de un
//     vistazo es QUIÉN actuó: el algoritmo, el modelo o la web.
//  2. La salida del algoritmo se muestra por RELEVANCIA, no completa. Volcar los
//     doce campos (incluidos los que solo repiten la entrada) es exactamente lo
//     que hacía la traza vieja, con más pasos. Lo que no entra queda a un click
//     en la salida cruda, que sigue siendo la prueba final.
import { useState } from "react";
import { Json } from "@/app/components/Json";
import {
  IconoAlgoritmo, IconoError, IconoModelo, IconoTexto, IconoWeb,
} from "@/app/components/Iconos";

type Paso = any;

const NUM = /^[+-]?\d+([.,]\d+)?$/;

// Campos que valen la pena de la salida de una herramienta, en orden. El resto
// (los que repiten la entrada, la nota larga) va a la salida cruda.
const DESTACADOS = [
  "punto_consultado", "valor_esperado", "banda", "medido", "ancla",
  "estado", "resumen", "metricas", "contexto", "anomalias", "n",
];

/** Un valor suelto, corto y legible. Los arreglos no se vuelcan: se cuentan. */
function valorCorto(v: any): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "elemento" : "elementos"}`;
  if (typeof v === "object") return `${Object.keys(v).length} campos`;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  const s = String(v);
  return s.length > 110 ? s.slice(0, 110) + "…" : s;
}

/** Objeto chico y plano -> "k v · k v". Es lo que hace legible `metricas`. */
function objetoEnLinea(o: Record<string, any>): string | null {
  const claves = Object.keys(o);
  if (!claves.length || claves.length > 6) return null;
  if (claves.some((k) => o[k] !== null && typeof o[k] === "object")) return null;
  return claves.map((k) => `${k} ${valorCorto(o[k])}`).join(" · ");
}

/**
 * Filas (etiqueta, valor) de un dict. Los objetos anidados se ABREN un nivel
 * (`resumen.maximo_real`): justo esos campos son los que uno quiere cotejar
 * contra la pantalla.
 */
function filas(obj: any, prefijo = ""): [string, string][] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object" || Array.isArray(obj)) return [[prefijo, valorCorto(obj)]];
  const salida: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_grafico") continue;             // el gráfico se pinta, no se lista
    const clave = prefijo ? `${prefijo}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const enLinea = objetoEnLinea(v as any);
      if (enLinea) { salida.push([clave, enLinea]); continue; }
      if (!prefijo) { salida.push(...filas(v, clave)); continue; }
      salida.push([clave, valorCorto(v)]);
      continue;
    }
    salida.push([clave, valorCorto(v)]);
  }
  return salida;
}

/** Solo los campos que aportan, en el orden en que se quieren leer. */
function filasDestacadas(salida: any): { filas: [string, string][]; ocultos: number } {
  if (!salida || typeof salida !== "object" || Array.isArray(salida)) {
    return { filas: filas(salida), ocultos: 0 };
  }
  const claves = Object.keys(salida).filter((k) => k !== "_grafico");
  const elegidas = DESTACADOS.filter((k) => k in salida && salida[k] !== null);
  if (!elegidas.length) return { filas: filas(salida), ocultos: 0 };
  const sub: Record<string, any> = {};
  for (const k of elegidas) sub[k] = salida[k];
  return { filas: filas(sub), ocultos: claves.length - elegidas.length };
}

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

function PasoTool({ paso }: { paso: Paso }) {
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

export function TrazaLegible({ pasos, usage, ms, costo }: {
  pasos: Paso[]; usage?: any; ms?: number | null; costo?: number | null;
}) {
  if (!pasos?.length) return <div className="muted small">Sin pasos registrados.</div>;

  return (
    <div className="tz">
      <ol className="tz-lista">
        {pasos.map((p, i) => {
          if (p.tipo === "tool") return <PasoTool key={i} paso={p} />;
          if (p.tipo === "web") {
            return (
              <li className="tz-paso" key={i}>
                <span className="tz-badge tz-badge-web"><IconoWeb size={14} /></span>
                <div className="tz-cuerpo">
                  <div className="tz-cab"><span className="tz-tipo">Buscó en la web</span></div>
                  <div className="tz-texto">«{p.query}»</div>
                </div>
              </li>
            );
          }
          // Paso del modelo: o pide una herramienta, o redacta la respuesta.
          const pide = (p.solicita || []).map((s: any) => s.nombre);
          const redacta = !pide.length;
          return (
            <li className="tz-paso" key={i}>
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
                {p.texto && (
                  <div className="tz-texto">
                    {p.texto.length > 200 ? p.texto.slice(0, 200) + "…" : p.texto}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="tz-pie">
        {usage && <span>{usage.input_tokens ?? "—"} tokens in · {usage.output_tokens ?? "—"} out</span>}
        {ms != null && <span>{(ms / 1000).toFixed(1)} s</span>}
        {costo != null && <span>${costo.toFixed(5)}</span>}
      </div>
    </div>
  );
}
