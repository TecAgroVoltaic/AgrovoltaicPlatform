"use client";
// Panel de salud operativa.
//
// Responsabilidad única: MOSTRAR lo que devuelve /salud/panel. No calcula estado
// ni decide umbrales: eso vive en el agente.
//
// El orden no es decorativo. Lo primero que alguien necesita saber al abrir esta
// vista es POR QUÉ los números no avanzan, y la respuesta tiene dos mitades que
// por separado engañan: la ingesta está congelada, y la fuente es una réplica de
// un dump. Sin la segunda, un ETL que corre verde cada 6 minutos parece un
// sistema sano. Por eso el diagnóstico va arriba de todo y las tablas después.
import { useEffect, useState } from "react";
import { jget, mensajeError, nfmt } from "@/app/lib/client";
import { IconoAlerta, IconoCheck } from "@/app/components/Iconos";

const RUTA = "/api/pronostico/salud/panel";
const REFRESCO_MS = 30000;
// Último panel leído, a nivel de módulo. La vista se desmonta al cambiar de
// sección y se vuelve a montar al volver: sin esto, cada visita arrancaba en
// blanco y esperaba el viaje completo. Con esto, se ve al instante lo último
// que se supo y se refresca por detrás. Es un cache de pantalla, no de datos:
// muere con la pestaña, y `consultado_en` dice de cuándo es lo que se muestra.
let ultimoPanel: Panel | null = null;
const HORAS_POR_DIA = 24;
const MAX_DETALLE = 160;

type Variable = {
  ultimo_dato: string | null;
  edad_horas: number | null;
  filas: number;
  estado: "ok" | "stale" | "sin_datos";
};
type Corrida = {
  ts: string | null; edad_horas: number | null; ok?: boolean;
  filas_leidas?: number; filas_insertadas?: number; duracion_seg?: number;
  por_variable?: Record<string, { leidas: number; insertadas: number; error: string | null }>;
};
type Fuente = {
  host: string | null; puerto: number | null; base: string | null;
  tipo: "replica_dump" | "base_viva" | "replica_remota" | "desconocido";
  etiqueta: string; es_snapshot: boolean | null;
  criterio: string; definida_en: string;
  targets?: { variable: string; caja: string; unidad: string }[];
  error?: string;
};
type Panel = {
  estado: string;
  consultado_en?: string;
  fuente?: Fuente;
  store?: { host: string | null; puerto: number | null; base: string | null; etiqueta?: string };
  ingesta: {
    estado?: string; umbral_stale_horas: number; error?: string;
    variables: Record<string, Variable>;
    congelamiento?: { congelada: boolean; desde: string | null; dias: number | null };
    ultima_corrida_etl?: Corrida;
    ultimo_error_etl?: { ts: string; edad_horas: number | null; evento: string; error: string | null };
    etl_fallando?: boolean;
  };
  errores_recientes: { ts: string; componente: string; evento: string; error: string | null }[];
  presupuesto: { gastado_hoy_usd: number; tope_usd: number; agotado: boolean; medido: boolean };
  ultima_prediccion: { creado_en: string; variable: string; valor_esperado: number | null;
                       unidad: string | null } | null;
};

const TEXTO_ESTADO: Record<string, string> = {
  ok: "Al día", stale: "Datos viejos", sin_datos: "Sin datos", desconocido: "Sin medir",
};

function edad(horas: number | null | undefined): string {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < HORAS_POR_DIA) return `${nfmt(horas, 1)} h`;
  return `${nfmt(horas / HORAS_POR_DIA, 1)} días`;
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso)
    : d.toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });
}

/** Un dato con su rótulo, en la rejilla de identidad de las bases. */
function Dato({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="sal-dato">
      <span className="lbl">{k}</span>
      <span className={mono ? "mono" : ""}>{v}</span>
    </div>
  );
}

export function SaludView() {
  const [panel, setPanel] = useState<Panel | null>(ultimoPanel);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(ultimoPanel === null);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const r = await jget<Panel>(RUTA);
      if (!vivo) return;
      setCargando(false);
      if (!r.ok || !r.data?.ingesta) { setError(mensajeError(r)); return; }
      setError(null);
      ultimoPanel = r.data;
      setPanel(r.data);
    }
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  if (cargando) return <div className="card"><p className="muted">Consultando estado…</p></div>;

  // Con un panel ya en pantalla, un fallo del refresco NO lo borra: se avisa y
  // se deja lo último que sí se pudo leer, que sigue siendo información.
  if (error && !panel) {
    return (
      <div className="card">
        <h3>Salud del sistema</h3>
        <p className="hint">No se pudo consultar el estado: {String(error)}</p>
        <p className="small muted">
          Suele significar que el sidecar de pronóstico está caído o que no alcanza
          la base. Revisá <span className="mono">docker ps</span> en la EC2.
        </p>
      </div>
    );
  }
  if (!panel) return null;

  const { fuente, store, ingesta } = panel;
  const cong = ingesta.congelamiento;
  const corrida = ingesta.ultima_corrida_etl;
  const p = panel.presupuesto;
  const pct = p.tope_usd > 0 ? Math.min(100, (p.gastado_hoy_usd / p.tope_usd) * 100) : 0;
  // «Corrió bien» y «trajo datos» son cosas distintas, y confundirlas es lo que
  // hace que un sistema congelado parezca sano.
  const corrioSinTraer = corrida?.ok === true && (corrida.filas_insertadas ?? 0) === 0;

  return (
    <>
      {error && (
        <p className="arq-aviso" style={{ marginBottom: 12 }}>
          <IconoAlerta size={14} />
          <span>No se pudo refrescar ({error}). Lo de abajo es la última lectura buena.</span>
        </p>
      )}

      {/* El diagnóstico, antes que cualquier tabla. */}
      <div className={"card sal-diag" + (cong?.congelada ? " sal-diag-alerta" : "")}>
        <div className="sal-diag-ic">
          {cong?.congelada ? <IconoAlerta size={18} /> : <IconoCheck size={18} />}
        </div>
        <div>
          <h3>
            {cong?.congelada
              ? `No entran datos nuevos desde hace ${nfmt(cong.dias, 1)} días`
              : "La ingesta está al día"}
          </h3>
          {cong?.congelada && (
            <p className="hint">
              El último dato es del <b>{fecha(cong.desde)}</b>. Después de ese instante
              no entró nada, ni de irradiancia ni de humedad de suelo.
              {fuente?.es_snapshot && (
                <> Y no puede entrar: la fuente es <b>{fuente.etiqueta.toLowerCase()}</b>,
                   o sea una foto fija. {corrioSinTraer
                     ? "El ETL corrió hace un rato y terminó bien, pero leyó 0 filas: no porque esté roto, sino porque no hay filas nuevas que leer."
                     : ""}</>
              )}
            </p>
          )}
          {ingesta.etl_fallando && (
            <p className="hint" style={{ color: "var(--crit)" }}>
              Además el ETL <b>está fallando ahora</b>: su último error es posterior a
              su última corrida completa. Mirá el detalle abajo.
            </p>
          )}
          {ingesta.error && (
            <p className="hint" style={{ color: "var(--warn)" }}>
              No se pudo medir la ingesta: {ingesta.error}. El resto del panel es lo
              último que sí se pudo leer.
            </p>
          )}
        </div>
      </div>

      {/* De dónde sale cada cosa. Fuente y store se confunden todo el tiempo. */}
      <div className="sal-cols">
        <div className="card">
          <h3>De dónde se leen los datos</h3>
          <p className="hint">La fuente del ETL. Es lo que alimenta al agente.</p>
          {!fuente || fuente.error ? (
            <p className="small muted">No se pudo determinar ({fuente?.error || "sin dato"}).</p>
          ) : (
            <>
              <div className="sal-rejilla">
                <Dato k="tipo" v={<b>{fuente.etiqueta}</b>} mono={false} />
                <Dato k="dirección" v={`${fuente.host ?? "?"}:${fuente.puerto ?? "?"}`} />
                <Dato k="base" v={fuente.base ?? "—"} />
                <Dato k="configurada en" v={fuente.definida_en} />
                <Dato
                  k="¿avanza?"
                  v={fuente.es_snapshot === null
                    ? "no se sabe"
                    : fuente.es_snapshot ? "no, es una foto fija" : "sí, es la base viva"}
                  mono={false}
                />
              </div>
              <p className="note">
                <b>Cómo se dedujo.</b> {fuente.criterio} Es una inferencia, no algo que
                la base declare: si alguien cambia la topología, esto puede quedar viejo.
              </p>
              {fuente.targets && fuente.targets.length > 0 && (
                <p className="small muted">
                  Se le piden {fuente.targets.length} cajas:{" "}
                  <span className="mono">{fuente.targets.map((t) => t.caja).join(" · ")}</span>
                </p>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h3>Dónde se guardan</h3>
          <p className="hint">El store propio del agente. Es de acá que lee el pronóstico.</p>
          {!store ? <p className="small muted">Sin dato.</p> : (
            <div className="sal-rejilla">
              <Dato k="qué es" v={<b>{store.etiqueta || "Store del agente"}</b>} mono={false} />
              <Dato k="dirección" v={`${store.host ?? "?"}:${store.puerto ?? "?"}`} />
              <Dato k="base" v={store.base ?? "—"} />
            </div>
          )}
          {panel.ultima_prediccion && (
            <p className="small muted" style={{ marginTop: 12 }}>
              Última predicción guardada: {nfmt(panel.ultima_prediccion.valor_esperado, 1)}{" "}
              {panel.ultima_prediccion.unidad} de {panel.ultima_prediccion.variable},{" "}
              {fecha(panel.ultima_prediccion.creado_en)}
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Ingesta de datos</h3>
        <p className="hint">
          El pronóstico usa como “ahora” el último dato ingerido, no el reloj. Si esto
          está viejo, todo lo que se muestre abajo también lo está.
        </p>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr><th>Variable</th><th>Estado</th><th>Último dato</th><th>Antigüedad</th><th>Filas</th></tr>
            </thead>
            <tbody>
              {Object.entries(ingesta.variables || {}).map(([nombre, v]) => (
                <tr key={nombre}>
                  <td className="mono">{nombre}</td>
                  <td><span className={`pill pill-${v.estado}`}>{TEXTO_ESTADO[v.estado] || v.estado}</span></td>
                  <td className="mono small">{fecha(v.ultimo_dato)}</td>
                  <td className="mono">{edad(v.edad_horas)}</td>
                  <td className="mono">{nfmt(v.filas, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Se considera viejo a partir de {ingesta.umbral_stale_horas} h.
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Última corrida del ETL</h3>
        <p className="hint">
          Que termine bien y que traiga datos son dos cosas distintas. Acá se ven las dos.
        </p>
        {!corrida?.ts ? <p className="small muted">Todavía no hay corridas registradas.</p> : (
          <>
            <div className="sal-rejilla">
              <Dato k="cuándo" v={`${fecha(corrida.ts)} (${edad(corrida.edad_horas)} atrás)`} />
              <Dato
                k="resultado"
                v={corrida.ok === false
                  ? <span style={{ color: "var(--crit)" }}>falló</span>
                  : <span style={{ color: "var(--good)" }}>terminó bien</span>}
                mono={false}
              />
              <Dato k="filas leídas" v={nfmt(corrida.filas_leidas ?? 0, 0)} />
              <Dato
                k="filas insertadas"
                v={<span style={{ color: corrioSinTraer ? "var(--warn)" : undefined }}>
                     {nfmt(corrida.filas_insertadas ?? 0, 0)}
                   </span>}
              />
              {corrida.duracion_seg != null && (
                <Dato k="duración" v={`${nfmt(corrida.duracion_seg, 1)} s`} />
              )}
            </div>
            {corrida.por_variable && (
              <div className="tbl-scroll" style={{ marginTop: 10 }}>
                <table className="tbl">
                  <thead><tr><th>Variable</th><th>Leídas</th><th>Insertadas</th><th>Error</th></tr></thead>
                  <tbody>
                    {Object.entries(corrida.por_variable).map(([v, d]) => (
                      <tr key={v}>
                        <td className="mono">{v}</td>
                        <td className="mono">{nfmt(d.leidas, 0)}</td>
                        <td className="mono">{nfmt(d.insertadas, 0)}</td>
                        <td className="small muted">{d.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {ingesta.ultimo_error_etl && (
          <p className="note">
            <b>Último error del ETL</b> ({edad(ingesta.ultimo_error_etl.edad_horas)} atrás,{" "}
            <span className="mono">{ingesta.ultimo_error_etl.evento}</span>):{" "}
            {(ingesta.ultimo_error_etl.error || "").slice(0, MAX_DETALLE)}
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Gasto del día</h3>
        <p className="hint">
          {p.medido
            ? <>US${nfmt(p.gastado_hoy_usd, 4)} de US${nfmt(p.tope_usd, 2)}
               {p.agotado && <strong> · tope alcanzado, las consultas al modelo están cortadas</strong>}</>
            : <>No se pudo medir el gasto (la base no respondió); el tope no se está aplicando.</>}
        </p>
        {p.medido && p.tope_usd > 0 && (
          <div className="barra"><div className="barra-fill" style={{ width: `${pct}%` }} /></div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Errores recientes</h3>
        {panel.errores_recientes.length === 0 ? (
          <p className="hint">Sin errores registrados.</p>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead><tr><th>Cuándo</th><th>Componente</th><th>Evento</th><th>Detalle</th></tr></thead>
              <tbody>
                {panel.errores_recientes.map((e, i) => (
                  <tr key={i}>
                    <td className="mono small">{fecha(e.ts)}</td>
                    <td className="mono">{e.componente}</td>
                    <td className="mono">{e.evento}</td>
                    <td className="small muted">{(e.error || "").slice(0, MAX_DETALLE)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {panel.consultado_en && (
        <p className="small muted mono" style={{ marginTop: 12 }}>
          leído {fecha(panel.consultado_en)} · se refresca cada {REFRESCO_MS / 1000} s
        </p>
      )}
    </>
  );
}
