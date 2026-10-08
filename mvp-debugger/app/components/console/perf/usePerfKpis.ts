"use client";
import { useEffect, useState } from "react";

import { jpost, mensajeError, type Resp } from "@/app/lib/client";

/** Los cuatro indicadores del histórico, desde las tools del Histórico. */
export function usePerfKpis(intento: number) {
  const [kpi, setKpi] = useState<any>(null);
  const [errKpi, setErrKpi] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      jpost("/api/historico/tool/energia_por_arreglo", {}),
      jpost("/api/historico/tool/performance_ratio", {}),
      jpost("/api/historico/tool/irradiancia_resumen", {}),
      jpost("/api/historico/tool/temperatura_por_arreglo", {}),
    ]).then(([e, pr, g, t]: Resp[]) => {
      const fallidas = [e, pr, g, t].filter((r) => !r.ok);
      setErrKpi(fallidas.length ? mensajeError(fallidas[0]) : null);
      setKpi({ e: e.data || {}, pr: pr.data || {}, g: g.data || {}, t: t.data || {} });
    }).catch((e) => setErrKpi(String(e?.message || e)));
  }, [intento]);

  return { kpi, errKpi };
}
