// Lo que protege: que el chip de rango cambie el rango DE LA URL (la única
// fuente de verdad del rango) y que el desplegable se maneje con teclado.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RangeChip } from "@/app/components/analitica/RangeChip";

// La misma instancia en cada pintada, como la de Next: una nueva por render
// cambiaría el rango en cada pasada y el formulario se resincronizaría sin fin.
const navigation = vi.hoisted(() => ({
  router: { push: vi.fn() },
  params: new URLSearchParams("desde=2026-05-03&hasta=2026-06-02&granularidad=dia"),
}));
const router = navigation.router;

// Sin lista de días (cargando): el calendario deja elegir todo, y el chip se
// prueba sin red. Los días deshabilitados se prueban en DatePicker y RangeForm.
vi.mock("@/app/lib/analitica/useDaysWithData", () => ({ useDaysWithData: () => ({ status: "loading" }) }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
  usePathname: () => "/asistente",
  useSearchParams: () => navigation.params,
}));

const CHIP_NAME = /Rango de contexto: 3 may – 1 jun 2026 · diaria/;

describe("RangeChip", () => {
  beforeEach(() => router.push.mockClear());

  it("muestra el rango de la URL en corto, con el fin inclusivo", () => {
    render(<RangeChip title="Rango de contexto" formIdPrefix="contexto-rango" />);
    expect(screen.getByRole("button", { name: CHIP_NAME })).toHaveTextContent("3 may – 1 jun 2026 · diaria");
  });

  it("aplicar un rango nuevo lo escribe en la URL y cierra el desplegable", () => {
    // Given el desplegable abierto
    render(<RangeChip title="Rango de contexto" formIdPrefix="contexto-rango" />);
    const chip = screen.getByRole("button", { name: CHIP_NAME });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    // Then el foco entra al formulario, en el primer campo
    expect(screen.getByRole("button", { name: "Desde 3 may 2026" })).toHaveFocus();
    // When se elige otro inicio en el calendario y se aplica
    fireEvent.click(screen.getByRole("button", { name: "Desde 3 may 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "20 de mayo de 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    // Then la URL pasa a tener ese rango, conservando la ruta
    expect(router.push).toHaveBeenCalledWith("/asistente?desde=2026-05-20&hasta=2026-06-02&granularidad=dia");
    expect(screen.queryByRole("dialog", { name: "Rango de contexto" })).toBeNull();
    expect(chip).toHaveFocus();
  });

  it("un rango inválido no toca la URL y lo dice", () => {
    render(<RangeChip title="Rango de contexto" formIdPrefix="contexto-rango" />);
    fireEvent.click(screen.getByRole("button", { name: CHIP_NAME }));
    // When «Hasta» queda antes que «Desde»
    fireEvent.click(screen.getByRole("button", { name: "Hasta 1 jun 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "1 de mayo de 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("«Hasta» no puede ser anterior a «Desde»");
  });

  it("Escape dentro del calendario cierra solo el calendario, no el desplegable", () => {
    render(<RangeChip title="Rango de contexto" formIdPrefix="contexto-rango" />);
    fireEvent.click(screen.getByRole("button", { name: CHIP_NAME }));
    fireEvent.click(screen.getByRole("button", { name: "Desde 3 may 2026" }));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Rango de contexto" })).toBeInTheDocument();
  });

  it("Escape cierra el desplegable y devuelve el foco al chip", () => {
    render(<RangeChip title="Rango de contexto" formIdPrefix="contexto-rango" note="Este hilo conserva el rango con que se abrió." />);
    const chip = screen.getByRole("button", { name: CHIP_NAME });
    fireEvent.click(chip);
    // La nota de la sección acompaña al formulario
    expect(screen.getByText(/Este hilo conserva el rango con que se abrió/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip).toHaveFocus();
  });
});
