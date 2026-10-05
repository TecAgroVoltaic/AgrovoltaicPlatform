"use client";
// La barra lateral de /consola, más su forma de cajón en pantallas angostas.
//
// Por qué no reusa `analitica/SidebarDrawer` tal cual: aquel saca el título y el
// momento de cerrar de la RUTA (`usePathname`), y en la consola la sección es
// estado de React, no una dirección. Pasarle una ruta inventada sería mentirle a
// un componente para que haga lo que ya hace bien de otra forma. Lo que sí se
// comparte es lo que se ve: las MISMAS clases de `globals.css`, o sea el mismo
// cajón, el mismo velo y la misma barra superior que el resto del MVP.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MENU_ID = "menu-consola";
const ICONO = 16;

type Props = {
  /** Lo único legible con el cajón cerrado: dónde está parada la persona. */
  titulo: string;
  /**
   * Cambia cuando la persona ya eligió a dónde ir. No alcanza con mirar el
   * `titulo`: «Arquitectura del agente» se llama igual en los dos agentes, y
   * cambiar de agente desde ahí dejaba el cajón tapando la vista recién pedida.
   */
  claveActiva: string;
  /** Modificador de la barra; `compacta` cuando está plegada en escritorio. */
  claseBarra?: string;
  /** El contenido de la barra: marca, agentes, navegación y pie. */
  children: ReactNode;
};

export function ConsoleDrawer({ titulo, claveActiva, claseBarra = "", children }: Props) {
  const [abierto, setAbierto] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);
  const claveVista = useRef(claveActiva);

  // Cerrar devuelve SIEMPRE el foco al botón que abrió, también cuando el cierre
  // lo dispara elegir una vista. Acá se diferencia del cajón de análisis: allá
  // cambiar de sección carga otra página y el foco se reubica solo; en la consola
  // no se navega a ningún lado, y el botón recién pulsado quedaría enfocado
  // dentro de un cajón invisible, o sea el teclado «en ninguna parte».
  const cerrar = useCallback(() => {
    setAbierto(false);
    botonMenu.current?.focus();
  }, []);

  useEffect(() => {
    // Solo el CAMBIO de vista cierra: comparar contra lo anterior evita que el
    // primer pintado le robe el foco a la página apenas carga.
    if (claveVista.current === claveActiva) return;
    claveVista.current = claveActiva;
    if (abierto) cerrar();
  }, [claveActiva, abierto, cerrar]);

  useEffect(() => {
    if (!abierto) return;
    botonCerrar.current?.focus();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto, cerrar]);

  return (
    <>
      <div className="shell-topbar">
        <button
          ref={botonMenu}
          type="button"
          className="shell-burger"
          aria-label="Abrir el menú de la consola"
          aria-expanded={abierto}
          aria-controls={MENU_ID}
          onClick={() => setAbierto(true)}
        >
          <IconoMenu />
        </button>
        <span className="shell-title">{titulo}</span>
      </div>

      {/* El velo no lleva rol ni foco: cerrar con el teclado es tarea de Escape y
          del botón de cerrar, que sí están en el orden de tabulación. */}
      {abierto && <div className="shell-scrim" onClick={cerrar} aria-hidden="true" />}

      <aside id={MENU_ID} className={["side drawer", claseBarra, abierto ? "is-open" : ""].filter(Boolean).join(" ")}>
        <button ref={botonCerrar} type="button" className="shell-close" aria-label="Cerrar el menú" onClick={cerrar}>
          <IconoCerrar />
        </button>
        {children}
      </aside>
    </>
  );
}

// Los dos iconos se dibujan acá y no en `Iconos.tsx` por la misma razón que en el
// cajón de análisis: no los usa nadie más y son las dos formas más convencionales
// que hay.
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
