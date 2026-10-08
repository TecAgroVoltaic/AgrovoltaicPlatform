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
//
// Cada bloque de la pantalla vive en `salud/`, en el orden en que se lee.
import { IconoAlerta } from "@/app/components/Iconos";
import { CorridaEtl } from "@/app/components/console/salud/CorridaEtl";
import { Diagnostico } from "@/app/components/console/salud/Diagnostico";
import { ErroresRecientes } from "@/app/components/console/salud/ErroresRecientes";
import { fecha } from "@/app/components/console/salud/formato";
import { Gasto } from "@/app/components/console/salud/Gasto";
import { Ingesta } from "@/app/components/console/salud/Ingesta";
import { Origen } from "@/app/components/console/salud/Origen";
import { REFRESCO_MS, useSaludPanel } from "@/app/components/console/salud/useSaludPanel";

const MS_POR_SEGUNDO = 1000;

export function SaludView() {
  const { panel, error, cargando } = useSaludPanel();

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

  const corrida = panel.ingesta.ultima_corrida_etl;
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

      <Diagnostico panel={panel} corrioSinTraer={corrioSinTraer} />
      <Origen panel={panel} />
      <Ingesta ingesta={panel.ingesta} />
      <CorridaEtl ingesta={panel.ingesta} corrioSinTraer={corrioSinTraer} />
      <Gasto p={panel.presupuesto} />
      <ErroresRecientes errores={panel.errores_recientes} />

      {panel.consultado_en && (
        <p className="small muted mono" style={{ marginTop: 12 }}>
          leído {fecha(panel.consultado_en)} · se refresca cada {REFRESCO_MS / MS_POR_SEGUNDO} s
        </p>
      )}
    </>
  );
}
