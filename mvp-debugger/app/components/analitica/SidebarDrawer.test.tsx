// Lo que protege esta prueba: que el cajón se pueda MANEJAR, no que se vea.
//
// Un cajón que abre pero no cierra con Escape, o que cierra dejando el foco en un
// elemento invisible, deja a quien navega con teclado encerrado sin nada en
// pantalla que lo explique. Eso no se nota mirando una captura, y por eso se
// prueba acá y no a ojo.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarDrawer } from "@/app/components/analitica/SidebarDrawer";

const navigation = { path: "/series" };

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
}));

const ABRIR = "Abrir el menú de secciones";
const CERRAR = "Cerrar el menú";

// Un elemento NUEVO en cada pintada. Reusar la misma referencia hace que React
// se saltee el renderizado, y el test mediría el atajo de React en vez del
// componente: en la aplicación real el cambio de ruta llega por contexto.
const cascaron = () => (
  <SidebarDrawer>
    <a href="/calidad">Calidad</a>
  </SidebarDrawer>
);

function renderDrawer() {
  navigation.path = "/series";
  const { rerender } = render(cascaron());
  return {
    burger: screen.getByRole("button", { name: ABRIR }),
    drawer: screen.getByRole("complementary"),
    repintar: () => rerender(cascaron()),
  };
}

describe("SidebarDrawer", () => {
  it("anuncia el estado del cajón y a qué elemento controla", () => {
    // Given el cascarón recién pintado
    const { burger, drawer } = renderDrawer();

    // When se abre el cajón
    fireEvent.click(burger);

    // Then el botón dice que está abierto y apunta al menú de verdad
    expect(burger).toHaveAttribute("aria-expanded", "true");
    expect(burger.getAttribute("aria-controls")).toBe(drawer.id);
    expect(drawer.className).toContain("is-open");
  });

  it("Escape cierra el cajón y devuelve el foco al botón que lo abrió", () => {
    // Given el cajón abierto, con el foco dentro
    const { burger, drawer } = renderDrawer();
    fireEvent.click(burger);
    expect(screen.getByRole("button", { name: CERRAR })).toHaveFocus();

    // When se pulsa Escape
    fireEvent.keyDown(document, { key: "Escape" });

    // Then el cajón se cierra y el foco vuelve a un elemento visible
    expect(drawer.className).not.toContain("is-open");
    expect(burger).toHaveAttribute("aria-expanded", "false");
    expect(burger).toHaveFocus();
  });

  it("una tecla cualquiera no cierra el cajón", () => {
    // Given el cajón abierto
    const { burger, drawer } = renderDrawer();
    fireEvent.click(burger);

    // When se pulsa una tecla que no es Escape
    fireEvent.keyDown(document, { key: "a" });

    // Then sigue abierto
    expect(drawer.className).toContain("is-open");
  });

  it("cambiar de sección cierra el cajón", () => {
    // Given el cajón abierto en /series
    const { burger, drawer, repintar } = renderDrawer();
    fireEvent.click(burger);
    expect(drawer.className).toContain("is-open");

    // When la navegación lleva a otra sección
    navigation.path = "/calidad";
    repintar();

    // Then el cajón se cierra solo: si no, la vista pedida queda tapada por el
    // menú que la pidió
    expect(drawer.className).not.toContain("is-open");
    expect(screen.getByText("Calidad", { selector: ".shell-title" })).toBeInTheDocument();
  });

  it("el título de la barra superior nombra la sección que se está mirando", () => {
    // Given la ruta de una sección conocida
    renderDrawer();

    // When se lee la barra superior
    const titulo = screen.getByText("Series");

    // Then dice el nombre de esa sección, que es lo único que queda visible
    // cuando el menú está cerrado
    expect(titulo).toBeInTheDocument();
  });
});
