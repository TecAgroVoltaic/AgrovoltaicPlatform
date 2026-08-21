"use client";
// «Los datos»: qué se le hizo al crudo, en once líneas.
//
// Es la contraparte de la vista de arquitectura. Aquella cuenta cómo razona el
// agente; esta, de dónde salen los números sobre los que razona.
//
// La forma es deliberada: una lista numerada, un tratamiento por renglón, en el
// mismo orden y con la misma numeración que el documento que revisó Leo Cardinale
// (P1 a P12). La versión anterior tenía tablas de antes/después y un listado de
// problemas aparte: era la misma información contada tres veces, y para leerla
// había que cruzarlas. Acá el problema y lo que se hizo van en la misma frase.
//
// Los números que quedan (26,5 MW, 10 a 80 °C) están dentro del renglón que los
// necesita, no en una tabla propia. Son de la corrida del 2026-08-10 verificada
// contra la base el 2026-08-20; el sello está a la vista porque el servicio del
// pronóstico no lee estas tablas y no puede refrescarlos.
import { useState } from "react";
import { renderMd } from "@/app/lib/markdown";
import { NodoModal, type Detalle } from "@/app/components/console/arquitectura/NodoModal";
import { LienzoDatos } from "./LienzoDatos";
import { CORRIDA, TRATAMIENTOS } from "./catalogoDatos";

const DONDE: Record<"etl" | "vista", string> = {
  etl: "al cargar",
  vista: "al consultar",
};

export function DatosView() {
  const [detalle, setDetalle] = useState<Detalle | null>(null);

  return (
    <section className="vista">
      <div className="phead">
        <h1>Los datos</h1>
        <p>
          Qué se le hizo al crudo para que la base sirva. Un punto por tratamiento,
          numerados como en el documento que revisó Leo Cardinale.
        </p>
      </div>

      <div className="card arq-marco">
        <div className="arq-scroll">
          <LienzoDatos onAbrir={setDetalle} />
        </div>
        <div className="arq-leyenda">
          <span><i style={{ background: "var(--ceil)" }} /> CSV crudos</span>
          <span><i style={{ background: "var(--accent)" }} /> etapa del pipeline</span>
          <span><i style={{ background: "var(--real)" }} /> tabla cruda</span>
          <span><i style={{ background: "var(--pred)" }} /> capa de análisis</span>
          <span className="arq-ayuda">Pasá el mouse para el resumen · hacé clic para el detalle</span>
        </div>
      </div>

      <div className="card">
        <div className="dat-cap">
          <span className="lbl">Qué se le hizo a los datos</span>
          <span className="dat-sello">
            corrida del {CORRIDA.ejecutado} · verificado contra la base el {CORRIDA.verificado}
          </span>
        </div>
        <ol className="dat-trat">
          {TRATAMIENTOS.map((t) => (
            <li key={t.n}>
              <span className="dat-n">{t.n}</span>
              <div className="dat-cuerpo">
                <span className="dat-tit">
                  {t.titulo}
                  {t.parcial && <em className="dat-parcial">parcial</em>}
                </span>
                <div className="md-plano"
                     dangerouslySetInnerHTML={{ __html: renderMd(t.que) }} />
              </div>
              <span className="dat-meta">
                <span className={"dat-donde d-" + t.donde}>{DONDE[t.donde]}</span>
                {t.leo && <span className="dat-leo">{t.leo}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="note">
        <b>«Al cargar» contra «al consultar».</b> Lo primero es irreversible y por eso hay
        muy poco: el dato original no se reconstruye. Lo segundo es una vista SQL y se
        reescribe en una tarde. Las respuestas completas de Leo y el esquema están en{" "}
        <a href="/docs#datos-pipeline">la documentación</a>.
      </p>

      <NodoModal detalle={detalle} onCerrar={() => setDetalle(null)} />
    </section>
  );
}
