// El contrato de `GET /exportar/relaciones`: qué tablas se pueden bajar, qué
// columnas tiene cada una y hasta dónde llega su dato.
//
// Es METADATO del catálogo, no la lectura de un período: no trae `ventana` ni
// `confianza`, así que no usa `analysisResponse`.
//
// PENDIENTE DE VERIFICAR CONTRA EL CABLE: al escribirlo, el endpoint todavía no
// existía en el servicio (`/exportar/relaciones` daba 404) y el esquema sale del
// contrato acordado. Cuando el backend publique, hay que volver a derivarlo de
// un `curl` real. Lo que se dejó FLOJO a propósito es lo que un `curl` podría
// desmentir sin que la vista pierda sentido: `columna_tiempo`, `desde` y `hasta`
// admiten null porque la relación `diccionario` es una tabla de definiciones y
// puede no tener eje temporal, y un esquema estricto ahí tumbaría las nueve
// tablas por culpa de una.
import { z } from "zod";

export type ExportColumn = {
  readonly name: string;
  readonly label: string;
  readonly unit: string | null;
  /** Destildada = contabilidad interna del ETL (identificadores, sellos de
   *  carga). El backend decide cuáles son, la vista solo obedece. */
  readonly byDefault: boolean;
};

export type ExportRelation = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** Columna que lleva el tiempo, o null si la tabla no tiene eje temporal. */
  readonly timeColumn: string | null;
  /** Filas de la tabla ENTERA, no las del rango elegido. */
  readonly rows: number;
  readonly from: string | null;
  /** Último día con dato, INCLUSIVE (el rango de la app es [desde, hasta)). */
  readonly until: string | null;
  readonly columns: readonly ExportColumn[];
};

const exportColumnSchema = z
  .object({
    nombre: z.string(),
    etiqueta: z.string(),
    unidad: z.string().nullish(),
    por_defecto: z.boolean(),
  })
  .transform((raw): ExportColumn => ({
    name: raw.nombre,
    label: raw.etiqueta,
    unit: raw.unidad ?? null,
    byDefault: raw.por_defecto,
  }));

const exportRelationSchema = z
  .object({
    clave: z.string(),
    etiqueta: z.string(),
    descripcion: z.string(),
    columna_tiempo: z.string().nullish(),
    filas: z.number().int().nonnegative(),
    desde: z.string().nullish(),
    hasta: z.string().nullish(),
    columnas: z.array(exportColumnSchema).min(1),
  })
  .transform((raw): ExportRelation => ({
    key: raw.clave,
    label: raw.etiqueta,
    description: raw.descripcion,
    timeColumn: raw.columna_tiempo ?? null,
    rows: raw.filas,
    from: raw.desde ?? null,
    until: raw.hasta ?? null,
    columns: raw.columnas,
  }));

export const exportRelationsSchema = z
  .object({ relaciones: z.array(exportRelationSchema) })
  .transform((raw): readonly ExportRelation[] => raw.relaciones);
