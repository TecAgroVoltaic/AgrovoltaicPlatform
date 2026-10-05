"use client";
// La barra lateral, más su forma de cajón en pantallas angostas.
//
// El componente NO decide qué va dentro: recibe el contenido de la barra tal
// cual y solo le agrega la barra superior, el velo y el estado de abierto. Así
// el cascarón (`app/(analisis)/layout.tsx`) sigue siendo un componente de
// servidor y la única razón por la que esto es cliente es el estado del cajón.
//
// Por qué un cajón y no un riel horizontal: la justificación está en globals.css,
// junto a las reglas que lo dibujan.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { findSection } from "@/app/components/analitica/sections";

const MENU_ID = "menu-secciones";
const TITULO_POR_DEFECTO = "Evaluación de datos";
const ICONO = 16;

export function SidebarDrawer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Cerrar devolviendo el foco a quien abrió. Sin esto el foco se queda en un
  // cajón que ya no está y el teclado aparece «en ninguna parte».
  const close = useCallback(() => {
    setOpen(false);
    burgerRef.current?.focus();
  }, []);

  // Cambiar de sección cierra el cajón, y acá el foco NO se mueve: la persona
  // pidió una vista, no volver al botón del menú.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const titulo = findSection(pathname)?.label ?? TITULO_POR_DEFECTO;

  return (
    <>
      <div className="shell-topbar">
        <button
          ref={burgerRef}
          type="button"
          className="shell-burger"
          aria-label="Abrir el menú de secciones"
          aria-expanded={open}
          aria-controls={MENU_ID}
          onClick={() => setOpen(true)}
        >
          <IconoMenu />
        </button>
        <span className="shell-title">{titulo}</span>
      </div>

      {/* El velo no lleva rol ni foco: cerrar con el teclado es tarea de Escape y
          del botón de cerrar, que sí están en el orden de tabulación. Un botón a
          pantalla completa solo sumaría una parada muda. */}
      {open && <div className="shell-scrim" onClick={close} aria-hidden="true" />}

      <aside id={MENU_ID} className={"side drawer" + (open ? " is-open" : "")}>
        <button ref={closeRef} type="button" className="shell-close" aria-label="Cerrar el menú" onClick={close}>
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
