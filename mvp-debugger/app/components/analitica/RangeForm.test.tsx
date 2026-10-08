// Lo que protege: que la persona elija el ÚLTIMO DÍA INCLUIDO y la URL reciba
// el fin exclusivo (+1), que los días sin datos no se puedan tomar, que los
// atajos sigan la cobertura publicada y que un rango raro llegado por URL se
// muestre con aviso en vez de romper el formulario.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RangeForm } from "@/app/components/analitica/RangeForm";
import { VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { failure } from "@/app/lib/analitica/errors";
import type { DaysWithDataState } from "@/app/lib/analitica/useDaysWithData";

// Mayo 2026 con el hueco real del 22 al 24; la cobertura publicada llega al 31 de agosto.
const MAY_DAYS = ["2026-05-03", "2026-05-20", "2026-05-21", "2026-05-25", "2026-05-26", "2026-06-01"];
const READY: DaysWithDataState = {
  status: "ready",
  days: new Set(MAY_DAYS),
  bounds: { from: "2024-11-10", toExclusive: "2026-09-01" },
  daysBySource: { electrical: MAY_DAYS, radiation: MAY_DAYS },
};

const harness = vi.hoisted(() => ({
  router: { push: vi.fn() },
  params: new URLSearchParams(),
  daysWithData: { status: "loading" } as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => harness.router,
  usePathname: () => "/series",
  useSearchParams: () => harness.params,
}));
vi.mock("@/app/lib/analitica/useDaysWithData", () => ({ useDaysWithData: () => harness.daysWithData }));

function renderForm(query: string, daysWithData: DaysWithDataState) {
  harness.params = new URLSearchParams(query);
  harness.daysWithData = daysWithData;
  render(<RangeForm idPrefix="prueba" />);
}

function pick(field: RegExp, dayName: string) {
  fireEvent.click(screen.getByRole("button", { name: field }));
  fireEvent.click(screen.getByRole("button", { name: dayName }));
}

describe("RangeForm", () => {
  beforeEach(() => harness.router.push.mockClear());

  it("muestra «Hasta» como el último día incluido, no el fin exclusivo de la URL", () => {
    renderForm("desde=2026-05-03&hasta=2026-06-02&granularidad=dia", READY);
    expect(screen.getByRole("button", { name: "Hasta 1 jun 2026" })).toBeInTheDocument();
    expect(screen.queryByText(/exclusivo/i)).toBeNull();
  });

  it("al aplicar convierte el «Hasta» inclusivo en el fin exclusivo de la URL", () => {
    // Given el rango del 3 may al 1 jun
    renderForm("desde=2026-05-03&hasta=2026-06-02&granularidad=dia", READY);
    // When se elige el 26 de mayo como último día (el calendario abre en junio) y se aplica
    fireEvent.click(screen.getByRole("button", { name: /^Hasta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "26 de mayo de 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    // Then la URL lleva hasta=27 (exclusivo)
    expect(harness.router.push).toHaveBeenCalledWith("/series?desde=2026-05-03&hasta=2026-05-27&granularidad=dia");
  });

  it("«Desde» igual a «Hasta» es un rango de un día, válido", () => {
    renderForm("desde=2026-05-20&hasta=2026-05-27&granularidad=dia", READY);
    pick(/^Hasta/, "20 de mayo de 2026");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(harness.router.push).toHaveBeenCalledWith("/series?desde=2026-05-20&hasta=2026-05-21&granularidad=dia");
  });

  it("un día sin datos no se puede tomar como inicio", () => {
    renderForm("desde=2026-05-20&hasta=2026-05-27&granularidad=dia", READY);
    pick(/^Desde/, "22 de mayo de 2026, sin datos");
    // Then el calendario sigue abierto y el campo conserva su fecha
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desde 20 may 2026" })).toBeInTheDocument();
  });

  it("un rango con días vacíos en el medio es válido y cuenta los días con datos", () => {
    renderForm("desde=2026-05-20&hasta=2026-05-27&granularidad=dia", READY);
    expect(screen.getByText(/4 de 7 días con datos/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("un rango de URL que empieza en un día sin datos se muestra con aviso, sin romper", () => {
    renderForm("desde=2026-05-22&hasta=2026-05-27&granularidad=dia", READY);
    expect(screen.getByRole("button", { name: "Desde 22 may 2026" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("El rango empieza (2026-05-22) en un día sin datos");
  });

  it("un rango sin ningún día con datos lo dice con la cobertura publicada", () => {
    renderForm("desde=2026-05-22&hasta=2026-05-25&granularidad=dia", READY);
    expect(screen.getByRole("status")).toHaveTextContent("los datos van del 2024-11-10 al 2026-08-31");
  });

  it("los atajos se anclan a la cobertura publicada cuando llegó", () => {
    renderForm("desde=2026-05-20&hasta=2026-05-27&granularidad=dia", READY);
    fireEvent.click(screen.getByRole("button", { name: "Última semana con datos" }));
    expect(harness.router.push).toHaveBeenCalledWith("/series?desde=2026-08-25&hasta=2026-09-01&granularidad=dia");
  });

  it("si la cobertura no llegó, los atajos caen a la constante verificada", () => {
    renderForm("desde=2026-05-20&hasta=2026-05-27&granularidad=dia", { status: "error", failure: failure("NETWORK") });
    fireEvent.click(screen.getByRole("button", { name: "Todo el histórico" }));
    expect(harness.router.push).toHaveBeenCalledWith(
      `/series?desde=${VERIFIED_COVERAGE.from}&hasta=${VERIFIED_COVERAGE.toExclusive}&granularidad=mes`,
    );
  });
});
