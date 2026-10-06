// Vista Alertas: lo que pide atención de una persona, derivado de los hallazgos
// de calidad. La cabecera es servidor y la lista es cliente (lee rango y
// filtros de la URL), así que el cuerpo va bajo <Suspense> igual que en Calidad.
import { Suspense } from "react";
import type { Metadata } from "next";

import { AlertasView } from "@/app/components/analitica/alertas/AlertasView";
import { findSection } from "@/app/components/analitica/sections";
import styles from "@/app/components/analitica/alertas/alertas.module.css";

export const metadata: Metadata = { title: "Alertas · AgroVoltaic" };

const SECTION_PATH = "/alertas";

export default function AlertasPage() {
  const section = findSection(SECTION_PATH);
  return (
    <div className={`vista ${styles.medida}`}>
      <header className="phead">
        <h1>{section?.label ?? "Alertas"}</h1>
        <p>{section?.description}</p>
      </header>
      <Suspense fallback={<p className="muted">Cargando las alertas…</p>}>
        <AlertasView />
      </Suspense>
    </div>
  );
}
