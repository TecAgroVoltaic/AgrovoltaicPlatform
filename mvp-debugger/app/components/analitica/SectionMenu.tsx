"use client";
// El estado del cajón de secciones, compartido por todo el cascarón.
//
// Vive en un proveedor y no dentro de `SidebarDrawer` porque hay DOS puertas al
// mismo cajón: la hamburguesa de la barra superior y, en las secciones que ponen
// su propia cabecera (`ownsHeader`), un botón dentro de esa cabecera. La barra y
// el contenido son hermanos en el cascarón: sin un estado común, la segunda
// puerta tendría que duplicar la barra lateral o apretar un botón ajeno.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type SectionMenu = {
  readonly open: boolean;
  /** Abre el cajón recordando quién lo abrió, para devolverle el foco al cerrar. */
  readonly openMenu: (opener: HTMLElement | null) => void;
  readonly closeMenu: () => void;
};

const SectionMenuContext = createContext<SectionMenu | null>(null);

export function SectionMenuProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const openMenu = useCallback((opener: HTMLElement | null) => {
    openerRef.current = opener;
    setOpen(true);
  }, []);

  // Cerrar devolviendo el foco a quien abrió. Sin esto el foco se queda en un
  // cajón que ya no está y el teclado aparece «en ninguna parte».
  const closeMenu = useCallback(() => {
    setOpen(false);
    openerRef.current?.focus();
  }, []);

  // Cambiar de sección cierra el cajón, y acá el foco NO se mueve: la persona
  // pidió una vista, no volver al botón del menú.
  useEffect(() => setOpen(false), [pathname]);

  const menu = useMemo(() => ({ open, openMenu, closeMenu }), [open, openMenu, closeMenu]);
  return <SectionMenuContext.Provider value={menu}>{children}</SectionMenuContext.Provider>;
}

/** @throws Error si se usa fuera de `SectionMenuProvider`: un botón de menú que
 *  no abre nada es peor que un fallo visible en desarrollo. */
export function useSectionMenu(): SectionMenu {
  const menu = useContext(SectionMenuContext);
  if (!menu) throw new Error("useSectionMenu necesita un SectionMenuProvider por encima");
  return menu;
}
