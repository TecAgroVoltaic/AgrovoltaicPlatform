import type { Veredicto } from "./tipos";

export const COLOR: Record<Veredicto, string> = {
  ok: "var(--good)", aviso: "var(--warn)", grave: "var(--crit)", sin_datos: "var(--line2)",
};

export const LEYENDA: [Veredicto, string][] = [
  ["ok", "sin hallazgos"],
  ["aviso", "defectos puntuales"],
  ["grave", "problema material"],
  ["sin_datos", "no hay datos"],
];

// Qué significa cada tipo, en una línea. Sin esto la tabla es una lista de
// nombres internos, y quien la lee tiene que ir al código para entenderla.
export const QUE_ES: Record<string, string> = {
  dia_incompleto: "el logger no grabó todas las horas de sol",
  hueco: "faltan muestras dentro de la ventana que sí grabó",
  duplicado_timestamp: "el mismo instante aparece más de una vez",
  cambio_de_cadencia: "el intervalo de muestreo cambió respecto al día anterior",
  columna_ausente: "la columna no vino en el CSV de ese día (los 13 esquemas)",
  nulos: "faltan valores sueltos en la columna",
  fuera_de_rango: "valores fuera del rango físico plausible",
  saturado_85: "85 °C constante: el DS18B20 está desconectado",
  constante_en_cero: "sin variación en todo el día; en lo eléctrico, no hubo generación",
  sensor_plano: "clavado en un valor que no es 0 ni 85: sensor trabado",
  offset_nocturno: "el offset del piranómetro sin calibrar (−38,845)",
  kt_imposible: "más energía que la de cielo despejado: dato inválido, no una nube",
};

export const CLASE_CIELO: Record<string, string> = {
  despejado: "despejado", parcial: "parcial", cubierto: "cubierto", variable: "variable",
};

const MESES_DEL_ISO = 7;
const PORCENTAJE = 100;

export function mes(fecha: string): string {
  return fecha.slice(0, MESES_DEL_ISO);
}

export function pct(n: number, de: number): string {
  return de ? `${Math.round((PORCENTAJE * n) / de)} %` : "—";
}
