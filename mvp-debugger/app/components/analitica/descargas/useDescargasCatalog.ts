"use client";
// Baja el catálogo de lo exportable y avisa cuando llegó, para que la vista
// elija la fuente y el conjunto de datos iniciales en el mismo render.
import { useEffect, useState } from "react";

import { jget, mensajeError, type Resp } from "@/app/lib/client";

import { CATALOG_PATH, NOT_FOUND_STATUS } from "./constants";
import type { ExportCatalog } from "./types";

// 404 = el servicio del histórico es una versión anterior, sin exportación:
// decirlo, porque "Not Found" a secas parece un error de la consola.
const OUTDATED_SERVICE_MESSAGE =
  "el agente histórico desplegado es una versión anterior sin exportación de datos: hay que reconstruir su contenedor en el servidor";
const MISSING_SOURCES_MESSAGE = 'respuesta inesperada: falta "fuentes"';

export type DescargasCatalog = {
  readonly catalog: ExportCatalog | null;
  readonly error: string | null;
  readonly retry: () => void;
};

export function useDescargasCatalog(onLoaded: (catalog: ExportCatalog) => void): DescargasCatalog {
  const [catalog, setCatalog] = useState<ExportCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null); setCatalog(null);
    jget(CATALOG_PATH).then((r: Resp) => {
      if (!r.ok || !Array.isArray(r.data?.fuentes)) {
        setError(r.status === NOT_FOUND_STATUS ? OUTDATED_SERVICE_MESSAGE : r.ok ? MISSING_SOURCES_MESSAGE : mensajeError(r));
        return;
      }
      const loaded: ExportCatalog = r.data;
      setCatalog(loaded);
      onLoaded(loaded);
    }).catch((e) => setError(String(e?.message || e)));
    // `onLoaded` cambia en cada render y solo importa al llegar el catálogo:
    // seguirlo volvería a bajarlo sin parar. Se baja de nuevo solo al reintentar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return { catalog, error, retry: () => setAttempt((current) => current + 1) };
}
