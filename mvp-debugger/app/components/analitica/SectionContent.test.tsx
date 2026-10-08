// Lo que protege: que la barra de rango y el pie se apaguen SOLO en la sección
// que pone su propia cabecera, y que las demás vistas los sigan recibiendo.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionContent } from "@/app/components/analitica/SectionContent";

const navigation = { path: "/series" };

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
}));

function renderAt(path: string) {
  navigation.path = path;
  render(
    <SectionContent rangeBar={<p>barra de rango</p>} footer={<p>pie</p>}>
      <p>vista</p>
    </SectionContent>,
  );
}

describe("SectionContent", () => {
  it.each(["/", "/series", "/descargas"])("en %s pinta la barra de rango, la vista y el pie", (path) => {
    // Given una sección del cascarón sin cabecera propia
    // When se pinta la columna
    renderAt(path);
    // Then recibe las tres piezas
    expect(screen.getByText("barra de rango")).toBeInTheDocument();
    expect(screen.getByText("vista")).toBeInTheDocument();
    expect(screen.getByText("pie")).toBeInTheDocument();
  });

  it("en el Asistente pinta solo la vista, a ancho completo", () => {
    // Given la sección que dibuja su propia cabecera
    // When se pinta la columna
    renderAt("/asistente");
    // Then la barra de rango y el pie no están
    expect(screen.getByText("vista")).toBeInTheDocument();
    expect(screen.queryByText("barra de rango")).toBeNull();
    expect(screen.queryByText("pie")).toBeNull();
    expect(screen.getByRole("main")).toHaveClass("content-bare");
  });
});
