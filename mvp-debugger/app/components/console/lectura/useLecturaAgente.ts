"use client";
import { useState } from "react";

import { jpost } from "@/app/lib/client";
import { MEDICION_OCULTA, type IdModo } from "@/app/components/console/modos";
import type { Revelar } from "./props";
import type { Paso } from "./resultados";

/** El turno del agente y, con la medición oculta, la revelación posterior. */
export function useLecturaAgente({ pregunta, contexto, modo, revelar }: {
  pregunta: string; contexto: string; modo: IdModo; revelar?: Revelar | null;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [costo, setCosto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verTraza, setVerTraza] = useState(false);
  const [revelado, setRevelado] = useState<{ real: number } | "cargando" | null>(null);
  const [errRevelar, setErrRevelar] = useState<string | null>(null);
  const oculta = modo === MEDICION_OCULTA;

  /** La consulta de revelación. La hace la consola, y recién cuando se la pide. */
  async function revelarMedido() {
    if (!revelar) return;
    setRevelado("cargando"); setErrRevelar(null);
    const r = await jpost<any>("/api/predictivo/forecast", {
      variable: revelar.variable, horizon_seconds: revelar.horizonte_seg,
      ahora: revelar.ahora,
    });
    const medido = (r.data as any)?.medido;
    if (!r.ok || !medido) {
      setRevelado(null);
      setErrRevelar(!r.ok ? ((r.data as any)?.detail || `error ${r.status}`)
                          : "el sensor no registró nada en ese instante");
      return;
    }
    setRevelado({ real: medido.valor });
  }

  async function analizar() {
    setCargando(true); setError(null); setRespuesta(""); setPasos([]); setVerTraza(false);
    setRevelado(null); setErrRevelar(null);
    // Un solo turno: no es una conversación, es una lectura puntual. Por eso no
    // reusa el hilo del widget flotante (ni lo ensucia).
    const r = await jpost<any>("/api/predictivo/chat", {
      mensajes: [{ rol: "user", texto: pregunta }], contexto, modo,
    });
    setCargando(false);
    if (!r.ok) { setError((r.data as any)?.detail || (r.data as any)?.error || `error ${r.status}`); return; }
    setRespuesta(r.data?.respuesta || "(sin respuesta)");
    setPasos(r.data?.pasos || []);
    setUsage(r.data?.usage || null);
    setMs(r.data?.ms_total ?? null);
    setCosto(r.data?.costo?.usd_total ?? null);
    // Recién ACÁ, con la respuesta del agente ya en la mano, se consulta lo que
    // midió el sensor. El orden no depende de que alguien apriete un botón.
    if (oculta) await revelarMedido();
  }

  return {
    respuesta, pasos, usage, ms, costo, cargando, error, verTraza, setVerTraza,
    revelado, errRevelar, oculta, analizar,
  };
}
