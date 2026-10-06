// Lo que protege: que el chip de contexto cambie el rango DE LA URL (la única
// fuente de verdad del rango) y que el desplegable se maneje con teclado.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContextChip } from "@/app/components/asistente/ContextChip";

// La misma instancia en cada pintada, como la de Next: una nueva por render
// cambiaría el rango en cada pasada y el formulario se resincronizaría sin fin.
const navigation = vi.hoisted(() => ({
  router: { push: vi.fn() },
  params: new URLSearchParams("desde=2026-05-03&hasta=2026-06-02&granularidad=dia"),
}));
const router = navigation.router;

vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
  usePathname: () => "/asistente",
  useSearchParams: () => navigation.params,
}));

const CHIP_NAME = /Rango de contexto: 3 may – 1 jun 2026 · diaria/;

describe("ContextChip", () => {
  beforeEach(() => router.push.mockClear());

  it("muestra el rango de la URL en corto, con el fin inclusivo", () => {
    render(<ContextChip threadOpen={false} />);
    expect(screen.getByRole("button", { name: CHIP_NAME })).toHaveTextContent("3 may – 1 jun 2026 · diaria");
  });

  it("aplicar un rango nuevo lo escribe en la URL y cierra el desplegable", () => {
    // Given el desplegable abierto
    render(<ContextChip threadOpen={false} />);
    const chip = screen.getByRole("button", { name: CHIP_NAME });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    // When se cambia el inicio y se aplica
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    // Then la URL pasa a tener ese rango, conservando la ruta
    expect(router.push).toHaveBeenCalledWith("/asistente?desde=2026-05-20&hasta=2026-06-02&granularidad=dia");
    expect(screen.queryByRole("dialog", { name: "Rango de contexto" })).toBeNull();
    expect(chip).toHaveFocus();
  });

  it("un rango inválido no toca la URL y lo dice", () => {
    render(<ContextChip threadOpen={false} />);
    fireEvent.click(screen.getByRole("button", { name: CHIP_NAME }));
    fireEvent.change(screen.getByLabelText("Hasta (exclusivo)"), { target: { value: "2026-05-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("posterior a «desde»");
  });

  it("Escape cierra el desplegable y devuelve el foco al chip", () => {
    render(<ContextChip threadOpen />);
    const chip = screen.getByRole("button", { name: CHIP_NAME });
    fireEvent.click(chip);
    // Con un hilo abierto avisa que el rango nuevo no le llega a ese hilo
    expect(screen.getByText(/Este hilo conserva el rango con que se abrió/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip).toHaveFocus();
  });
});
