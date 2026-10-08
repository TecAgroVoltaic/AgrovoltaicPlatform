"use client";
// La barra lateral, más su forma de cajón en pantallas angostas.
//
// El componente NO decide qué va dentro: recibe el contenido de la barra tal
// cual y solo le agrega la barra superior, el velo y el estado de abierto (que
// vive en `SectionMenuProvider`). Así el cascarón (`app/(analisis)/layout.tsx`)
// sigue siendo un componente de servidor.
//
// Por qué un cajón y no un riel horizontal: la justificación está en globals.css,
// junto a las reglas que lo dibujan.
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useSectionMenu } from "@/app/components/analitica/SectionMenu";
import { findSection } from "@/app/components/analitica/sections";

/** El id del cajón: lo usa también el `aria-controls` de la otra puerta (la
 *  cabecera propia de una sección, ver `SectionMenu`). */
export const SECTION_MENU_ID = "menu-secciones";
const TITULO_POR_DEFECTO = "Evaluación de datos";
const ICONO = 16;

export function SidebarDrawer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { open, openMenu, closeMenu } = useSectionMenu();
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeMenu]);

  const section = findSection(pathname);
  const titulo = section?.label ?? TITULO_POR_DEFECTO;

  return (
    <>
      {/* Una sección con cabecera propia trae su botón de menú: dos bandas
          pegadas arriba se comerían el doble de pantalla en un teléfono. */}
      {section?.ownsHeader ? null : (
        <div className="shell-topbar">
          <button
            ref={burgerRef}
            type="button"
            className="shell-burger"
            aria-label="Abrir el menú de secciones"
            aria-expanded={open}
            aria-controls={SECTION_MENU_ID}
            onClick={() => openMenu(burgerRef.current)}
          >
            <IconoMenu />
          </button>
          <span className="shell-title">{titulo}</span>
        </div>
      )}

      {/* El velo no lleva rol ni foco: cerrar con el teclado es tarea de Escape y
          del botón de cerrar, que sí están en el orden de tabulación. Un botón a
          pantalla completa solo sumaría una parada muda. */}
      {open && <div className="shell-scrim" onClick={closeMenu} aria-hidden="true" />}

      <aside id={SECTION_MENU_ID} className={"side drawer" + (open ? " is-open" : "")}>
        <button ref={closeRef} type="button" className="shell-close" aria-label="Cerrar el menú" onClick={closeMenu}>
          <IconoCerrar />
        </button>
        {children}
      </aside>
    </>
  );
}

// Los dos iconos viven acá y no en `Iconos.tsx` porque no los usa nadie más:
// solo el cascarón los dibuja, y son las dos formas más convencionales que hay.
function IconoMenu() {
  return (
    <svg width={ICONO} height={ICONO} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

function IconoCerrar() {
  return (
    <svg width={ICONO} height={ICONO} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
