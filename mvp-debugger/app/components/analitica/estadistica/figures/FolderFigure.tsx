"use client";
// Fig. 8 bis: el diagrama de carpeta, un día por columna y una hora por fila.
//
// ═══ LA HORA YA VIENE RESUELTA. NO SE CONVIERTE ZONA ═══════════════════════
// Los timestamps de la base son `timestamptz` etiquetados `+00` pero guardan la
// hora LOCAL de Costa Rica, y el backend manda `horas` como enteros 0..23 ya
// locales. Acá esos enteros se usan como lo que son: un número que ya está bien.
// Un `new Date(...).getHours()` los reinterpretaría como UTC y correría el perfil
// diario seis horas, con el mediodía solar apareciendo a las seis de la mañana.
// En este archivo no se construye ni una fecha, y su prueba lo fija corriendo el
// adaptador bajo dos zonas horarias distintas.
import {
  CalendarHeatmapChart,
  type CalendarHeatmapData,
  type HeatmapCell,
} from "@/app/components/charts";
import { isMeasured } from "@/app/lib/analitica/contracts/metric";
import type { FolderResponse } from "@/app/lib/analitica/contracts/estadistica";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/estadistica/chartState";
import { formatCount } from "@/app/components/analitica/estadistica/format";
import type { FocusedFigureProps } from "@/app/components/analitica/estadistica/figures/props";

const HEATMAP_HEIGHT = 420;
const HOUR_LABEL_DIGITS = 2;
const NO_CELLS_TEXT =
  "No hay ninguna celda con medición en el rango: ni un día del período trae lecturas de esta variable.";

/** La hora local como etiqueta: `9` es la fila `09`. Ni zona ni calendario. */
function hourLabel(hour: number): string {
  return String(hour).padStart(HOUR_LABEL_DIGITS, "0");
}

export function toHeatmapData(response: FolderResponse): CalendarHeatmapData {
  const { variable, days, hours, matrix, range } = response.payload;
  return {
    columns: days,
    rows: hours.map(hourLabel),
    cells: toCells(hours.length, matrix),
    unit: variable.unit,
    // Los extremos de la escala salen del backend, que los midió sobre TODAS las
    // lecturas, no sobre las celdas que quedaron dibujadas.
    ...(isMeasured(range.minimum) ? { min: range.minimum.value } : {}),
    ...(isMeasured(range.maximum) ? { max: range.maximum.value } : {}),
  };
}

function toCells(
  hourCount: number,
  matrix: readonly (readonly (number | null)[])[],
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  matrix.forEach((dayValues, column) => {
    for (let row = 0; row < hourCount; row += 1) {
      // Una hora sin lecturas viaja como null y no se pinta. De noche la
      // generación es cero DE VERDAD; en un día que el logger no grabó no hay
      // dato, y pintarlos igual haría ver un mes caído como noche permanente.
      cells.push({ column, row, value: dayValues[row] ?? null });
    }
  });
  return cells;
}

function describeCoverage(response: FolderResponse): string {
  const { cellsWithData, totalCells } = response.payload;
  return (
    `Cada celda es el promedio de esa hora local de Costa Rica, tal como la manda el ` +
    `backend (la vista no convierte zona horaria). ${formatCount(cellsWithData)} de ` +
    `${formatCount(totalCells)} celdas con medición.`
  );
}

function emptiness(response: FolderResponse) {
  return response.payload.cellsWithData > 0 ? null : emptyBecause("NO_ROWS", NO_CELLS_TEXT);
}

export function FolderFigure(props: FocusedFigureProps<FolderResponse>) {
  const { result, outOfCoverage, onRetry, focusLabel } = props;
  const state = chartStateFrom(result, {
    outOfCoverage,
    onRetry,
    adapt: toHeatmapData,
    emptiness,
  });

  return (
    <CalendarHeatmapChart
      title={`Carpeta día por hora · ${focusLabel}`}
      subtitle="Un día por columna y una hora local por fila: dónde empieza y termina la generación, y qué días se cayó el registro (Fig. 8 bis)."
      caption={result?.ok ? describeCoverage(result.data) : undefined}
      height={HEATMAP_HEIGHT}
      state={state}
    />
  );
}
