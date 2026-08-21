"use client";
// El recorrido del dato, como grafo. Mismo patrón que el lienzo de arquitectura:
// nodos en coordenadas absolutas y aristas SVG generadas desde esas posiciones.
//
// A diferencia de aquel, acá NO hay pila calculada: las etapas de un ETL son las
// que son y su lugar en el relato no cambia, así que todas viven en `NODOS_DATOS`
// con posición fija. Si algún día el pipeline gana una etapa, se agrega ahí.
//
// El hover no tiene código propio: cada nodo lleva `data-tip` y lo atiende
// `ChartTooltip`, montado en la consola y funcionando por delegación.
import type { ReactNode } from "react";
import type { Ficha } from "@/app/components/console/arquitectura/catalogo";
import type { Detalle } from "@/app/components/console/arquitectura/NodoModal";
import { ANCHO_D, COL_D, LIENZO_D, NODOS_DATOS, type GrupoDato, type NodoDato } from "./catalogoDatos";

const ROTULO: Record<GrupoDato, string> = {
  fuente: "entrada · CSV crudos",
  etapa: "etapa del pipeline",
  tabla: "Supabase · dato crudo",
  vista: "Supabase · capa de análisis",
};

/** Curva horizontal suave entre dos puertos. */
function curva(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function Nodo({ clase, x, y, w, h, titulo, sub, tip, onAbrir }: {
  clase: string; x: number; y: number; w: number; h: number;
  titulo: string; sub: ReactNode; tip: string; onAbrir: () => void;
}) {
  return (
    <button className={`arq-nodo ${clase}`} data-tip={tip} onClick={onAbrir}
            style={{ left: x, top: y, width: w, height: h }}>
      <span className="arq-n-t">{titulo}</span>
      <span className="arq-n-s">{sub}</span>
    </button>
  );
}

export function LienzoDatos({ onAbrir }: { onAbrir: (d: Detalle) => void }) {
  const por = (id: string) => NODOS_DATOS.find((n) => n.id === id) as NodoDato;
  const alto = Math.max(...NODOS_DATOS.map((n) => n.y + n.h)) + LIENZO_D.margenInferior;

  // Centro vertical del carril de etapas: las cuatro cajas del pipeline están a
  // la misma altura, así que la troncal es una sola línea recta encadenada.
  const yEtapa = por("extract").y + por("extract").h / 2;
  const crudo = por("crudo");
  const vistas = por("vistas");

  const aristas: { d: string; clase?: string }[] = [
    { d: curva(COL_D.csv + ANCHO_D.csv, yEtapa, COL_D.extract, yEtapa) },
    { d: curva(COL_D.extract + ANCHO_D.etapa, yEtapa, COL_D.transform, yEtapa) },
    { d: curva(COL_D.transform + ANCHO_D.etapa, yEtapa, COL_D.load, yEtapa) },
    { d: curva(COL_D.load + ANCHO_D.etapa, yEtapa, COL_D.tabla, crudo.y + crudo.h / 2) },
    // El crudo NO se transforma para llegar a las vistas: se lee. Punteada para
    // que se vea que es una lectura y no otra escritura.
    { d: `M ${COL_D.tabla + 40} ${crudo.y + crudo.h} L ${COL_D.tabla + 40} ${vistas.y}`, clase: "punteada" },
  ];

  return (
    <div className="arq-lienzo dat-lienzo" style={{ height: alto }}>
      <svg className="arq-edges" viewBox={`0 0 ${LIENZO_D.w} ${alto}`} aria-hidden="true">
        {aristas.map((a, i) => (
          <path key={i} d={a.d} className={(a.clase || "") + " viva"} />
        ))}
      </svg>

      <span className="arq-lane" style={{ left: COL_D.csv }}>Crudo</span>
      <span className="arq-lane" style={{ left: COL_D.extract }}>El pipeline</span>
      <span className="arq-lane" style={{ left: COL_D.tabla }}>Supabase</span>

      {NODOS_DATOS.map((n) => (
        <Nodo key={n.id} clase={`dat-${n.grupo}`}
              x={n.x} y={n.y} w={n.w} h={n.h}
              titulo={n.titulo} sub={n.sub} tip={n.ficha.hover}
              onAbrir={() => onAbrir({ titulo: n.titulo, clase: ROTULO[n.grupo], ficha: n.ficha as Ficha })} />
      ))}
    </div>
  );
}
