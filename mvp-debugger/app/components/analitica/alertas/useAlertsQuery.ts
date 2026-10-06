"use client";
// La consulta de /alertas leída y escrita en la URL. La URL es la única fuente
// de verdad, igual que el rango (`useDateRange`): dos copias producirían
// enlaces compartidos que muestran otra cosa de la que se estaba mirando.
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  alertsQueryToSearch,
  parseAlertsQuery,
  reduceAlertsQuery,
  type AlertsQuery,
  type AlertsQueryChange,
} from "@/app/lib/alertas/query";

/** `replace` para lo que se escribe de a una tecla (la búsqueda): con `push`,
 *  «atrás» recorrería letra por letra en vez de volver a la vista anterior. */
export type HistoryMode = "push" | "replace";

export type AlertsQueryController = {
  readonly query: AlertsQuery;
  readonly change: (change: AlertsQueryChange, mode?: HistoryMode) => void;
};

export function useAlertsQuery(): AlertsQueryController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseAlertsQuery(searchParams), [searchParams]);

  const change = useCallback(
    (next: AlertsQueryChange, mode: HistoryMode = "push") => {
      const url = `${pathname}${alertsQueryToSearch(reduceAlertsQuery(query, next), searchParams)}`;
      // `scroll: false`: abrir una ficha o filtrar no tiene por qué devolver la
      // página al principio y perder la fila que se estaba mirando.
      if (mode === "replace") router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, searchParams, query],
  );

  return { query, change };
}
