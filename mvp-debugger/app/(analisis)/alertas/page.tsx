// Vista Alertas: lo que pide atención de una persona, derivado de los hallazgos
// de calidad.
//
// La sección pone su propia cabecera (`ownsHeader` en sections.ts): el cascarón
// no le agrega la barra de rango ni el pie, y acá no va la cabecera de página.
// El cuerpo es cliente (lee rango y filtros de la URL), así que va bajo
// <Suspense>.
import { Suspense } from "react";
import type { Metadata } from "next";

import { AlertasView } from "@/app/components/analitica/alertas/AlertasView";
import styles from "@/app/components/analitica/alertas/states.module.css";

export const metadata: Metadata = { title: "Alertas · AgroVoltaic" };

export default function AlertasPage() {
  return (
    <Suspense fallback={<p className={styles.pageLoading}>Cargando las alertas…</p>}>
      <AlertasView />
    </Suspense>
  );
}
