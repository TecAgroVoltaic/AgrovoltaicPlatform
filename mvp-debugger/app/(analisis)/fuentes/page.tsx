// Fuentes de datos: el inventario de dónde vive cada dato. Usa el cascarón
// normal pero no lee el rango: describe las fuentes, no un período.
import type { Metadata } from "next";

import { FuentesView } from "@/app/components/fuentes/FuentesView";
import { findSection } from "@/app/components/analitica/sections";

export const metadata: Metadata = { title: "Fuentes de datos · AgroVoltaic" };

const SECTION_PATH = "/fuentes";

export default function FuentesPage() {
  const section = findSection(SECTION_PATH);
  return (
    <div className="vista">
      <header className="phead">
        <h1>{section?.label ?? "Fuentes de datos"}</h1>
        <p>{section?.description}</p>
      </header>
      <FuentesView />
    </div>
  );
}
