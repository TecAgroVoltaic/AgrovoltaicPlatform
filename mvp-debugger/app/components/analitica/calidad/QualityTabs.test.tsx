// Lo que protege esta prueba: que la pestaña inactiva no esté montada, y que la
// barra se maneje con el teclado como manda el patrón.
//
// Lo primero no es cosmético: de que el panel no se monte depende que su lectura
// no salga. Si alguien cambia las pestañas por un `display: none`, los 221 KB de
// días vuelven a pedirse al entrar y esta prueba lo dice.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QualityTabs, type QualityTab } from "@/app/components/analitica/calidad/QualityTabs";

afterEach(cleanup);

const LABEL = "Detalle de la calidad del período";

function tabsWith(mounted: () => void): readonly QualityTab[] {
  function Second() {
    mounted();
    return <p>cuerpo de la segunda</p>;
  }
  return [
    { id: "first", label: "Primera", panel: <p>cuerpo de la primera</p> },
    { id: "second", label: "Segunda", panel: <Second /> },
    { id: "third", label: "Tercera", panel: <p>cuerpo de la tercera</p> },
  ];
}

function renderTabs(activeId = "first") {
  const mounted = vi.fn();
  const onSelect = vi.fn();
  render(
    <QualityTabs label={LABEL} tabs={tabsWith(mounted)} activeId={activeId} onSelect={onSelect} />,
  );
  return { mounted, onSelect };
}

describe("QualityTabs", () => {
  it("la pestaña que no está activa no se monta", () => {
    // Given tres pestañas con la primera activa
    const { mounted } = renderTabs();

    // When se pinta la barra
    // Then el cuerpo de la segunda nunca se ejecutó: si se montara, su lectura
    // saldría igual que si no hubiera pestañas
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.getByText("cuerpo de la primera")).toBeInTheDocument();
    expect(screen.queryByText("cuerpo de la segunda")).not.toBeInTheDocument();
  });

  it("el panel visible dice de qué pestaña es", () => {
    // Given la primera pestaña activa
    renderTabs();

    // When se leen los papeles ARIA
    const panel = screen.getByRole("tabpanel");

    // Then el panel está atado a su pestaña y solo hay una seleccionada
    expect(panel).toHaveAccessibleName("Primera");
    expect(screen.getAllByRole("tab", { selected: true })).toHaveLength(1);
  });

  it("las flechas recorren la barra, que es una sola parada de tabulador", () => {
    // Given la primera pestaña activa
    const { onSelect } = renderTabs();
    const tabs = screen.getAllByRole("tab");

    // When se pulsa la flecha derecha sobre la barra
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    // Then se elige la siguiente, y solo la activa es alcanzable con el tabulador
    expect(onSelect).toHaveBeenCalledWith("second");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
  });

  it("la flecha izquierda desde la primera vuelve a la última", () => {
    // Given la primera pestaña activa
    const { onSelect } = renderTabs();

    // When se pulsa la flecha izquierda
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });

    // Then el recorrido es circular, como en el patrón de referencia
    expect(onSelect).toHaveBeenCalledWith("third");
  });
});
