// Formato de cifras de una descarga. Compartido por la vista Descargas y por la
// tarjeta del asistente: las dos tienen que contar los bytes igual.
const LOCALE = "es-CR";
const BYTES_PER_KB = 1e3;
const BYTES_PER_MB = 1e6;

/** Entero con separador de miles del sitio (`8.640`). */
export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

/** Tamaño legible: kB por debajo del mega (nunca "0 kB"), MB con un decimal. */
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_MB) return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} kB`;
  return `${(bytes / BYTES_PER_MB).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB`;
}
