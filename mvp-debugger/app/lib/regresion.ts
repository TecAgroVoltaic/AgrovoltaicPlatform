// Ajuste lineal y detección de días por debajo de lo esperado.
//
// Vive aparte de la vista y del dibujo porque es lo único de todo esto que puede
// estar MAL sin que se note: una recta mal ajustada se ve igual de bien que una
// bien ajustada, y un día marcado como anómalo manda a alguien a revisar un panel.
// Acá se puede probar sin navegador y sin base de datos.

export type Punto = { x: number; y: number; etiqueta: string };

/** Constante solar: la irradiancia que llega al tope de la atmósfera, en W/m².
 *
 * No es un umbral elegido, es física: en la superficie NO se puede medir más que
 * esto. Sirve de filtro y hace falta uno, porque el histórico tiene irradiancia
 * sin calibrar de antes de mediados de 2025 y un solo día con un promedio de
 * 2.030 W/m² arruina el ajuste entero: es un punto con muchísima palanca en x.
 * Medido sobre los 195 días reales, dejarlo dentro tira la pendiente de 1,08 a
 * 0,41 W por W/m², el R² de 0,42 a 0,14, y hace que el ÚNICO día señalado sea ese
 * dato inválido, escondiendo los nueve días que de verdad rindieron de menos. */
export const CONSTANTE_SOLAR = 1361;

export type Depuracion = { usables: Punto[]; descartados: Punto[] };

/** Aparta los días cuya irradiancia es físicamente imposible. */
export function depurar(pts: Punto[]): Depuracion {
  const usables: Punto[] = [], descartados: Punto[] = [];
  for (const p of pts) (p.x > CONSTANTE_SOLAR ? descartados : usables).push(p);
  return { usables, descartados };
}

export type Ajuste = {
  /** Pendiente: cuánta potencia por cada W/m² de irradiancia. */
  m: number;
  b: number;
  /** Fracción de la varianza de y que explica x. Es «cuánto explica el sol». */
  r2: number;
  n: number;
};

/** Mínimos cuadrados. null si no hay con qué (menos de 3 puntos, o x constante). */
export function ajusteLineal(pts: Punto[]): Ajuste | null {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;          // toda la irradiancia igual: no hay recta
  const m = sxy / sxx;
  const b = my - m * mx;
  // Con y constante no hay varianza que explicar. Devolver 1 sería decir «el sol
  // lo explica todo» cuando lo cierto es que no hay nada que explicar.
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { m, b, r2, n };
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Atipico = {
  punto: Punto;
  /** Cuánto le faltó respecto de la recta, en las unidades de y. Siempre > 0. */
  faltante: number;
  z: number;
};

/**
 * Días que generaron MENOS de lo que su irradiancia predecía.
 *
 * El criterio es una z ROBUSTA sobre los residuos: `0,6745·(r − mediana)/MAD`, la
 * misma que ya usa la detección de anomalías del proyecto. No es la desviación
 * estándar de siempre, y la diferencia importa: la desviación estándar la inflan
 * los propios valores atípicos, así que unos pocos días muy malos suben el umbral
 * y terminan escondiéndose entre ellos. La mediana y la MAD no se mueven por eso.
 *
 * Solo se marcan los de ABAJO. Un punto por encima de la recta puede ser un
 * piranómetro leyendo de menos, pero eso no es un problema del arreglo y mandaría
 * a revisar el sitio equivocado.
 */
export function atipicosBajos(pts: Punto[], aj: Ajuste, umbral = 3.5): Atipico[] {
  const res = pts.map((p) => p.y - (aj.m * p.x + aj.b));
  const med = mediana(res);
  const mad = mediana(res.map((r) => Math.abs(r - med)));
  if (mad === 0) return [];            // sin dispersión no hay atípico posible
  return pts
    .map((p, i) => ({ punto: p, faltante: -res[i], z: (0.6745 * (res[i] - med)) / mad }))
    .filter((a) => a.z <= -umbral && a.faltante > 0)
    .sort((a, b) => b.faltante - a.faltante);
}
