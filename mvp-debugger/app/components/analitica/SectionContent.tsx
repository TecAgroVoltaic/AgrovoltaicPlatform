"use client";
// La columna de contenido del cascarón: la barra de rango arriba, la vista y el
// pie. Una sección con cabecera propia (`shell: "bare"`) recibe la columna desnuda.
//
// Es de cliente solo para leer la ruta: la barra y el pie llegan armados desde
// el layout de servidor, así que acá no se decide QUÉ son, solo SI van. Partir el
// layout en dos grupos de rutas lograba lo mismo moviendo seis carpetas de vistas
// que no tienen nada que ver con el cambio.
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { isBareShell } from "@/app/components/analitica/sections";

export type SectionContentProps = {
  readonly rangeBar: ReactNode;
  readonly footer: ReactNode;
  readonly children: ReactNode;
  /** Lo que flota sobre la vista (el botón «Preguntar»). Va en las dos formas de
   *  la columna, al final, para que su reserva de espacio caiga bajo la vista. */
  readonly floatingAction?: ReactNode;
};

export function SectionContent({ rangeBar, footer, children, floatingAction }: SectionContentProps) {
  if (isBareShell(usePathname())) {
    return (
      <main className="content content-bare">
        {children}
        {floatingAction}
      </main>
    );
  }
  return (
    <main className="content">
      {rangeBar}
      {children}
      {footer}
      {floatingAction}
    </main>
  );
}
