// Vista Calidad: el estado del dato del período y, por separado, el del equipo.
//
// La cabecera es servidor y el informe es cliente: el rango vive en la query y
// lo lee `useDateRange`, así que el cuerpo va bajo <Suspense> igual que el
// selector del cascarón.
import { Suspense } from "react";
import type { Metadata } from "next";

import { CalidadView } from "@/app/components/analitica/calidad/CalidadView";
import { findSection } from "@/app/components/analitica/sections";
import styles from "@/app/components/analitica/calidad/calidad.module.css";

export const metadata: Metadata = { title: "Calidad · AgroVoltaic" };

const SECTION_PATH = "/calidad";

export default function CalidadPage() {
  const section = findSection(SECTION_PATH);
  return (
    // `medida` abre el contexto de contenedor de la vista: lo de dentro se
    // adapta al ancho que hay de verdad y deja de estirar la página. Ver
    // `calidad.module.css`.
    <div className={`vista ${styles.medida}`}>
      <header className="phead">
        <h1>{section?.label ?? "Calidad"}</h1>
        <p>{section?.description}</p>
      </header>
      <Suspense fallback={<p className="muted">Cargando el estado de calidad…</p>}>
        <CalidadView />
      </Suspense>
    </div>
  );
}
