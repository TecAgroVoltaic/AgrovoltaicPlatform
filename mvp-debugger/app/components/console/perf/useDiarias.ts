"use client";
import { useEffect, useState } from "react";

import { jget, extraerLista, type Resp } from "@/app/lib/client";
import { q } from "@/app/components/console/perfCatalogo";
import type { PuntoSerie } from "@/app/lib/serie";
import { clave, type Diarias, type Variable } from "./tipos";

const LARGO_FECHA_ISO = 10;

/**
 * Una sola descarga por columna, y siempre DIARIA y de todo el histórico.
 *
 * Antes cada cambio de período o de variable disparaba de nuevo las series al
 * grano elegido: cinco viajes por clic, para datos que ya estaban. Ahora se
 * baja la serie diaria completa de cada columna una vez y TODO lo demás se
 * deriva: recortar el período es filtrar, y reagrupar a semana o mes es
 * promediar ponderando por lecturas.
 *
 * Derivar es EXACTO, no una aproximación: como `n` es cuántas lecturas tuvo
 * cada día, el promedio ponderado de los promedios diarios da el mismo número
 * que el promedio del tramo entero. La consola no puede discrepar del servicio.
 *
 * Y son datos chicos: una columna diaria de todo el histórico son unos cientos
 * de filas. Lo caro era la cantidad de viajes, no el tamaño.
 */
export function useDiarias(V: Variable, intento: number) {
  const [diarias, setDiarias] = useState<Diarias>({});
  const [errSerie, setErrSerie] = useState<string | null>(null);
  const [errScat, setErrScat] = useState<string | null>(null);

  // Las columnas que hacen falta. Las tres primeras van siempre: la nube de
  // puntos y la referencia «lo que su sol predice» las necesitan con cualquier
  // variable elegida.
  const necesarias: [string, string][] = [
    ["radiacion_calibrada", "irradiancia_incidente_wm2"],
    ["electrico_corregido", "potencia_pv1_w"],
    ["electrico_corregido", "potencia_pv2_w"],
    ...V.cols.map(([c]) => [V.tabla, c] as [string, string]),
  ];
  // Sin deduplicar, con la variable «Potencia» las dos columnas del arreglo
  // aparecen dos veces (van en la lista fija Y en las de la variable) y se
  // pedirían por duplicado en la primera carga.
  const faltan = [...new Set(necesarias.map(([t, c]) => clave(t, c)))]
    .filter((k) => !(k in diarias));
  const pendiente = faltan.join(",");

  useEffect(() => {
    if (!pendiente) return;
    const pedir = pendiente.split(",").map((k) => k.split("."));
    Promise.all(pedir.map(([t, c]) => jget(q(t, c, { bucket: "day" }))))
      .then((rs: Resp[]) => {
        const nuevas: Record<string, PuntoSerie[]> = {};
        for (let i = 0; i < rs.length; i++) {
          const e = extraerLista(rs[i], "puntos");
          if (e.error) { setErrSerie(e.error); setErrScat(e.error); return; }
          nuevas[pedir[i].join(".")] = e.lista.map((p: any) =>
            ({ t: String(p.t).slice(0, LARGO_FECHA_ISO), v: p.v, n: p.n ?? 0 }));
        }
        setErrSerie(null); setErrScat(null);
        setDiarias((d) => ({ ...d, ...nuevas }));
      })
      .catch((e) => { setErrSerie(String(e?.message || e)); });
  }, [pendiente, intento]);

  return { diarias, listo: !faltan.length, errSerie, errScat };
}
