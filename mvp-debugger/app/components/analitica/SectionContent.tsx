"use client";
// La columna de contenido del cascarón: la barra de rango arriba, la vista y el
// pie. Una sección con cabecera propia (`ownsHeader`) recibe la columna desnuda.
//
// Es de cliente solo para leer la ruta: la barra y el pie llegan armados desde
// el layout de servidor, así que acá no se decide QUÉ son, solo SI van. Partir el
// layout en dos grupos de rutas lograba lo mismo moviendo seis carpetas de vistas
// que no tienen nada que ver con el cambio.
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { findSection } from "@/app/components/analitica/sections";

export type SectionContentProps = {
  readonly rangeBar: ReactNode;
  readonly footer: ReactNode;
  readonly children: ReactNode;
};

export function SectionContent({ rangeBar, footer, children }: SectionContentProps) {
  const ownsHeader = findSection(usePathname())?.ownsHeader ?? false;
  if (ownsHeader) return <main className="content content-bare">{children}</main>;
  return (
    <main className="content">
      {rangeBar}
      {children}
      {footer}
    </main>
  );
}
