"use client";
// La segunda puerta al cajón de secciones, para las secciones con cabecera propia
// (`ownsHeader`): ellas no reciben la barra superior del cascarón, así que el
// botón del menú lo ponen en su cabecera. El aspecto lo decide esa cabecera.
import { useRef } from "react";

import { IconThreads } from "@/app/components/asistente/AssistantIcons";
import { useSectionMenu } from "@/app/components/analitica/SectionMenu";
import { SECTION_MENU_ID } from "@/app/components/analitica/SidebarDrawer";

const ICON_SIZE = 16;

export function SectionMenuButton({ className }: { readonly className: string }) {
  const menu = useSectionMenu();
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      aria-label="Abrir el menú de secciones"
      aria-expanded={menu.open}
      aria-controls={SECTION_MENU_ID}
      onClick={() => menu.openMenu(buttonRef.current)}
    >
      <IconThreads size={ICON_SIZE} />
    </button>
  );
}
