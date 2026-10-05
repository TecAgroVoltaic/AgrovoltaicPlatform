// Tablero: las nueve casillas de la Fig. 2 del PDF.
//
// Server Component de punta a punta. Lee el rango de la URL con el mismo
// validador que usa el formulario del cascarón, pide el resumen del período y
// entrega el estado ya resuelto a la vista. El navegador recibe HTML con los
// números dentro: ni una petición desde el cliente, ni un salto de carga, ni un
// solo número calculado acá.
import type { Metadata } from "next";

import { DashboardView } from "@/app/components/analitica/tablero/DashboardView";
import { loadDashboard } from "@/app/components/analitica/tablero/loadDashboard";
import { parseRangeParams, readerFromRecord } from "@/app/lib/analitica/urlRange";

export const metadata: Metadata = { title: "Tablero · AgroVoltaic" };

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { range } = parseRangeParams(readerFromRecord(searchParams));
  const state = await loadDashboard(range);
  return <DashboardView state={state} />;
}
