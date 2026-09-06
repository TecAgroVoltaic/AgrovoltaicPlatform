// Comparativa: el arreglo Inclinado (PV1) contra el Vertical (PV2).
//
// La página es de servidor y solo pone la cabecera: todo lo que depende del
// rango vive en la vista de cliente. El <Suspense> es porque esa vista lee la
// query de la URL, que Next resuelve del lado del cliente.
import { Suspense } from "react";
import type { Metadata } from "next";

import { ComparativaView } from "@/app/components/analitica/comparativa/ComparativaView";
import { findSection } from "@/app/components/analitica/sections";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

export const metadata: Metadata = { title: "Comparativa · AgroVoltaic" };

const SECTION_PATH = "/comparativa";

export default function ComparativaPage() {
  const section = findSection(SECTION_PATH);
  return (
    // `medida` abre el contexto de contenedor de la vista: lo de dentro se
    // adapta al ancho que hay de verdad y deja de estirar la página. Ver
    // `comparativa.module.css`.
    <div className={`vista ${styles.medida}`}>
      <header className="phead">
        <h1>{section?.label ?? "Comparativa"}</h1>
        <p>{section?.description}</p>
      </header>
      <Suspense fallback={<p className="muted small">Cargando la comparación…</p>}>
        <ComparativaView />
      </Suspense>
    </div>
  );
}
