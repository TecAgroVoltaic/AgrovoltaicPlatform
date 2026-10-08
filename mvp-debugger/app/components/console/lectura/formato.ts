/** Los dos lados de la verificación cruzada vienen redondeados a 2 decimales. */
export const TOLERANCIA = 0.05;

export const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR",
    { minimumFractionDigits: d, maximumFractionDigits: d });
