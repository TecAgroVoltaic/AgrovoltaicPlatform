"use client";
// El recorrido del dato, en cinco actos.
//
// La versión anterior dibujaba `extract → transform → load`: los nombres de los
// módulos. Se veía prolijo y no explicaba nada, porque quien no escribió el
// pipeline no sabe qué hace un módulo llamado «transform».
//
// Este dibuja EL DATO. Cada acto muestra cómo se ve en ese punto, con los valores
// reales que están en la base, más el gesto que se le aplica y por qué. Y la
// línea del medio es el protagonista: parte el recorrido entre lo que se decide
// al cargar (irreversible) y lo que se decide al consultar (reescribible). Esa
// línea es la decisión de diseño del modelo, así que se dibuja en vez de
// contarse.
//
// El hover no tiene código propio: cada acto lleva `data-tip` y lo atiende
// `ChartTooltip`, montado en la consola y funcionando por delegación.
import type { Detalle } from "@/app/components/console/arquitectura/NodoModal";
import { ACTO, ACTOS, LIENZO_D, ZONAS, type Acto, type Muestra } from "./catalogoDatos";

/** La muestra del dato. Es el corazón del dibujo: sin esto sería otro diagrama de cajas. */
function VerMuestra({ m }: { m: Muestra }) {
  if (m.tipo === "archivos") {
    return (
      <span className="dat-m dat-m-arch">
        {m.filas.map(([archivo, header]) => (
          <span key={archivo}>
            <i>{archivo}</i>
            <b>{header}</b>
          </span>
        ))}
        <em>la misma variable, tres nombres</em>
      </span>
    );
  }
  if (m.tipo === "convergencia") {
    return (
      <span className="dat-m dat-m-conv">
        <span className="dat-conv-in">
          {m.desde.map((d) => <b key={d}>{d}</b>)}
        </span>
        <span className="dat-conv-llave" aria-hidden="true" />
        <span className="dat-conv-out">{m.hasta}</span>
      </span>
    );
  }
  return (
    <span className={"dat-m dat-m-val e-" + m.estado}>
      {m.encabezado && <em>{m.encabezado}</em>}
      {m.filas.map(([campo, valor]) => (
        <span key={campo}>
          <i>{campo}</i>
          <b>{valor}</b>
        </span>
      ))}
    </span>
  );
}

export function LienzoDatos({ onAbrir }: { onAbrir: (d: Detalle) => void }) {
  const yCentro = ACTO.y + ACTO.h / 2;

  // Flechas entre actos consecutivos DE LA MISMA zona. El salto entre zonas no
  // lleva flecha: ahí va la línea divisoria, y una flecha atravesándola diría
  // justo lo contrario de lo que el dibujo tiene que enseñar.
  const flechas = ACTOS.slice(0, -1)
    .map((a, i) => ({ a, b: ACTOS[i + 1] }))
    .filter(({ a, b }) => a.zona === b.zona)
    .map(({ a }) => a.x + ACTO.w);

  return (
    <div className="arq-lienzo dat-lienzo" style={{ height: LIENZO_D.alto }}>
      {/* Las dos zonas: el rótulo dice por qué la línea está donde está. */}
      {ZONAS.map((z) => (
        <span key={z.id} className={"dat-zona z-" + z.id} style={{ left: z.x, width: z.w }}>
          <b>{z.titulo}</b>
          <i>{z.nota}</i>
        </span>
      ))}

      {/* La línea. Es lo único del lienzo que no es un paso: es la regla. */}
      <span className="dat-divisor" style={{ left: ACTO.divisor, top: 6, height: LIENZO_D.alto - 24 }}>
        <em>acá termina lo irreversible</em>
      </span>

      <svg className="arq-edges" viewBox={`0 0 ${LIENZO_D.w} ${LIENZO_D.alto}`} aria-hidden="true">
        {flechas.map((x) => (
          <g key={x} className="dat-flecha">
            <path d={`M ${x + 3} ${yCentro} L ${x + 13} ${yCentro}`} />
            <path d={`M ${x + 9} ${yCentro - 4} L ${x + 14} ${yCentro} L ${x + 9} ${yCentro + 4}`} />
          </g>
        ))}
      </svg>

      {ACTOS.map((a: Acto) => (
        <button key={a.id} className={"dat-acto z-" + a.zona} data-tip={a.ficha.hover}
                style={{ left: a.x, top: ACTO.y, width: ACTO.w, minHeight: ACTO.h }}
                onClick={() => onAbrir({
                  titulo: a.titulo,
                  clase: `paso ${a.n} de ${ACTOS.length} · ${a.zona === "cargar" ? "al cargar" : "al consultar"}`,
                  ficha: a.ficha,
                })}>
          <span className="dat-acto-h">
            <span className="dat-paso">{a.n}</span>
            <span className="dat-acto-t">{a.titulo}</span>
          </span>
          <span className="dat-gesto">{a.gesto}</span>
          <VerMuestra m={a.muestra} />
          <span className="dat-porque">{a.porque}</span>
        </button>
      ))}
    </div>
  );
}
