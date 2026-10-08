"use client";
import { useEffect, useState } from "react";

import { jget, mensajeError } from "@/app/lib/client";
import { normalizar } from "./normalizar";
import type { Dia, Hallazgo, Resumen } from "./tipos";

const RUTA = "/api/historico";

/** Resumen y mapa de días al montar; los hallazgos del día elegido al cambiarlo. */
export function useCalidad() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [dias, setDias] = useState<Dia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Hallazgo[] | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([jget(`${RUTA}/calidad/resumen`), jget(`${RUTA}/calidad/dias`)])
      .then(([r, d]) => {
        if (!vivo) return;
        if (!r.ok) return setError(mensajeError(r));
        if (!d.ok) return setError(mensajeError(d));
        setResumen(normalizar(r.data));
        setDias(d.data?.dias ?? []);
        setError(null);
      });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!sel) return setDetalle(null);
    let vivo = true;
    setDetalle(null);
    jget(`${RUTA}/calidad/hallazgos?fecha=${sel}`).then((r) => {
      if (vivo) setDetalle(r.ok ? r.data?.hallazgos ?? [] : []);
    });
    return () => { vivo = false; };
  }, [sel]);

  return { resumen, dias, error, sel, setSel, detalle };
}
