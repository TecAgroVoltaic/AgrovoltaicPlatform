"use client";
import { useEffect, useState } from "react";
import { jget } from "@/app/lib/client";
import type { Punto } from "@/app/components/Sparkline";
import { TIPO_GRAFICABLE, type Columna, type Muestra, type Rel } from "./types";

const FILAS_DE_MUESTRA = 15;

/** Estado y peticiones del explorador: relaciones, muestra, columnas y serie. */
export function useDataExplorer() {
  const [rels, setRels] = useState<Rel[]>([]);
  const [sel, setSel] = useState<string>("");
  const [cols, setCols] = useState<Columna[]>([]);
  const [muestra, setMuestra] = useState<Muestra | null>(null);
  const [serieCol, setSerieCol] = useState<string>("");
  const [bucket, setBucket] = useState<string>("month");
  const [agg, setAgg] = useState<string>("avg");
  const [puntos, setPuntos] = useState<Punto[] | null>(null);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    jget<{ relaciones: Rel[] }>("/api/historico/datos/tablas").then((r) => {
      if (r.ok) setRels(r.data.relaciones);
      else setMsg(JSON.stringify(r.data));
    });
  }, []);

  async function elegir(clave: string) {
    setSel(clave);
    setMuestra(null);
    setPuntos(null);
    setSerieCol("");
    const [m, c] = await Promise.all([
      jget(`/api/historico/datos/muestra?tabla=${clave}&limit=${FILAS_DE_MUESTRA}`),
      jget(`/api/historico/datos/columnas?tabla=${clave}`),
    ]);
    if (m.ok) setMuestra(m.data);
    if (c.ok) {
      setCols(c.data.columnas);
      const num = c.data.columnas.find((x: any) => TIPO_GRAFICABLE.test(x.tipo));
      setSerieCol(num?.nombre || "");
    }
  }

  async function graficar() {
    if (!sel || !serieCol) return;
    setPuntos(null);
    const r = await jget(
      `/api/historico/datos/serie?tabla=${sel}&columna=${serieCol}&bucket=${bucket}&agg=${agg}`,
    );
    if (r.ok) setPuntos(r.data.puntos.map((p: any) => ({ t: p.t, v: p.v })));
    else setMsg(JSON.stringify(r.data));
  }

  return {
    rels, sel, cols, muestra, serieCol, bucket, agg, puntos, msg,
    setSerieCol, setBucket, setAgg, elegir, graficar,
  };
}
