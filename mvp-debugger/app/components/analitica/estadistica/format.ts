// Formato de números para los pies de los gráficos.
//
// Formatear NO es calcular: acá no se promedia, ni se integra, ni se recalcula
// nada. Los números llegan hechos del backend y esto solo decide cómo se leen.
//
// El locale se repite en `contracts/metric.ts`, que lo tiene privado. Cuando
// alguno de los dos se exporte, este se borra.
const LOCALE = "es-CR";

/** Un conteo entero (pares, lecturas, celdas) con separador de miles. */
export function formatCount(value: number): string {
  return value.toLocaleString(LOCALE);
}

/** Un número con como mucho `decimals` decimales, en formato local. */
export function formatDecimal(value: number, decimals: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: decimals });
}
