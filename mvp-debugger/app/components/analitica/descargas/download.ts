// Cómo se arma la URL del archivo, y qué formatos existen.
//
// El archivo lo genera SIEMPRE el backend: acá no se serializa ni una fila. Lo
// único que hace este módulo es traducir la elección de la persona a los
// parámetros de `GET /exportar/datos`.
import { RANGE_PARAM } from "@/app/lib/analitica/urlRange";
import type { DateRange } from "@/app/lib/analitica/dateRange";

/** Ruta del proxy binario. NO es `/api/historico`: ver el porqué en
 *  `app/api/descarga/datos/route.ts`. */
export const DOWNLOAD_ENDPOINT = "/api/descarga/datos";

/** Lo que la persona elige. `dat_numerico` no está acá porque no es un cuarto
 *  formato: es una variante de `.dat`, y ofrecerlo suelto obligaría a explicar
 *  dos veces la misma extensión. */
export type DownloadFormat = "csv" | "dat" | "mat";

/** Lo que viaja en el parámetro `formato`. */
export type WireFormat = DownloadFormat | "dat_numerico";

export type FormatOption = {
  readonly format: DownloadFormat;
  readonly label: string;
  /** Qué es y con qué se abre, en una línea. */
  readonly hint: string;
};

export const FORMAT_OPTIONS: readonly FormatOption[] = [
  { format: "csv", label: ".csv", hint: "Texto separado por comas: Excel, pandas, R." },
  { format: "dat", label: ".dat", hint: "Texto separado por tabuladores, con cabecera." },
  { format: "mat", label: ".mat", hint: "Binario de MATLAB v5: cada columna, una variable." },
];

export function toWireFormat(format: DownloadFormat, matlabNumeric: boolean): WireFormat {
  return format === "dat" && matlabNumeric ? "dat_numerico" : format;
}

/** Los metadatos son una cabecera de texto, y `load()` de MATLAB muere con
 *  cualquier línea no numérica: el backend RECHAZA la combinación con un 400.
 *  La interfaz ya la hace imposible; esto es la segunda red, para que ninguna
 *  URL armada a mano desde el código pueda producir ese error. */
export function metadataAllowed(wireFormat: WireFormat): boolean {
  return wireFormat !== "dat_numerico";
}

export type DownloadRequest = {
  readonly relationKey: string;
  readonly range: DateRange;
  /** En el orden en que van a salir en el archivo. */
  readonly columns: readonly string[];
  readonly wireFormat: WireFormat;
  readonly metadata: boolean;
};

const METADATA_PARAM = { on: "1", off: "0" } as const;

/**
 * La URL del archivo, lista para un `<a href>`.
 *
 * `hasta` viaja EXCLUSIVO, como en todo el resto de la aplicación: es el mismo
 * parámetro que ya leen las cinco vistas, y traducirlo acá a un fin inclusivo
 * haría que la misma fecha en la URL signifique dos cosas distintas. La
 * `granularidad` del cascarón NO viaja: una descarga entrega filas crudas, y
 * mandarla sugeriría una agregación que el archivo no trae.
 */
export function buildDownloadUrl(request: DownloadRequest): string {
  const params = new URLSearchParams({
    relacion: request.relationKey,
    [RANGE_PARAM.from]: request.range.from,
    [RANGE_PARAM.toExclusive]: request.range.toExclusive,
    columnas: request.columns.join(","),
    formato: request.wireFormat,
    metadatos:
      request.metadata && metadataAllowed(request.wireFormat)
        ? METADATA_PARAM.on
        : METADATA_PARAM.off,
  });
  return `${DOWNLOAD_ENDPOINT}?${params.toString()}`;
}
