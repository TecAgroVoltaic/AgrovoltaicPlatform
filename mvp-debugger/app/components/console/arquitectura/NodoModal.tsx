"use client";
// Detalle de un nodo: qué hace, qué recibe, qué devuelve, qué límites tiene y
// cómo se prueba.
//
// La tabla «qué recibe» NO está escrita acá: se deriva del `input_schema` que el
// servicio publica, que es el mismo objeto que ve el modelo. Si un rango cambia
// en Python, cambia en este modal sin que nadie lo toque.
//
// La prosa viene del catálogo y se pinta con `renderMd`, que escapa el HTML
// antes de formatear.
import { useEffect, useRef } from "react";
import { renderMd } from "@/app/lib/markdown";
import { IconoAlerta } from "@/app/components/Iconos";
import type { Ficha } from "./catalogo";
import { parametros, type Herramienta } from "./mapa";

export type Detalle = {
  titulo: string;
  clase: string;                 // «herramienta · modo predicción», etc.
  ficha?: Ficha;
  herramienta?: Herramienta;     // si el nodo es una tool, su contrato real
};

function Lista({ titulo, items }: { titulo: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section>
      <span className="lbl">{titulo}</span>
      <ul className="arq-li">
        {items.map((x, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: renderMd(x) }} />
        ))}
      </ul>
    </section>
  );
}

export function NodoModal({ detalle, onCerrar }: {
  detalle: Detalle | null;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (detalle && !d.open) d.showModal();
    if (!detalle && d.open) d.close();
  }, [detalle]);

  if (!detalle) return <dialog className="arq-modal" ref={ref} onClose={onCerrar} />;

  const { ficha, herramienta } = detalle;
  const params = parametros(herramienta?.input_schema);

  return (
    <dialog
      className="arq-modal"
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => { if (e.target === ref.current) onCerrar(); }}
    >
      <div className="arq-m-head">
        <div>
          <h3>{detalle.titulo}</h3>
          <span className="arq-m-kind">{detalle.clase}</span>
        </div>
        <button className="arq-m-x" onClick={onCerrar} aria-label="Cerrar">✕</button>
      </div>

      <div className="arq-m-body">
        {ficha ? (
          <>
            <section>
              <span className="lbl">Qué hace</span>
              <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(ficha.hace) }} />
            </section>
            {/* La pregunta que ningún esquema contesta: qué sería peor sin esta
                pieza. Va arriba de todo el detalle técnico porque es lo primero
                que alguien necesita para entender por qué existe. */}
            {ficha.ayuda && (
              <section className="arq-porque">
                <span className="lbl">En qué ayuda</span>
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(ficha.ayuda) }} />
              </section>
            )}
          </>
        ) : (
          <section className="arq-sindoc">
            <IconoAlerta size={15} />
            <div>
              <b>Sin documentar en la consola.</b> Esta herramienta existe en el servicio
              pero no tiene ficha en el catálogo de la vista. Abajo está su contrato real,
              tal como lo ve el modelo.
            </div>
          </section>
        )}

        {herramienta?.descripcion && (
          <section>
            <span className="lbl">Lo que ve el modelo</span>
            <p className="arq-desc">{herramienta.descripcion}</p>
          </section>
        )}

        {params.length > 0 && (
          <section>
            <span className="lbl">Qué recibe</span>
            <div className="arq-tblwrap">
              <table className="arq-tbl">
                <thead>
                  <tr><th>Parámetro</th><th>Tipo</th><th>Oblig.</th><th>Rango / detalle</th></tr>
                </thead>
                <tbody>
                  {params.map((p) => (
                    <tr key={p.nombre}>
                      <td className="k">{p.nombre}</td>
                      <td>{p.tipo}</td>
                      <td className={"req " + (p.obligatorio ? "si" : "no")}>
                        {p.obligatorio ? "sí" : "no"}
                      </td>
                      <td dangerouslySetInnerHTML={{ __html: renderMd(p.detalle) }} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <Lista titulo="Qué devuelve" items={ficha?.devuelve} />
        <Lista titulo="Puntos clave" items={ficha?.puntos} />
        <Lista titulo="Límites" items={ficha?.limites} />
        <Lista titulo="Cómo se prueba" items={ficha?.pruebas} />

        {ficha?.archivo && <span className="arq-m-file">{ficha.archivo}</span>}
      </div>
    </dialog>
  );
}
