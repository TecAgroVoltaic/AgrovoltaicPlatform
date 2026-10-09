"use client";
// «Fuentes de datos»: una tarjeta por fuente, con su contenido plegado. Un solo
// contenido abierto a la vez: con las ~30 cajas de Cartago desplegadas al lado
// de las tablas PV la pantalla dejaría de ser un resumen.
import { useState } from "react";

import { formatLocalStamp } from "@/app/components/analitica/tablero/format";
import { SourceCard } from "@/app/components/fuentes/SourceCard";
import { useSourcesCatalog } from "@/app/components/fuentes/useSourcesCatalog";
import type { SourceId } from "@/app/lib/fuentes/registry";
import styles from "@/app/components/fuentes/fuentes.module.css";

export function FuentesView() {
  const state = useSourcesCatalog();
  const [openId, setOpenId] = useState<SourceId | null>(null);

  if (state.status === "loading") {
    return (
      <p className={styles.state} role="status">
        Leyendo el inventario de fuentes… la primera consulta puede tardar unos segundos.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className={`alert ${styles.state}`} role="alert">
        <strong>No se pudo leer el inventario de fuentes.</strong> {state.message}
        {state.onRetry ? (
          <button type="button" className="btn-sm" onClick={state.onRetry}>Reintentar</button>
        ) : null}
      </div>
    );
  }
  if (state.status === "empty") {
    return <p className={styles.state} role="status">{state.reason.message}</p>;
  }

  return (
    <>
      <p className="muted small mono">Inventario armado {formatLocalStamp(state.data.generatedAt)}</p>
      <div className={styles.grid}>
        {state.data.sources.map((entry) => (
          <SourceCard
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
          />
        ))}
      </div>
    </>
  );
}
