// La casilla es la unidad donde se juega la mentira más barata del tablero:
// mostrar «0» donde no hubo medición. Con cuatro meses de potencia alterna en
// NULL, ese cero se leería como «la planta no produjo».
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KpiTile } from "@/app/components/analitica/tablero/KpiTile";
import type { Metric } from "@/app/lib/analitica";

const MEASURED: Metric = { status: "measured", value: 771.43, count: 28996, unit: "kWh" };

const MISSING: Metric = {
  status: "missing",
  count: 0,
  unit: "kWh",
  reason: "no hay ni una lectura de esta variable en la ventana pedida",
};

describe("KpiTile", () => {
  // La configuración de Vitest corre con `globals: false`, así que Testing
  // Library no engancha su limpieza automática: sin esto, cada prueba vería
  // también el DOM de la anterior y las búsquedas encontrarían duplicados.
  afterEach(cleanup);

  it("con dato muestra el número, su unidad y la nota que lo define", () => {
    // Given una métrica medida
    render(<KpiTile title="Energía del período" metric={MEASURED} note="2025-09-01 a 2026-06-01" />);

    // When se lee la casilla
    // Then están el valor, la unidad y el contexto
    expect(screen.getByText(/771,4/)).toBeVisible();
    expect(screen.getByText("kWh")).toBeVisible();
    expect(screen.getByText("2025-09-01 a 2026-06-01")).toBeVisible();
  });

  it("sin dato muestra el motivo y NUNCA un cero", () => {
    // Given una métrica ausente, con n = 0 y su motivo
    render(<KpiTile title="Energía del período" metric={MISSING} />);

    // When se lee la casilla
    // Then dice «sin dato» con el motivo del backend, y no aparece ningún cero
    expect(screen.getByText("sin dato")).toBeVisible();
    expect(screen.getByText(MISSING.status === "missing" ? MISSING.reason : "")).toBeVisible();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText(/^0/)).toBeNull();
  });

  it("sin dato tampoco pinta la unidad, para que no exista «sin dato kWh»", () => {
    // Given la misma métrica ausente
    render(<KpiTile title="Energía del período" metric={MISSING} />);

    // When se busca la unidad
    // Then no está: una unidad sin magnitud sugiere que hubo medición
    expect(screen.queryByText("kWh")).toBeNull();
  });

  it("mantiene la definición de la casilla aunque el período no la responda", () => {
    // Given una métrica ausente con una nota que explica qué mide la casilla
    render(
      <KpiTile title="Energía del período" metric={MISSING} note="2025-09-01 a 2026-06-01" />,
    );

    // When se lee la casilla
    // Then el título y la nota siguen ahí: la definición no depende del dato
    expect(screen.getByText("Energía del período")).toBeVisible();
    expect(screen.getByText("2025-09-01 a 2026-06-01")).toBeVisible();
  });
});
