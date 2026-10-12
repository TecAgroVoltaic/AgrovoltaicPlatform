// Lo que recibe el calendario de actividad. Es genérico: no sabe de specs ni
// del asistente, solo de filas con un tono y un registro fecha → día.
import type { SourceTone } from "@/app/lib/fuentes/registry";

/** 0 = sin datos; 1..4 = actividad creciente (quien arma la fila decide el corte). */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type ActivityDay = {
  readonly level: ActivityLevel;
  readonly readings: number;
};

export type ActivityRow = {
  readonly id: string;
  readonly label: string;
  /** Token de color de `tokens.css` que tiñe el punto y las celdas. */
  readonly tone: SourceTone;
  /** Fecha `YYYY-MM-DD` → día. Un día ausente se dibuja como nivel 0. */
  readonly days: ReadonlyMap<string, ActivityDay>;
};
