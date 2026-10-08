import type { PERIODS, VARS } from "@/app/components/console/perfCatalogo";
import type { PuntoSerie } from "@/app/lib/serie";

export type Periodo = (typeof PERIODS)[string];
export type Variable = (typeof VARS)[string];

/** Serie diaria completa de cada columna, por clave `tabla.columna`. */
export type Diarias = Record<string, PuntoSerie[]>;

/** La serie que se dibuja, ya recortada, reagrupada y completada. */
export type SerieDibujada = {
  fechas: string[];
  labels: string[];
  cols: (number | null)[][];
  muestras: number[];
};

/** Lo que predice el sol de cada tramo, por arreglo. */
export type Referencia = {
  esperadas: ((number | null)[] | null)[];
  rectas: unknown[];
};

export const clave = (t: string, c: string) => `${t}.${c}`;
