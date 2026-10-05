// Descargas: el rango elegido en .csv, .dat o .mat, columna por columna.
//
// La página es de servidor y solo pone la cabecera: todo lo que depende del
// rango y de la selección vive en la vista de cliente. El <Suspense> es porque
// esa vista lee la query de la URL, que Next resuelve del lado del cliente.
import { Suspense } from "react";
import type { Metadata } from "next";

import { DescargasView } from "@/app/components/analitica/descargas/DescargasView";
import { findSection } from "@/app/components/analitica/sections";

export const metadata: Metadata = { title: "Descargas · AgroVoltaic" };

const SECTION_PATH = "/descargas";

export default function DescargasPage() {
  const section = findSection(SECTION_PATH);
  return (
    <div className="vista">
      <header className="phead">
        <h1>{section?.label ?? "Descargas"}</h1>
        <p>{section?.description}</p>
      </header>
      <Suspense fallback={<p className="muted small">Cargando las tablas exportables…</p>}>
        <DescargasView />
      </Suspense>
    </div>
  );
}
