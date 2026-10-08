"use client";
import { useEffect, useMemo, useState } from "react";

import { ajusteLineal, CONSTANTE_SOLAR, type Punto } from "@/app/lib/regresion";
import { agrupar, alinear, completar, recortar } from "@/app/lib/serie";
import { clave, type Diarias, type Periodo, type Referencia, type SerieDibujada, type Variable } from "./tipos";

const PREFIJO_DEL_SIGLO = 2;

/**
 * Todo lo que se deriva de las series diarias ya descargadas: la serie del
 * período, la nube diaria y la referencia. Sin red: cambiar de período o de
 * variable es aritmética sobre lo que ya está.
 */
export function useRendimiento({ diarias, listo, V, P, vari, period }: {
  diarias: Diarias; listo: boolean; V: Variable; P: Periodo; vari: string; period: string;
}) {
  const [scat, setScat] = useState<Punto[] | null>(null);
  const ghiDiaria = diarias[clave("radiacion_calibrada", "irradiancia_incidente_wm2")];

  // La serie que se dibuja: recortar al período, reagrupar al grano y completar
  // los tramos vacíos.
  const series = useMemo((): SerieDibujada | null => {
    if (!listo) return null;
    const llenas = V.cols.map(([c]) =>
      completar(agrupar(recortar(diarias[clave(V.tabla, c)], P.desde, P.hasta), P.bucket), P.bucket));
    if (!llenas[0]?.length) return null;
    return {
      fechas: llenas[0].map((p) => p.t),
      labels: llenas[0].map((p) => p.t.slice(PREFIJO_DEL_SIGLO)),
      cols: llenas.map((l) => l.map((p) => p.v)),
      muestras: llenas[0].map((p) => p.n),
    };
  }, [listo, diarias, vari, period]);

  // La nube de puntos: siempre por día, siempre del período elegido.
  useEffect(() => {
    if (!listo) { setScat(null); return; }
    const pv1 = new Map(recortar(diarias[clave("electrico_corregido", "potencia_pv1_w")],
                                 P.desde, P.hasta).map((p) => [p.t, p.v]));
    setScat(recortar(ghiDiaria, P.desde, P.hasta)
      .filter((g) => g.v != null && g.v > 0 && (pv1.get(g.t) ?? 0) > 0)
      .map((g) => ({ x: g.v as number, y: pv1.get(g.t) as number, etiqueta: g.t })));
  }, [listo, diarias, period]);

  // ── La referencia: qué potencia predice el sol de cada tramo ────────────────
  //
  // Es lo que convierte la serie en un diagnóstico. Una caída de potencia sola no
  // distingue «hubo menos sol» de «algo se rompió», y hasta ahora había que
  // alternar entre las variables «Potencia» e «Irradiancia» y comparar de
  // memoria, que es justo lo que un gráfico debería ahorrar.
  //
  // La referencia se calcula con el ajuste DIARIO de cada arreglo aplicado a la
  // irradiancia del tramo. Vale hacerlo así porque la recta es lineal: el
  // promedio de `m·x + b` es `m·(promedio de x) + b`, así que ajustar por día y
  // evaluar por semana es exacto, no una aproximación.
  const referencia = useMemo((): Referencia | null => {
    if (vari !== "pot" || !listo || !series) return null;
    const ghiPeriodo = recortar(ghiDiaria, P.desde, P.hasta);
    const ghiTramo = alinear(agrupar(ghiPeriodo, P.bucket), series.fechas);
    const rectas = (["potencia_pv1_w", "potencia_pv2_w"] as const).map((col) => {
      const pot = new Map(recortar(diarias[clave("electrico_corregido", col)], P.desde, P.hasta)
        .map((p) => [p.t, p.v]));
      const pares: Punto[] = ghiPeriodo
        .filter((g) => g.v != null && g.v <= CONSTANTE_SOLAR && (pot.get(g.t) ?? 0) > 0)
        .map((g) => ({ x: g.v as number, y: pot.get(g.t) as number, etiqueta: g.t }));
      return ajusteLineal(pares);
    });
    if (!rectas[0]) return null;
    return {
      esperadas: rectas.map((r) =>
        r ? ghiTramo.map((g) => (g == null ? null : r.m * g + r.b)) : null),
      rectas,
    };
  }, [vari, listo, series, diarias, period]);

  return { series, scat, referencia };
}
