"use client";
// El catálogo de tablas, traducido a los cuatro estados de la pantalla.
//
// Es la ÚNICA petición de esta vista: el archivo no se pide por fetch, lo baja
// el navegador siguiendo un enlace. Así que acá no hay cascada que evitar ni
// peticiones que coordinar, solo un resultado que contar bien.
import { useCallback, useEffect, useState } from "react";

import {
  emptyChart,
  errorChart,
  loadingChart,
  readyChart,
  type ChartState,
} from "@/app/components/charts";
import { isRetryable, type AnalyticsResult } from "@/app/lib/analitica/errors";
import { loadExportRelations } from "@/app/components/analitica/descargas/loadRelations";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type RelationsState = ChartState<readonly ExportRelation[]>;

/** Vacío CON motivo: un formulario sin tablas se leería como aplicación rota. */
const NO_RELATIONS_MESSAGE = "El servicio de análisis no publicó ninguna tabla exportable.";

export type ExportRelationsController = {
  readonly state: RelationsState;
  readonly reload: () => void;
};

export function useExportRelations(): ExportRelationsController {
  const [state, setState] = useState<RelationsState>(() => loadingChart());
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState(loadingChart());
    loadExportRelations().then((result) => {
      // Ya se desmontó o se pidió de nuevo: pintar esto sobrescribiría lo bueno.
      if (cancelled) return;
      setState(toState(result, reload));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, reload]);

  return { state, reload };
}

function toState(
  result: AnalyticsResult<readonly ExportRelation[]>,
  reload: () => void,
): RelationsState {
  if (!result.ok) {
    // Reintentar solo se ofrece cuando puede arreglar algo: una sesión vencida y
    // un contrato roto no se arreglan pulsando otra vez.
    return isRetryable(result.failure)
      ? errorChart(result.failure.message, reload)
      : errorChart(result.failure.message);
  }
  if (result.data.length === 0) return emptyChart("NO_ROWS", { message: NO_RELATIONS_MESSAGE });
  return readyChart(result.data);
}
