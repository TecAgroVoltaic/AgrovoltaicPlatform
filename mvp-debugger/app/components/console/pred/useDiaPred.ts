"use client";
import { useEffect, useMemo, useState } from "react";

import { jget, mensajeError, type Resp } from "@/app/lib/client";
import { moverDias } from "@/app/lib/tiempo";
import { diaSiguiente, HORA_EN_ISO, LARGO_FECHA_ISO } from "./catalogo";

type Rango = { desde: string; hasta: string };

/** El rango disponible, el día elegido a su resolución y el momento dentro de él. */
export function useDiaPred(vari: string, bucket: string) {
  const [fecha, setFecha] = useState("");
  const [momento, setMomento] = useState("");        // "HH:MM"
  const [rango, setRango] = useState<Rango | null>(null);
  const [dia, setDia] = useState<any>(null);
  const [errDia, setErrDia] = useState<string | null>(null);

  // 1. Rango disponible -> día por defecto: el último COMPLETO (el del último
  //    dato viene cortado a media madrugada y no se ve nada).
  //
  //    El rango se recuerda en localStorage porque, si no, la vista queda
  //    SECUENCIAL: hay que esperar a /serie para saber qué día pedir, y recién
  //    entonces sale la llamada del gráfico. Con el rango recordado las dos
  //    salen a la vez y la revalidación corrige si la ingesta avanzó.
  useEffect(() => {
    setDia(null); setErrDia(null);
    const clave = `agrov-rango-${vari}`;
    const aplicar = (r: Rango, esCache: boolean) => {
      setRango(r);
      const porDefecto = moverDias(r.hasta, -1);
      // Del caché solo se toma el día inicial; si el usuario ya eligió otro, no
      // se le pisa la selección cuando llega la revalidación.
      setFecha((f) => (esCache || !f ? porDefecto : f));
    };
    let cacheado: Rango | null = null;
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado) cacheado = JSON.parse(guardado);
    } catch { /* caché corrupto: se ignora y manda la red */ }
    if (cacheado) aplicar(cacheado, true);

    jget(`/api/predictivo/serie?variable=${vari}&bucket=D&ultimos_dias=1`).then((r: Resp) => {
      const resumen = r.ok ? (r.data as any)?.resumen : null;
      if (!resumen?.hasta) { if (!cacheado) setRango(null); return; }
      const nuevo = { desde: resumen.desde.slice(0, LARGO_FECHA_ISO), hasta: resumen.hasta.slice(0, LARGO_FECHA_ISO) };
      try { localStorage.setItem(clave, JSON.stringify(nuevo)); } catch { /* modo privado */ }
      setRango(nuevo);
      // El día por defecto solo se recalcula si el rango cambió respecto al
      // caché: si no, se respeta lo que ya se está mostrando.
      if (!cacheado || cacheado.hasta !== nuevo.hasta) aplicar(nuevo, !cacheado);
    });
  }, [vari]);

  // 2. El día elegido a la resolución elegida: única fuente de la vista.
  useEffect(() => {
    if (!fecha) return;
    setDia(null); setErrDia(null);
    jget(`/api/predictivo/backtest?variable=${vari}&desde=${fecha}`
         + `&hasta=${diaSiguiente(fecha)}&bucket=${bucket}`)
      .then((r: Resp) => {
        if (!r.ok) { setErrDia(mensajeError(r)); return; }
        const pts = (r.data as any)?.puntos;
        if (!Array.isArray(pts) || !pts.length) { setErrDia("ese día no devolvió puntos"); return; }
        setDia(r.data);
        const etiquetas = pts.map((p: any) => p.t.slice(...HORA_EN_ISO));
        // Se elige entre los momentos que SÍ existen: no hay selección inválida.
        setMomento((m) => (etiquetas.includes(m) ? m : etiquetas[Math.floor(etiquetas.length / 2)]));
      });
  }, [vari, fecha, bucket]);

  const momentos: string[] = useMemo(
    () => (dia?.puntos || []).map((p: any) => p.t.slice(...HORA_EN_ISO)), [dia]);

  return { fecha, setFecha, momento, setMomento, rango, dia, errDia, momentos };
}
