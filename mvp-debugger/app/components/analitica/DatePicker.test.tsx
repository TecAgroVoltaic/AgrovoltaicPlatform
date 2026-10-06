// Lo que protege el pedido del usuario: un día sin datos se ve en gris y NO se
// puede elegir, ni con el mouse ni con el teclado; y si no se sabe qué días
// tienen datos (cargando o con error), no se bloquea a nadie.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "@/app/components/analitica/DatePicker";
import type { DaysWithDataState } from "@/app/lib/analitica/useDaysWithData";
import { failure } from "@/app/lib/analitica/errors";

// Mayo 2026 con el hueco real del 22 al 24, y nada en abril.
const MAY_DAYS = ["2026-05-20", "2026-05-21", "2026-05-25", "2026-05-26", "2026-06-01"];
const READY: DaysWithDataState = {
  status: "ready",
  days: new Set(MAY_DAYS),
  bounds: { from: "2026-03-01", toExclusive: "2026-06-02" },
};

function renderPicker(daysWithData: DaysWithDataState = READY, value = "2026-05-21") {
  const onChange = vi.fn();
  const { container } = render(
    <>
      <span id="rotulo">Desde</span>
      <DatePicker id="campo" labelId="rotulo" value={value} onChange={onChange} daysWithData={daysWithData} />
    </>,
  );
  const trigger = screen.getByRole("button", { name: /Desde/ });
  fireEvent.click(trigger);
  return { onChange, trigger, container, dialog: screen.getByRole("dialog", { name: "Desde" }) };
}

const day = (name: RegExp) => screen.getByRole("button", { name });

describe("DatePicker", () => {
  it("el botón muestra la fecha corta del sitio y se nombra con el rótulo", () => {
    render(
      <>
        <span id="rotulo">Desde</span>
        <DatePicker id="campo" labelId="rotulo" value="2026-05-03" onChange={vi.fn()} daysWithData={READY} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Desde 3 may 2026" })).toHaveAttribute("aria-expanded", "false");
  });

  it("un día sin datos sale deshabilitado y el clic no lo elige", () => {
    // Given la lista de días cargada, con el 22 de mayo sin datos
    const { onChange } = renderPicker();
    const emptyDay = day(/^22 de mayo de 2026, sin datos/);
    expect(emptyDay).toHaveAttribute("aria-disabled", "true");
    // When se hace clic en él / Then no se elige y el calendario sigue abierto
    fireEvent.click(emptyDay);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("elegir un día con datos lo devuelve, cierra y vuelve el foco al botón", () => {
    const { onChange, trigger } = renderPicker();
    fireEvent.click(day(/^25 de mayo de 2026$/));
    expect(onChange).toHaveBeenCalledWith("2026-05-25");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("navega de mes con las flechas y salta directo con el selector de mes", () => {
    const { dialog } = renderPicker();
    // When se pide el mes siguiente / Then se ve junio
    fireEvent.click(within(dialog).getByRole("button", { name: "Mes siguiente" }));
    expect(day(/^1 de junio de 2026$/)).toBeInTheDocument();
    // When se salta a marzo, que no tiene datos / Then se ve marzo, todo en gris
    const monthSelect = within(dialog).getByRole("combobox", { name: "Ir al mes" });
    expect(within(monthSelect).getByRole("option", { name: "marzo 2026 · sin datos" })).toBeInTheDocument();
    fireEvent.change(monthSelect, { target: { value: "2026-03" } });
    expect(day(/^21 de marzo de 2026, sin datos/)).toHaveAttribute("aria-disabled", "true");
  });

  it("con el teclado: abre en el día elegido, las flechas mueven y Enter no elige un día vacío", () => {
    const { onChange } = renderPicker();
    const grid = screen.getByRole("grid");
    expect(day(/^21 de mayo de 2026$/)).toHaveFocus();
    // When se avanza un día (al 22, sin datos) y se pulsa Enter / Then no elige
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(day(/^22 de mayo de 2026/)).toHaveFocus();
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    // When se baja una semana (al 29) y se vuelve 4 días (al 25) y Enter / Then elige
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(day(/^25 de mayo de 2026$/)).toHaveFocus();
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2026-05-25");
  });

  it("las flechas cruzan de mes y el mes visible las sigue", () => {
    renderPicker(READY, "2026-05-31");
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight" });
    expect(day(/^1 de junio de 2026$/)).toHaveFocus();
  });

  it("Escape cierra solo el calendario y lo marca como atendido para el desplegable de afuera", () => {
    // Given un oyente de Escape en el MISMO nodo que la raíz de React, como el
    // del chip de contexto en Next (donde la raíz es el document): a ese
    // oyente stopPropagation no lo frena, por eso el contrato es defaultPrevented
    const { trigger, container } = renderPicker();
    const outerEscape = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    container.addEventListener("keydown", outerEscape);
    // When se pulsa Escape dentro del calendario
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
    // Then se cierra, el foco vuelve al botón y el de afuera lo ve ya atendido
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(outerEscape).toHaveBeenCalledTimes(1);
    expect(outerEscape).toHaveReturnedWith(true);
  });

  it("Tab da la vuelta dentro del calendario", () => {
    const { dialog } = renderPicker();
    const previous = within(dialog).getByRole("button", { name: "Mes anterior" });
    const selectedDay = day(/^21 de mayo de 2026$/);
    // When se tabula desde el último foco (el día del cursor) / Then vuelve al primero
    selectedDay.focus();
    fireEvent.keyDown(selectedDay, { key: "Tab" });
    expect(previous).toHaveFocus();
    fireEvent.keyDown(previous, { key: "Tab", shiftKey: true });
    expect(selectedDay).toHaveFocus();
  });

  it("mientras carga deja elegir cualquier día y lo dice", () => {
    const { onChange } = renderPicker({ status: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando cobertura…");
    fireEvent.click(day(/^22 de mayo de 2026$/));
    expect(onChange).toHaveBeenCalledWith("2026-05-22");
  });

  it("si la lista falla deja elegir cualquier día y avisa", () => {
    const { onChange } = renderPicker({ status: "error", failure: failure("NETWORK") });
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo saber qué días tienen datos");
    fireEvent.click(day(/^23 de mayo de 2026$/));
    expect(onChange).toHaveBeenCalledWith("2026-05-23");
  });

  it("con la base vacía tampoco bloquea", () => {
    renderPicker({ status: "empty" });
    expect(day(/^22 de mayo de 2026$/)).not.toHaveAttribute("aria-disabled");
  });

  it("hacia adelante: sin fecha muestra el rótulo, y los días previos a la mínima no se eligen", () => {
    // Given un selector de próxima revisión que arranca el 6 oct 2026, todavía vacío
    const onChange = vi.fn();
    render(
      <>
        <span id="rotulo">Próxima revisión</span>
        <DatePicker id="campo" labelId="rotulo" value={null} minDate="2026-10-06" placeholder="sin fecha" onChange={onChange} />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Próxima revisión sin fecha" });
    // When se abre el calendario
    fireEvent.click(trigger);
    // Then ayer está en gris por haber pasado, no por falta de datos, y no se elige
    const yesterday = day(/^5 de octubre de 2026, ya pasó/);
    expect(yesterday).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(yesterday);
    expect(onChange).not.toHaveBeenCalled();
    // And un día posterior sí se elige
    fireEvent.click(day(/^10 de octubre de 2026$/));
    expect(onChange).toHaveBeenCalledWith("2026-10-10");
  });
});
