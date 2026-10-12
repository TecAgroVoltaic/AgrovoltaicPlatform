// Del `CalendarioSpec` a las filas del calendario de actividad genérico: el
// tono sale del registro de fuentes y los días pasan a un registro fecha → día.
import type { ActivityRow } from "@/app/components/charts";
import type { CalendarioRow } from "@/app/lib/asistente/contracts/calendarioSpec";
import { sourceInfo } from "@/app/lib/fuentes/registry";

export function toActivityRows(rows: readonly CalendarioRow[]): ActivityRow[] {
  return rows.map((row, index) => ({
    // La misma fuente puede venir en dos filas (p. ej. dos cajas): el índice desempata.
    id: `${row.fuente}-${index}`,
    label: row.etiqueta,
    tone: sourceInfo(row.fuente).tone,
    days: new Map(row.dias.map(([date, level, readings]) => [date, { level, readings }])),
  }));
}
