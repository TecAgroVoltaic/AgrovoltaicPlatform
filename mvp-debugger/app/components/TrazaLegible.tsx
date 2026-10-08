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
//     en la salida cruda, que sigue siendo la prueba final.//
// Cada clase de paso se pinta en `traza/`; acá se elige cuál y se pone el pie.
import { PasoModelo, PasoWeb } from "@/app/components/traza/PasosModeloWeb";
import { PasoTool } from "@/app/components/traza/PasoTool";
import type { Paso } from "@/app/components/traza/filas";

const MS_PER_SECOND = 1000;

export function TrazaLegible({ pasos, usage, ms, costo }: {
  pasos: Paso[]; usage?: any; ms?: number | null; costo?: number | null;
}) {
  if (!pasos?.length) return <div className="muted small">Sin pasos registrados.</div>;

  return (
    <div className="tz">
      <ol className="tz-lista">
        {pasos.map((p, i) => {
          if (p.tipo === "tool") return <PasoTool key={i} paso={p} />;
          if (p.tipo === "web") return <PasoWeb key={i} paso={p} />;
          return <PasoModelo key={i} paso={p} />;
        })}
      </ol>
      <div className="tz-pie">
        {usage && <span>{usage.input_tokens ?? "—"} tokens in · {usage.output_tokens ?? "—"} out</span>}
        {ms != null && <span>{(ms / MS_PER_SECOND).toFixed(1)} s</span>}
        {costo != null && <span>${costo.toFixed(5)}</span>}
      </div>
    </div>
  );
}
