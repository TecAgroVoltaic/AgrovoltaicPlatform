"use client";
// «Los datos»: qué se le hizo al crudo para que la base sirva para algo.
//
// Es la contraparte de la vista de arquitectura. Aquella cuenta cómo razona el
// agente; esta cuenta de dónde salen los números sobre los que razona. Sin esta
// pantalla, la limpieza de 19 meses de CSV es una afirmación sin evidencia.
//
// SOBRE LOS NÚMEROS: son un corte fechado, no una lectura viva, y la pantalla lo
// dice. El servicio del pronóstico solo lee `lecturas_ambientales_sc`; las tablas
// fotovoltaicas no pasan por él, así que ningún endpoint puede reportarlos. Antes
// que fingir que están vivos, se muestran con la fecha de la corrida al lado.
import { useState } from "react";
import { renderMd } from "@/app/lib/markdown";
import { NodoModal, type Detalle } from "@/app/components/console/arquitectura/NodoModal";
import { LienzoDatos } from "./LienzoDatos";
import { ANTES_DESPUES, CORRIDA, GANANCIAS, INCONSISTENCIAS } from "./catalogoDatos";

/**
 * Markdown para las notas de las tablas y la lista.
 *
 * Va en un `<div>` y no en un `<span>`: `renderMd` envuelve en `<p>`, y un
 * párrafo dentro de un span es anidado inválido (el parser lo expulsa y la regla
 * CSS que lo apuntaba deja de alcanzarlo). Dentro de un `<td>` un div es válido.
 */
function Md({ children }: { children: string }) {
  return <div className="md-plano" dangerouslySetInnerHTML={{ __html: renderMd(children) }} />;
}

export function DatosView() {
  const [detalle, setDetalle] = useState<Detalle | null>(null);

  return (
    <section className="vista">
      <div className="phead">
        <h1>Los datos</h1>
        <p>
          De 285 CSV con 13 esquemas distintos a una base consultable, por un proceso
          que se puede volver a correr. Hacé clic en cualquier etapa para ver qué hace
          y en qué ayuda.
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

      {/* ── La regla que explica todo el modelo ──────────────────────────── */}
      <div className="card dat-regla">
        <span className="lbl">La regla que ordena todo</span>
        <p>
          <b>El crudo se guarda tal cual; la corrección vive en una capa de análisis.</b>{" "}
          Ninguna de las cifras de la izquierda se borró: siguen en la base, exactamente
          como las midió el sensor. Lo de la derecha son columnas nuevas, calculadas en
          SQL sobre las de la izquierda.
        </p>
        <p className="hint">
          Es contraintuitivo guardar un pico de 26,5 MW a propósito, y esa es la
          discusión que se dio. Una corrección es una hipótesis, y las hipótesis se
          revisan: si el 85 °C se hubiera convertido en NULL al cargar, hoy no habría
          forma de contar cuántas veces falló el sensor. El dato original no se
          reconstruye; una vista se reescribe en una tarde.
        </p>
      </div>

      {/* ── Antes y después ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="dat-cap">
          <span className="lbl">Antes y después, medido</span>
          <span className="dat-sello">
            corrida del {CORRIDA.ejecutado} · verificado contra la base el {CORRIDA.verificado}
          </span>
        </div>
        <div className="arq-tblwrap">
          <table className="arq-tbl dat-tbl">
            <thead>
              <tr><th>Qué se mira</th><th>Crudo</th><th>Tras la capa</th><th>Por qué importa</th></tr>
            </thead>
            <tbody>
              {ANTES_DESPUES.map((f) => (
                <tr key={f.que}>
                  <td className="k">{f.que}</td>
                  <td className="dat-mal">{f.crudo}</td>
                  <td className="dat-bien">{f.corregido}</td>
                  <td><Md>{f.nota}</Md></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Lo que se ganó calibrando ────────────────────────────────────── */}
      <div className="card">
        <span className="lbl">Lo que apareció al calibrar</span>
        <p className="hint">
          Estas cuatro no tienen columna «antes» porque antes no existían: la
          irradiancia era un número sin unidad y el rendimiento no se podía calcular
          sin conocer la geometría del sistema.
        </p>
        <div className="arq-tblwrap">
          <table className="arq-tbl dat-tbl">
            <thead>
              <tr><th>Qué</th><th>Valor</th><th>Qué significa</th></tr>
            </thead>
            <tbody>
              {GANANCIAS.map((g) => (
                <tr key={g.que}>
                  <td className="k">{g.que}</td>
                  <td className="dat-bien">{g.valor}</td>
                  <td><Md>{g.nota}</Md></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Las siete inconsistencias ────────────────────────────────────── */}
      <div className="card">
        <span className="lbl">Las siete inconsistencias del crudo</span>
        <p className="hint">
          Contadas sobre los 285 archivos. Son la razón de ser de todo lo de arriba.
        </p>
        <ul className="dat-inc">
          {INCONSISTENCIAS.map((i) => (
            <li key={i.n}>
              <span className="dat-n">{i.n}</span>
              <div>
                <b>{i.que}</b>
                <Md>{i.evidencia}</Md>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="note">
        <b>Lo que falta.</b> La separación fina de las filas mezcladas (inconsistencia 2)
        sigue pendiente: hoy esas filas se saltan y se acepta el hueco, en vez de
        recuperar el dato remapeando las columnas. El detalle del pipeline, el esquema
        completo y las decisiones de datos están en{" "}
        <a href="/docs#datos-pipeline">la documentación</a>.
      </p>

      <NodoModal detalle={detalle} onCerrar={() => setDetalle(null)} />
    </section>
  );
}
