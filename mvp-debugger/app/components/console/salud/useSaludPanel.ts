"use client";
import { useEffect, useState } from "react";

import { jget, mensajeError } from "@/app/lib/client";
import type { Panel } from "./tipos";

const RUTA = "/api/predictivo/salud/panel";
export const REFRESCO_MS = 30000;
// Último panel leído, a nivel de módulo. La vista se desmonta al cambiar de
// sección y se vuelve a montar al volver: sin esto, cada visita arrancaba en
// blanco y esperaba el viaje completo. Con esto, se ve al instante lo último
// que se supo y se refresca por detrás. Es un cache de pantalla, no de datos:
// muere con la pestaña, y `consultado_en` dice de cuándo es lo que se muestra.
let ultimoPanel: Panel | null = null;

/** El panel de salud, refrescado cada `REFRESCO_MS`, arrancando del último leído. */
export function useSaludPanel() {
  const [panel, setPanel] = useState<Panel | null>(ultimoPanel);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(ultimoPanel === null);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const r = await jget<Panel>(RUTA);
      if (!vivo) return;
      setCargando(false);
      if (!r.ok || !r.data?.ingesta) { setError(mensajeError(r)); return; }
      setError(null);
      ultimoPanel = r.data;
      setPanel(r.data);
    }
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  return { panel, error, cargando };
}
