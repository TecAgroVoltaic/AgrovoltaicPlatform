// Series temporales por tramos: completar huecos, reagrupar y comparar contra una
// referencia. Puro, sin React ni red, porque es donde vive lo que puede estar mal
// sin que se vea.
//
// El defecto que motiva este archivo: `/datos/serie` agrupa con `date_trunc` y
// devuelve SOLO los tramos que tienen datos. Los que faltan no vienen vacíos, no
// vienen. Como el eje X del gráfico va por índice y no por tiempo, dos puntos
// separados por cuatro meses de nada quedaban pegados y unidos por una recta: el
// gráfico dibujaba una línea continua sobre el hueco de enero a abril de 2025. En
// un proyecto cuyo hallazgo principal es que faltan 295 de 569 días, el gráfico
// principal era el que los tapaba.

export type PuntoSerie = { t: string; v: number | null; n: number };

const DIA = 86400000;

/** El día (UTC) de un `date_trunc(...)::text` de Postgres. */
function fecha(t: string): Date {
  return new Date(`${String(t).slice(0, 10)}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** El tramo siguiente, según el grano. `month` respeta los meses de distinto largo. */
export function siguiente(d: Date, bucket: string): Date {
  if (bucket === "month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return new Date(d.getTime() + (bucket === "week" ? 7 : 1) * DIA);
}

/** El tramo al que pertenece un día. Igual que `date_trunc` de Postgres:
 *  la semana arranca el LUNES y el mes el día 1. */
export function tramoDe(d: Date, bucket: string): Date {
  if (bucket === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  if (bucket === "week") {
    const dow = (d.getUTCDay() + 6) % 7;          // 0 = lunes
    return new Date(d.getTime() - dow * DIA);
  }
  return d;
}

/**
 * Inserta los tramos que faltan con `v: null`.
 *
 * El gráfico ya sabe qué hacer con un null: corta la línea. Lo que no podía era
 * adivinar que faltaba un tramo que directamente no estaba en la lista. Y de paso
 * arregla el eje: al ocupar su lugar, un hueco de cuatro meses mide cuatro veces
 * lo que un paso de un mes, en vez de no medir nada.
 */
export function completar(puntos: PuntoSerie[], bucket: string): PuntoSerie[] {
  if (puntos.length < 2) return puntos;
  const salida: PuntoSerie[] = [];
  let cursor = fecha(puntos[0].t);
  for (const p of puntos) {
    const propio = fecha(p.t);
    // Tope defensivo: con datos corruptos (un `t` fuera de orden) esto podría no
    // terminar nunca y colgar la pestaña.
    let guarda = 0;
    while (cursor < propio && guarda++ < 5000) {
      salida.push({ t: iso(cursor), v: null, n: 0 });
      cursor = siguiente(cursor, bucket);
    }
    salida.push({ ...p, t: iso(propio) });
    cursor = siguiente(propio, bucket);
  }
  return salida;
}

/**
 * Reagrupa una serie DIARIA en tramos más gruesos, ponderando por cuántas
 * lecturas tuvo cada día.
 *
 * La ponderación no es un refinamiento: promediar los promedios diarios sin pesos
 * le da el mismo voto a un día con 4 lecturas que a uno con 288, y en este
 * histórico esa diferencia existe de verdad (la cadencia pasó de 2 s a 1 min a
 * 5 min según la época).
 */
export function agrupar(diarios: PuntoSerie[], bucket: string): PuntoSerie[] {
  if (bucket === "day") return diarios;
  const acc = new Map<string, { suma: number; n: number }>();
  for (const p of diarios) {
    if (p.v == null || !isFinite(p.v)) continue;
    const k = iso(tramoDe(fecha(p.t), bucket));
    const a = acc.get(k) || { suma: 0, n: 0 };
    const peso = p.n > 0 ? p.n : 1;
    a.suma += p.v * peso;
    a.n += peso;
    acc.set(k, a);
  }
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([t, a]) => ({ t, v: a.suma / a.n, n: a.n }));
}

/** Alinea una serie contra las etiquetas de otra. Lo que no esté, queda en null. */
export function alinear(puntos: PuntoSerie[], etiquetas: string[]): (number | null)[] {
  const m = new Map(puntos.map((p) => [p.t, p.v]));
  return etiquetas.map((t) => {
    const v = m.get(t);
    return v == null || !isFinite(v) ? null : v;
  });
}

export type Divergencia = { t: string; medida: number; esperada: number; caida: number };

/**
 * Tramos donde lo medido quedó muy por debajo de lo que su referencia predecía.
 *
 * `fraccion` es cuánto tiene que faltar respecto de lo esperado para señalarlo.
 * Es un umbral elegido y no física: por eso se pasa, no se esconde.
 */
export function divergencias(medida: (number | null)[], esperada: (number | null)[],
                             etiquetas: string[], fraccion = 0.35): Divergencia[] {
  const salida: Divergencia[] = [];
  for (let i = 0; i < etiquetas.length; i++) {
    const m = medida[i], e = esperada[i];
    if (m == null || e == null || !(e > 0)) continue;
    const caida = (e - m) / e;
    if (caida >= fraccion) salida.push({ t: etiquetas[i], medida: m, esperada: e, caida });
  }
  return salida.sort((a, b) => b.caida - a.caida);
}
