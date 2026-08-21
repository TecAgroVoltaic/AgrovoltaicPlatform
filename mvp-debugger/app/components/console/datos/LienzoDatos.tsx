"use client";
// El recorrido del dato, en cinco actos.
//
// Dos versiones anteriores y qué falló en cada una:
//
//   1ª — dibujaba `extract → transform → load`: los nombres de los MÓDULOS. Se
//        veía prolijo y no explicaba nada, porque quien no escribió el pipeline
//        no sabe qué hace algo llamado «transform».
//   2ª — ya mostraba el dato, pero en coordenadas absolutas sobre un lienzo de
//        1140 px FIJOS. En una pantalla ancha sobraba espacio a los lados; en
//        una angosta había que arrastrar para leer.
//
// Esta reparte el ancho con flex: cada zona recibe una fracción proporcional a
// cuántos actos tiene, así las cinco cajas salen del mismo ancho sin que nadie
// lo declare, y el conjunto ocupa lo que haya. Cuando ya no entran, las zonas se
// apilan y la línea divisoria se vuelve horizontal, sin perder lo que enseña.
//
// El hover no tiene código propio: cada acto lleva `data-tip` y lo atiende
// `ChartTooltip`, montado en la consola y funcionando por delegación.
import type { Detalle } from "@/app/components/console/arquitectura/NodoModal";
import { ACTOS, ZONAS, type Acto, type Muestra } from "./catalogoDatos";

/** La muestra del dato. Es el corazón del dibujo: sin esto sería otro diagrama de cajas. */
function VerMuestra({ m }: { m: Muestra }) {
  if (m.tipo === "archivos") {
    return (
      <span className="dat-m dat-m-arch">
        {m.filas.map(([cuando, header]) => (
          <span key={cuando}>
            <i>{cuando}</i>
            <b>{header}</b>
          </span>
        ))}
        <em>la misma variable, tres nombres</em>
      </span>
    );
  }
  if (m.tipo === "convergencia") {
    // Apilado y centrado, NO con una llave lateral: la llave obligaba a recortar
    // los nombres para que entraran al lado, y con el ancho fluido el resultado
    // terminaba encima de la entrada. Un nombre recortado es justo el dato que
    // este paso tiene que dejar leer.
    return (
      <span className="dat-m dat-m-conv">
        {m.desde.map((d) => <i key={d}>{d}</i>)}
        <span className="dat-conv-baja" aria-hidden="true" />
        <b>{m.hasta}</b>
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

function Paso({ a, ultimo, onAbrir }: {
  a: Acto; ultimo: boolean; onAbrir: (d: Detalle) => void;
}) {
  return (
    <button className={"dat-acto z-" + a.zona} data-tip={a.ficha.hover}
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
      {/* La flecha solo entre actos de la MISMA zona. El salto entre zonas lo
          marca la línea, y una flecha cruzándola diría lo contrario de lo que
          el dibujo tiene que enseñar. */}
      {!ultimo && <span className="dat-flecha" aria-hidden="true" />}
    </button>
  );
}

export function LienzoDatos({ onAbrir }: { onAbrir: (d: Detalle) => void }) {
  return (
    <div className="dat-flujo">
      {ZONAS.map((z, iz) => {
        const suyos = ACTOS.filter((a) => a.zona === z.id);
        return (
          <div key={z.id} className="dat-tramo" style={{ flexGrow: suyos.length }}>
            {/* La línea. No es un paso: es la regla que ordena el modelo. */}
            {iz > 0 && (
              <span className="dat-divisor">
                <em>acá termina lo irreversible</em>
              </span>
            )}
            <div className={"dat-zona z-" + z.id}>
              <b>{z.titulo}</b>
              <i>{z.nota}</i>
              <div className="dat-pasos">
                {suyos.map((a, i) => (
                  <Paso key={a.id} a={a} ultimo={i === suyos.length - 1} onAbrir={onAbrir} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
