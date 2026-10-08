"use client";
// Vista «Calidad de datos» — lo que encontró el Agente Histórico barriendo el histórico PV.
//
// Responsabilidad única: MOSTRAR. El veredicto de cada día lo decide el servicio
// (`/calidad/dias`), no esta vista: si lo calculara el cliente, la consola y el
// reporte del CLI podrían discrepar sobre si un día sirve, y eso es exactamente
// la clase de desacuerdo que nadie detecta hasta que ya tomó una decisión con él.
//
// La pieza central es el MAPA DE DÍAS, y es deliberado que sea un calendario y no
// una tabla: el hallazgo más grande del histórico es que faltan 295 de los 569
// días de calendario, y eso en una tabla de 274 filas no se ve, porque una tabla
// solo muestra lo que existe. El calendario muestra los huecos.
//
// Y hay DOS tiras, una por fuente, porque el veredicto combinado escondía el
// hallazgo más accionable: la radiación tiene 126 días sanos y el eléctrico 4.
// Fundidas en una sola barra, ambas se ven igual de rojas.
import { Estado } from "@/app/components/console/Estado";
import { DetalleDia } from "@/app/components/console/calidad/DetalleDia";
import { MapaDias } from "@/app/components/console/calidad/MapaDias";
import { ResumenCalidad } from "@/app/components/console/calidad/ResumenCalidad";
import { TablaTipos } from "@/app/components/console/calidad/TablaTipos";
import { useCalidad } from "@/app/components/console/calidad/useCalidad";

export function CalidadView() {
  const { resumen, dias, error, sel, setSel, detalle } = useCalidad();

  if (error) return <div className="card"><Estado error={error} que="el control de calidad" /></div>;
  if (!resumen) return <div className="card"><p className="hint">Cargando…</p></div>;

  const diaSel = sel ? dias.find((d) => d.fecha === sel) ?? null : null;

  return (
    <div className="grid">
      <ResumenCalidad resumen={resumen} />
      <MapaDias dias={dias} sel={sel} onPick={setSel} />
      {diaSel && <DetalleDia diaSel={diaSel} detalle={detalle} />}
      <TablaTipos tipos={resumen.tipos} />
    </div>
  );
}
