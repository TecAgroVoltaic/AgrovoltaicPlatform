"use client";
// Navegación de la sección de análisis.
//
// Cada enlace ARRASTRA el rango de la URL. Sin eso, pasar del tablero a las
// series reiniciaría el período y la persona leería otro dato del que venía
// mirando, sin que nada se lo diga.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ANALYSIS_SECTIONS } from "@/app/components/analitica/sections";

const ICON_SIZE = 16;

export function SectionNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <nav className="nav" aria-label="Secciones de análisis">
      {ANALYSIS_SECTIONS.map(({ path, label, Icon }) => {
        const active = pathname === path;
        return (
          <Link
            key={path}
            href={`${path}${suffix}`}
            className={"navitem" + (active ? " on" : "")}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={ICON_SIZE} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
