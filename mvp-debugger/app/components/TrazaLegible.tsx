"use client";
// Traza del agente en cristiano: qué decidió, qué herramienta corrió, con qué
// entrada y qué le devolvió.
//
// Por qué existe: la traza era `JSON.stringify(pasos, null, 2)`. Eso sirve para
// depurar un bug, no para lo que la traza tiene que demostrar acá — que el
// número que ves salió de una consulta a los datos y no de la cabeza del modelo.
// Si para verificarlo hay que leer 200 líneas de JSON, nadie lo verifica.
//
// El JSON crudo NO se elimina: queda un turno de distancia, por paso. Es un
// debugger; la salida cruda es la prueba final cuando algo no cuadra.
import { useState } from "react";
import { Json } from "@/app/components/Json";

type Paso = any;

const NUM = /^-?\d+(\.\d+)?$/;

/** Un valor suelto, corto y legible. Los arreglos no se vuelcan: se cuentan. */
function valorCorto(v: any): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "elemento" : "elementos"}`;
  if (typeof v === "object") return `${Object.keys(v).length} campos`;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  const s = String(v);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

/** Objeto chico y plano -> "k v · k v". Es lo que hace legible `metricas`. */
function objetoEnLinea(o: Record<string, any>): string | null {
  const claves = Object.keys(o);
  if (!claves.length || claves.length > 6) return null;
  if (claves.some((k) => o[k] !== null && typeof o[k] === "object")) return null;
  return claves.map((k) => `${k} ${valorCorto(o[k])}`).join(" · ");
}

/**
 * Filas (etiqueta, valor) de un dict de entrada o de salida.
 *
 * Los objetos anidados se ABREN un nivel (`resumen.maximo_real`) en vez de
 * resumirse a "2 campos": justo esos campos —el máximo del día, el punto
 * consultado— son los que uno quiere cotejar contra la pantalla.
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
      // Anidado de verdad: se abre un nivel más y ahí se corta.
      if (!prefijo) { salida.push(...filas(v, clave)); continue; }
      salida.push([clave, valorCorto(v)]);
      continue;
    }
    salida.push([clave, valorCorto(v)]);
  }
  return salida;
}

function Detalle({ titulo, obj }: { titulo: string; obj: any }) {
  const f = filas(obj);
  if (!f.length) return null;
  return (
    <div className="tz-det">
      <span className="tz-det-h">{titulo}</span>
      <div className="tz-kv">
        {f.map(([k, v], i) => (
          <div className="tz-kv-row" key={i}>
            {k && <span className="tz-k">{k}</span>}
            <span className={"tz-v" + (NUM.test(v) ? " tz-num" : "")}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PasoTool({ paso }: { paso: Paso }) {
  const [crudo, setCrudo] = useState(false);
  return (
    <li className="tz-paso">
      <span className="tz-punto tz-punto-tool" />
      <div className="tz-cuerpo">
        <div className="tz-cab">
          <span className="tz-tipo">Consultó los datos</span>
          <code className="tz-tool">{paso.nombre}</code>
          {paso.ms != null && <span className="tz-ms">{paso.ms} ms</span>}
          {paso.error && <span className="badge-err">falló</span>}
        </div>
        {paso.error ? (
          <div className="tz-error">{String(paso.salida)}</div>
        ) : (
          <>
            <Detalle titulo="le pidió" obj={paso.input} />
            <Detalle titulo="le devolvió" obj={paso.salida} />
            <button className="btn-sm tz-crudo" onClick={() => setCrudo((c) => !c)}>
              {crudo ? "ocultar salida cruda" : "ver salida cruda"}
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
                <span className="tz-punto tz-punto-web" />
                <div className="tz-cuerpo">
                  <div className="tz-cab"><span className="tz-tipo">Buscó en la web</span></div>
                  <div className="tz-texto">«{p.query}»</div>
                </div>
              </li>
            );
          }
          // Paso del modelo: o pide una herramienta, o redacta.
          const pide = (p.solicita || []).map((s: any) => s.nombre);
          return (
            <li className="tz-paso" key={i}>
              <span className="tz-punto tz-punto-modelo" />
              <div className="tz-cuerpo">
                <div className="tz-cab">
                  <span className="tz-tipo">
                    {pide.length ? "Decidió qué consultar" : "Redactó la respuesta"}
                  </span>
                  {pide.map((n: string) => <code className="tz-tool" key={n}>{n}</code>)}
                </div>
                {p.texto && <div className="tz-texto">{p.texto.length > 220 ? p.texto.slice(0, 220) + "…" : p.texto}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="tz-pie">
        {usage && <span>{usage.input_tokens ?? "—"} tokens de entrada · {usage.output_tokens ?? "—"} de salida</span>}
        {ms != null && <span>{(ms / 1000).toFixed(1)} s</span>}
        {costo != null && <span>${costo.toFixed(5)}</span>}
      </div>
    </div>
  );
}
