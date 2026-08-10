"use client";
// Indicador de salud de un servicio (ping a /api/<svc>/health).
import { useEffect, useState } from "react";
import { jget } from "@/app/lib/client";

export function Health({ servicio, nombre }: { servicio: string; nombre: string }) {
  const [estado, setEstado] = useState<"…" | "ok" | "caido">("…");
  const [detalle, setDetalle] = useState<any>(null);

  async function ping() {
    const r = await jget(`/api/${servicio}/health`);
    if (r.ok && r.data?.status === "ok") {
      setEstado("ok");
      setDetalle(r.data);
    } else {
      setEstado("caido");
      setDetalle(r.data);
    }
  }

  useEffect(() => {
    ping();
    const id = setInterval(ping, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={`health health-${estado}`} title={JSON.stringify(detalle)}>
      <span className="dot" /> {nombre}: {estado}
      {detalle?.tools && <span className="muted"> · {detalle.tools.length} tools</span>}
    </span>
  );
}
