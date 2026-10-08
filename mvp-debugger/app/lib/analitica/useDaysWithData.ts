"use client";
// Qué días traen datos, pedido UNA vez por sesión.
//
// La lista cambia una vez por día como mucho (cuando entra la carga nueva), y la
// piden a la vez el formulario de la barra de rango y el del chip de contexto:
// por eso la promesa vive en el MÓDULO y no en el componente. Una falla no se
// queda en caché: el próximo montaje vuelve a intentar.
//
// Nunca bloquea: mientras carga, si falla o si la base está vacía, el
// calendario deja elegir cualquier día y lo dice. Una falla de red no puede
// dejar a la persona sin poder cambiar el rango.
import { useEffect, useState } from "react";

import { fetchResource, type AnalyticsDeps } from "@/app/lib/analitica/client";
import {
  daysWithDataSchema,
  type CoverageBounds,
  type DaysWithData,
} from "@/app/lib/analitica/contracts/daysWithData";
import type { AnalyticsFailure } from "@/app/lib/analitica/errors";

const DAYS_WITH_DATA_PATH = "analitica/dias-con-datos";

export type DaysWithDataState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly days: ReadonlySet<string>;
      readonly bounds: CoverageBounds;
      /** Los días de cada fuente por separado: un día eléctrico no trae radiación. */
      readonly daysBySource: DaysWithData["daysBySource"];
    }
  /** La base respondió bien pero no tiene ningún día con datos. */
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly failure: AnalyticsFailure };

const LOADING: DaysWithDataState = { status: "loading" };

let pendingLoad: Promise<DaysWithDataState> | null = null;
let settledState: DaysWithDataState | null = null;

/**
 * Pide los días con datos, o devuelve la petición que ya está en curso.
 * Nunca lanza: los fallos vuelven como `status: "error"`.
 */
export function loadDaysWithData(deps: AnalyticsDeps = {}): Promise<DaysWithDataState> {
  if (pendingLoad) return pendingLoad;
  const load = requestDaysWithData(deps).then((state) => {
    if (state.status === "error") pendingLoad = null;
    else settledState = state;
    return state;
  });
  pendingLoad = load;
  return load;
}

async function requestDaysWithData(deps: AnalyticsDeps): Promise<DaysWithDataState> {
  const result = await fetchResource({ path: DAYS_WITH_DATA_PATH, schema: daysWithDataSchema }, deps);
  if (!result.ok) return { status: "error", failure: result.failure };
  const { bounds, days, daysBySource } = result.data;
  if (bounds === null || days.length === 0) return { status: "empty" };
  return { status: "ready", days: new Set(days), bounds, daysBySource };
}

/** Olvida lo pedido. Solo para tests: en la app la caché dura la sesión. */
export function resetDaysWithDataCache(): void {
  pendingLoad = null;
  settledState = null;
}

/** Los días con datos para el calendario; ver `DaysWithDataState`. */
export function useDaysWithData(): DaysWithDataState {
  const [state, setState] = useState<DaysWithDataState>(() => settledState ?? LOADING);

  useEffect(() => {
    if (settledState) return;
    let mounted = true;
    void loadDaysWithData().then((next) => {
      if (mounted) setState(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
