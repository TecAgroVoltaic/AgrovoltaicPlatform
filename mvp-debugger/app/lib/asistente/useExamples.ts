"use client";
// Junta lo que necesitan los ejemplos del estado vacío: la cobertura (caché de
// sesión, compartida con el calendario) y la última alerta de planta sin
// generar. Ninguna de las dos bloquea: mientras llegan, o si fallan, los
// ejemplos salen sin fecha. Una alerta que no se pudo leer solo cambia la
// pregunta de diagnóstico por la genérica; no es un error que mostrar acá, la
// vista de Alertas es la que lo reporta.
import { useEffect, useState } from "react";

import { fetchLatestOpenOutage } from "@/app/lib/alertas/client";
import type { CoverageBounds } from "@/app/lib/analitica/contracts/daysWithData";
import type { IsoDate } from "@/app/lib/analitica/dateRange";
import { useDaysWithData } from "@/app/lib/analitica/useDaysWithData";
import { buildExamples, type Example } from "@/app/lib/asistente/examples";

export type AssistantExamples = {
  readonly examples: readonly Example[];
  /** null mientras carga, si falló o si la base está vacía. */
  readonly bounds: CoverageBounds | null;
};

function useLatestOutageDate(): IsoDate | null {
  const [latestOutageDate, setLatestOutageDate] = useState<IsoDate | null>(null);
  useEffect(() => {
    let mounted = true;
    void fetchLatestOpenOutage().then((result) => {
      if (mounted && result.ok) setLatestOutageDate(result.data?.lastDate ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return latestOutageDate;
}

export function useExamples(): AssistantExamples {
  const daysWithData = useDaysWithData();
  const latestOutageDate = useLatestOutageDate();
  const coverage = daysWithData.status === "ready" ? daysWithData : null;
  return {
    examples: buildExamples({ coverage, latestOutageDate }),
    bounds: coverage?.bounds ?? null,
  };
}
