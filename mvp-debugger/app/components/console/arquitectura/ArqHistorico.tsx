"use client";
// Arquitectura del Agente Histórico.
//
// Es una vista APARTE de la del Predictivo, no una opción de la misma, porque los
// dos agentes no están organizados igual y dibujarlos con la misma plantilla
// obligaría a mentir sobre uno de los dos. El Predictivo se explica por MODOS: su
// garantía es que la herramienta que revela la respuesta NO ESTÁ en la lista. El
// Histórico se explica por la CADENA: la detección corre por lotes, fuera del
// agente, y deja un store; las herramientas solo leen ese store, con un pool que
// no puede escribir. El LLM entra al final y nunca toca un número.
//
// Como el otro mapa, acá no se declara la estructura: se pide a
// `GET /historico/arquitectura`, que la deriva de `tools.SCHEMAS` y de los propios
// módulos. La prosa del «por qué» vive en `catalogoHistorico.ts`, y cuando el
// catálogo y el servicio se separan, la vista lo dice en pantalla.
import { useEffect, useState } from "react";

import { jget, mensajeError } from "@/app/lib/client";
import { IconoAlerta } from "@/app/components/Iconos";
import { Estado } from "@/app/components/console/Estado";
import { FAMILIAS, HERRAMIENTAS_HISTORICO } from "./catalogoHistorico";
import { NodoModal, type Detalle } from "./NodoModal";
import { RESPALDO_HISTORICO } from "./respaldoHistorico";
import {
  esMapaHistorico, familiasOrdenadas, valorUmbral,
  type HerramientaHist, type MapaHistorico,
} from "./mapaHistorico";

const RUTA = "/api/historico/arquitectura";

export function ArqHistorico() {
  const [mapa, setMapa] = useState<MapaHistorico | null>(null);
  const [esRespaldo, setEsRespaldo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    jget<MapaHistorico>(RUTA).then((r) => {
      if (!vivo) return;
      // El mapa describe la FORMA del agente, no datos medidos: no cambia con la
      // hora. Si el servicio no está (el servidor se apaga de noche), se dibuja la
      // copia. Pero solo si de verdad es el mapa de ESTE agente: `esMapaHistorico`
      // está para que un JSON de otra forma nunca se cuele con este rótulo.
      if (esMapaHistorico(r.data)) {
        setMapa(r.data);
        setEsRespaldo(false);
      } else if (esMapaHistorico(RESPALDO_HISTORICO)) {
        setMapa(RESPALDO_HISTORICO);
        setEsRespaldo(true);
      } else {
        setError(mensajeError(r));
      }
    });
    return () => { vivo = false; };
  }, []);

  if (error) {
    return (
      <section className="vista">
        <div className="phead"><h1>Arquitectura del Agente Histórico</h1></div>
        <div className="card"><Estado error={error} que="el mapa del agente" /></div>
      </section>
    );
  }
  if (!mapa) {
    return (
      <section className="vista">
        <div className="phead">
          <h1>Arquitectura del Agente Histórico</h1>
          <p>Leyendo el mapa del servicio…</p>
        </div>
      </section>
    );
  }

  return <PanelHistorico mapa={mapa} esRespaldo={esRespaldo} />;
}

/** El render, sin fetch ni estado de red.
 *
 * Separado del componente de arriba para que se pueda RENDERIZAR con un mapa real
 * en `scripts/verificar-vistas.mjs`: el efecto que trae los datos no corre en un
 * render estático, así que si el cuerpo viviera dentro del shell, lo único
 * verificable sería la pantalla de «cargando». No hay navegador con el que mirar
 * esta consola, así que lo que no se puede renderizar en la verificación se
 * termina construyendo a ciegas.
 */
export function PanelHistorico({ mapa, esRespaldo = false }: {
  mapa: MapaHistorico; esRespaldo?: boolean;
}) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const porNombre = new Map(mapa.herramientas.map((h) => [h.nombre, h]));
  const publicadas = new Set(porNombre.keys());
  // Fichas del catálogo sin herramienta viva, y herramientas vivas sin ficha. Las
  // dos se avisan: una vista de arquitectura que calla la diferencia con el
  // servicio deja de servir para lo único que sirve, que es confiar en ella.
  const huerfanas = Object.keys(HERRAMIENTAS_HISTORICO).filter((n) => !publicadas.has(n));
  const sinDocumentar = mapa.herramientas.filter((h) => !HERRAMIENTAS_HISTORICO[h.nombre]);

  function abrir(h: HerramientaHist) {
    const fam = FAMILIAS[h.familia]?.titulo ?? h.familia;
    setDetalle({
      titulo: h.nombre,
      clase: `herramienta · familia ${fam.toLowerCase()}`,
      ficha: HERRAMIENTAS_HISTORICO[h.nombre],
      // NodoModal deriva la tabla «qué recibe» del `input_schema`, que es el mismo
      // objeto que ve el modelo. `modos` es del Predictivo y acá no aplica.
      herramienta: { ...h, modos: undefined },
    });
  }

  return (
    <section className="vista">
      <div className="phead">
        <h1>Arquitectura del Agente Histórico</h1>
        <p>
          {mapa.objetivo} El modelo no calcula: elige qué herramienta llamar y redacta.
          Este mapa se lee del servicio en cada carga, así que muestra el agente como
          está hoy, no como se documentó alguna vez.
        </p>
        {esRespaldo && (
          <p className="hint" style={{ marginTop: 6 }}>
            <strong>Copia guardada.</strong> El servicio no respondió, así que este mapa
            sale de la última captura y no del agente en vivo.
          </p>
        )}
      </div>

      {/* ── La cadena: lo que hace confiable al agente es DÓNDE entra el LLM ── */}
      <div className="card">
        <h3>La cadena</h3>
        <p className="hint">
          La detección no corre dentro del agente. Corre antes, por lotes y sin modelo
          de lenguaje, y deja su resultado escrito. Las herramientas solo leen. El LLM
          aparece al final, y para entonces los números ya están decididos.
        </p>
        <div className="hist-cadena">
          <div className="hist-paso">
            <span className="lbl">1 · detección</span>
            <b>Barrido por lotes</b>
            <p>Sin LLM. Recorre día por día y tipifica lo que encuentra.</p>
          </div>
          <span className="hist-flecha" aria-hidden="true">→</span>
          <div className="hist-paso hist-store">
            <span className="lbl">2 · store</span>
            <b>Hallazgos escritos</b>
            <ul>{mapa.deteccion.escribe.map((t) => <li key={t} className="mono">{t}</li>)}</ul>
          </div>
          <span className="hist-flecha" aria-hidden="true">→</span>
          <div className="hist-paso hist-tools">
            <span className="lbl">3 · herramientas</span>
            <b>{mapa.herramientas.length} herramientas</b>
            <p>Pool de conexiones de <strong>solo lectura</strong>: no pueden escribir.</p>
          </div>
          <span className="hist-flecha" aria-hidden="true">→</span>
          <div className="hist-paso hist-modelo">
            <span className="lbl">4 · redacción</span>
            <b className="mono">{mapa.modelo}</b>
            <p>Orquesta y explica. Nunca calcula.</p>
          </div>
        </div>
        <p className="note" style={{ margin: "16px 0 0" }}>
          <b>Por qué por lotes.</b> {mapa.deteccion.por_que}.
        </p>
      </div>

      {/* ── Las familias y sus herramientas ─────────────────────────────── */}
      {familiasOrdenadas(mapa).map(([clave, fam]) => (
        <div className="card" key={clave}>
          <h3>{FAMILIAS[clave]?.titulo ?? clave}</h3>
          <p className="hint">{FAMILIAS[clave]?.nota ?? fam.objetivo}</p>
          <div className="hist-tools-grid">
            {fam.herramientas.map((nombre) => {
              const h = porNombre.get(nombre);
              const ficha = HERRAMIENTAS_HISTORICO[nombre];
              if (!h) return null;
              return (
                <button key={nombre} className="arq-fila" onClick={() => abrir(h)}
                        data-tip={ficha?.hover ?? h.descripcion.slice(0, 140)}>
                  <span className="arq-n-t">{nombre}</span>
                  <span className="arq-n-s">{ficha?.resumen ?? "—"}</span>
                  <span className="hist-marcas">
                    {h.incrusta_confianza && (
                      <span className="arq-chip" data-tip="Su respuesta viaja con el bloque «confianza»: sobre cuántos días utilizables se calculó.">
                        confianza
                      </span>
                    )}
                    {!ficha && <span className="arq-sd">sin documentar</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Los umbrales: la parte discutible, y por eso la más visible ── */}
      <div className="card">
        <h3>Umbrales: los números que deciden si un dato sirve</h3>
        <p className="hint">
          No son física, son <strong>política</strong>: alguien los eligió y se pueden
          discutir sin abrir el código. Salen leídos de donde se aplican, así que esta
          tabla no puede quedar desactualizada respecto del agente. Verlos es lo que
          convierte «el agente dice que el día es malo» en «lo marca porque cubrió
          menos del {Math.round((mapa.umbrales.find((u) => u.clave === "COBERTURA_MINIMA")?.valor ?? 0) * 100)} % de las horas de sol».
        </p>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr><th>umbral</th><th style={{ textAlign: "right" }}>valor</th><th>qué decide</th></tr>
            </thead>
            <tbody>
              {mapa.umbrales.map((u) => (
                <tr key={u.clave}>
                  <td className="mono">{u.clave}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{valorUmbral(u.valor)}</td>
                  <td>{u.que_decide}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Qué sabe detectar ───────────────────────────────────────────── */}
      <div className="card">
        <h3>Qué sabe detectar</h3>
        <p className="hint">
          Los {mapa.hallazgos.tipos.length} tipos de hallazgo que el barrido tipifica.
          Cada uno se guarda con su severidad ({mapa.hallazgos.severidades.join(" · ")}) y
          con cuántas lecturas afecta, que es lo que después decide el veredicto del día.
        </p>
        <div className="tbl-scroll">
          <table className="tbl">
            <tbody>
              {mapa.hallazgos.tipos.map((t) => (
                <tr key={t.tipo}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{t.tipo}</td>
                  <td>{t.que_es}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Garantías: por qué son estructurales y no promesas del prompt ── */}
      <div className="card">
        <h3>Garantías</h3>
        <p className="hint">
          Ninguna de estas depende de que el modelo obedezca una instrucción. Todas son
          consecuencia de cómo está armado el sistema, que es la única clase de garantía
          que sigue valiendo cuando el modelo se equivoca.
        </p>
        <ul className="arq-cer-l">
          {mapa.garantias.map((g, i) => (
            <li key={i}><b>{g.que}</b> — {g.como}.</li>
          ))}
        </ul>
      </div>

      {(huerfanas.length > 0 || sinDocumentar.length > 0) && (
        <p className="arq-aviso">
          <IconoAlerta size={14} />
          {huerfanas.length > 0 && (
            <span>
              La consola documenta {huerfanas.join(", ")}, que el servicio todavía no
              expone: el agente desplegado va detrás del código.
              {sinDocumentar.length > 0 ? " " : ""}
            </span>
          )}
          {sinDocumentar.length > 0 && (
            <span>
              {sinDocumentar.map((h) => h.nombre).join(", ")} corre en el servicio sin
              ficha en la consola: se dibuja con su contrato, sin explicación.
            </span>
          )}
        </p>
      )}

      <NodoModal detalle={detalle} onCerrar={() => setDetalle(null)} />
    </section>
  );
}
