"use client";
// Lo que la persona eligió: tabla, columnas, formato y variantes.
//
// Las columnas se guardan como `null` mientras nadie las toque, y `null`
// significa "las que el backend marcó por defecto". Guardarlas resueltas
// obligaría a un efecto que las sincronice al cambiar de tabla, y un efecto que
// copia props a estado es la forma habitual de que la pantalla muestre las
// columnas de la tabla anterior durante un render.
import { useCallback, useMemo, useState } from "react";

import {
  metadataAllowed,
  toWireFormat,
  type DownloadFormat,
  type WireFormat,
} from "@/app/components/analitica/descargas/download";
import type { ExportColumn, ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type DownloadSelection = {
  readonly relation: ExportRelation;
  /** Nombres elegidos, SIEMPRE en el orden del catálogo, que es el orden en que
   *  el archivo las va a traer. */
  readonly columns: readonly string[];
  readonly format: DownloadFormat;
  readonly matlabNumeric: boolean;
  /** Lo que la persona marcó. Lo que de verdad viaja es `metadataEnabled`. */
  readonly metadata: boolean;
  readonly wireFormat: WireFormat;
  /** false con `dat_numerico`: ahí los metadatos ni se ofrecen. */
  readonly metadataEnabled: boolean;
};

export type DownloadSelectionActions = {
  readonly selectRelation: (key: string) => void;
  readonly toggleColumn: (name: string) => void;
  readonly selectAllColumns: () => void;
  readonly clearColumns: () => void;
  readonly setFormat: (format: DownloadFormat) => void;
  readonly setMatlabNumeric: (on: boolean) => void;
  readonly setMetadata: (on: boolean) => void;
};

const DEFAULT_FORMAT: DownloadFormat = "csv";

function defaultColumns(relation: ExportRelation): readonly string[] {
  return names(relation.columns.filter((column) => column.byDefault));
}

function names(columns: readonly ExportColumn[]): readonly string[] {
  return columns.map((column) => column.name);
}

export function useDownloadSelection(
  relations: readonly ExportRelation[],
): DownloadSelection & { readonly actions: DownloadSelectionActions } {
  const [relationKey, setRelationKey] = useState<string | null>(null);
  const [chosenColumns, setChosenColumns] = useState<readonly string[] | null>(null);
  const [format, setFormat] = useState<DownloadFormat>(DEFAULT_FORMAT);
  const [matlabNumeric, setMatlabNumeric] = useState(false);
  const [metadata, setMetadata] = useState(true);

  // La primera tabla es la que se abre. `relations` nunca está vacío acá: sin
  // tablas la vista muestra su estado vacío y este hook no llega a montarse.
  const relation =
    relations.find((candidate) => candidate.key === relationKey) ?? relations[0];
  const columns = chosenColumns ?? defaultColumns(relation);

  const selectRelation = useCallback((key: string) => {
    setRelationKey(key);
    // Las columnas de una tabla no significan nada en otra.
    setChosenColumns(null);
  }, []);

  const toggleColumn = useCallback(
    (name: string) => {
      const next = new Set(columns);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      // Se reconstruye desde el catálogo para que el orden no dependa de en qué
      // orden se marcaron las casillas: con `.dat` numérico ese orden ES el
      // único mapa que va a tener el archivo.
      setChosenColumns(names(relation.columns.filter((column) => next.has(column.name))));
    },
    [columns, relation],
  );

  const selectAllColumns = useCallback(
    () => setChosenColumns(names(relation.columns)),
    [relation],
  );
  const clearColumns = useCallback(() => setChosenColumns([]), []);

  const wireFormat = toWireFormat(format, matlabNumeric);
  const actions = useMemo(
    (): DownloadSelectionActions => ({
      selectRelation,
      toggleColumn,
      selectAllColumns,
      clearColumns,
      setFormat,
      setMatlabNumeric,
      setMetadata,
    }),
    [selectRelation, toggleColumn, selectAllColumns, clearColumns],
  );

  return {
    relation,
    columns,
    format,
    matlabNumeric,
    metadata,
    wireFormat,
    metadataEnabled: metadataAllowed(wireFormat),
    actions,
  };
}
