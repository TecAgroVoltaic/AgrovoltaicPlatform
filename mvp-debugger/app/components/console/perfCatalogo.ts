// Catálogo de qué se puede graficar en la vista de Rendimiento: períodos y
// variables, con su tabla y columnas. Es CONFIGURACIÓN, no lógica de vista:
// agregar una variable no debería obligar a tocar el componente.

// El GRANO no es un detalle de implementación: es qué representa cada punto del
// gráfico, y sin decirlo la curva se lee como si fuera diaria. Un período largo
// con grano diario serían cientos de puntos ilegibles, así que cada período trae
// el suyo; lo que no se puede es callarlo.
export const PERIODS: Record<string, {
  label: string; desde?: string; hasta?: string; bucket: string; grano: string;
}> = {
  todo: { label: "Todo el histórico", bucket: "month", grano: "mes" },
  y2026: { label: "2026", desde: "2026-01-01", hasta: "2027-01-01", bucket: "week", grano: "semana" },
  mayo: { label: "Mayo 2026", desde: "2026-05-01", hasta: "2026-06-02", bucket: "day", grano: "día" },
};

/** Qué es un punto del gráfico, dicho para quien lo mira. */
export function quéEsUnPunto(p: { grano: string }): string {
  return `Cada punto es un ${p.grano}: el promedio de todas sus lecturas`;
}

/** Aviso de bucket parcial. `date_trunc` alinea a la semana/mes NATURAL, así que
 *  con un filtro de fechas el primer y el último punto pueden cubrir menos días
 *  que el resto. Es visible en los datos: la semana del 2025-12-29 del período
 *  «2026» tiene 4 días y 520 lecturas, contra 7 días y ~920 de una completa. */
export function avisoParcial(p: { grano: string; desde?: string }): string | null {
  return p.grano === "día" || !p.desde
    ? null
    : `El primer y el último punto pueden ser parciales: los tramos se alinean a la `
      + `${p.grano} natural, no al filtro de fechas.`;
}

export const VARS: Record<string, { label: string; tabla: string; cols: [string, string][]; unit: string; dec: number; cmp: boolean }> = {
  pot: { label: "Potencia", tabla: "electrico_corregido", cols: [["potencia_pv1_w", "PV1"], ["potencia_pv2_w", "PV2"]], unit: "W", dec: 0, cmp: true },
  ghi: { label: "Irradiancia", tabla: "radiacion_calibrada", cols: [["irradiancia_incidente_wm2", "GHI"]], unit: "W/m²", dec: 1, cmp: false },
  kt: { label: "Índice kt*", tabla: "radiacion_calibrada", cols: [["kt_star", "kt*"]], unit: "", dec: 3, cmp: false },
  pr: { label: "Performance Ratio", tabla: "performance", cols: [["pr_pv1", "PR PV1"], ["pr_pv2", "PR PV2"]], unit: "", dec: 3, cmp: true },
};

/** URL de la serie agregada de una columna en un período. */
export function q(tabla: string, columna: string, p: any): string {
  const u = new URLSearchParams({ tabla, columna, bucket: p.bucket, agg: "avg" });
  if (p.desde) u.set("desde", p.desde);
  if (p.hasta) u.set("hasta", p.hasta);
  return `/api/historico/datos/serie?${u}`;
}

/** Número formateado en es-CR; "—" si no es finito (dato ausente o error). */
export const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: d, maximumFractionDigits: d });
