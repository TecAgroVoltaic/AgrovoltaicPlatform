"use client";
import { useEffect, useState } from "react";

import { jget } from "@/app/lib/client";

const PING_MS = 15000;

/** Salud del servicio del agente activo, consultada cada `PING_MS`. */
export function useServicioVivo(agent: string) {
  const [up, setUp] = useState(true);

  useEffect(() => {
    let vivo = true;
    const ping = () => jget(`/api/${agent}/health`).then((r) => { if (vivo) setUp(r.ok && r.data?.status === "ok"); });
    ping(); const id = setInterval(ping, PING_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [agent]);

  return up;
}
