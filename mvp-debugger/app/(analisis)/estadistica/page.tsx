// Estadística: box plots mensuales e irradiación (Fig. 6), crestas por sensor
// (Fig. 7), dispersión con ajuste OLS (Fig. 8) y carpeta día por hora (Fig. 8 bis).
//
// La página es de servidor y solo pone la cabecera: todo lo que depende del rango
// y del foco vive en la vista de cliente. El <Suspense> es porque esa vista lee
// la query de la URL, que Next resuelve del lado del cliente.
import { Suspense } from "react";
import type { Metadata } from "next";

import { EstadisticaView } from "@/app/components/analitica/estadistica/EstadisticaView";
import { findSection } from "@/app/components/analitica/sections";
import styles from "@/app/components/analitica/estadistica/vista.module.css";

export const metadata: Metadata = { title: "Estadística · AgroVoltaic" };

const SECTION_PATH = "/estadistica";

export default function EstadisticaPage() {
  const section = findSection(SECTION_PATH);
  return (
    <div className={`vista ${styles.medida}`}>
      <header className="phead">
        <h1>{section?.label ?? "Estadística"}</h1>
        <p>{section?.description}</p>
      </header>
      <Suspense fallback={<p className="muted small">Cargando las distribuciones…</p>}>
        <EstadisticaView />
      </Suspense>
    </div>
  );
}
