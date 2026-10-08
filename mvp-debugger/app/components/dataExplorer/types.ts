/** Una relación de la base del Histórico con su cobertura temporal. */
export type Rel = {
  clave: string;
  relacion: string;
  columna_tiempo: string | null;
  filas: number;
  desde: string | null;
  hasta: string | null;
};

export type Columna = { nombre: string; tipo: string };

export type Muestra = { columnas: string[]; filas: any[] };

/** Tipos de columna que se pueden graficar como serie. */
export const TIPO_GRAFICABLE = /double|numeric|real|integer|boolean/;
export const BUCKETS = ["hour", "day", "week", "month"];
export const AGREGACIONES = ["avg", "sum", "min", "max", "count"];
