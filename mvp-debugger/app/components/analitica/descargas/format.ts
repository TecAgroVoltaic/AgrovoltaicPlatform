// Formato de los números de esta vista. Formatear no es calcular: acá solo se
// decide cómo se leen números que ya existen.
const LOCALE = "es-CR";

/** Un conteo de filas o de columnas, con separador de miles. */
export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

/** Una estimación SIEMPRE se lee como estimación: el signo va pegado al número
 *  para que nadie se lleve la cifra sin él. */
export function formatApproximate(value: number): string {
  return `≈ ${formatCount(value)}`;
}

export function formatRows(value: number): string {
  return value === 1 ? "1 fila" : `${formatCount(value)} filas`;
}

export function formatColumns(value: number): string {
  return value === 1 ? "1 columna" : `${formatCount(value)} columnas`;
}
