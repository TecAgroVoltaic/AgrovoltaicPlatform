// Lo que protege esta prueba: que un día AUSENTE no se pinte como un día
// aprobado, y que las dos tiras sigan contando cosas distintas.
//
// 329 de los 660 días del calendario no tienen ni una fila. Si la celda del día
// ausente termina con la misma trama que la del día limpio, la pantalla dice que
// el histórico está mucho mejor de lo que está.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DAYS_WIRE } from "@/app/components/analitica/calidad/fixtures";
import { DayMap } from "@/app/components/analitica/calidad/DayMap";
import { errorChart, readyChart } from "@/app/components/charts";
import { qualityDaysSchema } from "@/app/lib/analitica/contracts/calidad";

afterEach(cleanup);

const days = qualityDaysSchema.parse(DAYS_WIRE);
const QUALITY_STRIP = "Calidad del dato";
const EQUIPMENT_STRIP = "Disponibilidad del equipo";

function renderMap() {
  render(<DayMap state={readyChart(days)} />);
  return {
    quality: within(screen.getByRole("list", { name: QUALITY_STRIP })),
    equipment: within(screen.getByRole("list", { name: EQUIPMENT_STRIP })),
  };
}

describe("DayMap", () => {
  it("el día sin ninguna fila se anuncia ausente, no limpio", () => {
    // Given un día sin filas y otro evaluado sin hallazgos
    const { quality } = renderMap();

    // When se leen sus celdas
    const absent = quality.getByLabelText(/^2025-09-01, Ausente/);
    const clean = quality.getByLabelText(/^2025-09-02, Sin hallazgos/);

    // Then son estados distintos y con trama distinta, no solo con otro color
    expect(absent).toBeInTheDocument();
    expect(clean).toBeInTheDocument();
    expect(absent.className).not.toBe(clean.className);
  });

  it("el mismo día se describe distinto en cada tira", () => {
    // Given el 2025-09-03: dato grave Y planta parada con sol
    const { quality, equipment } = renderMap();

    // When se leen sus dos celdas
    // Then una habla del dato y la otra del equipo, sin mezclarse
    expect(quality.getByLabelText(/^2025-09-03, Grave: radiación/)).toBeInTheDocument();
    expect(equipment.getByLabelText(/^2025-09-03, Parado con sol/)).toBeInTheDocument();
    expect(quality.queryByLabelText(/Parado con sol/)).not.toBeInTheDocument();
  });

  it("cada tira explica sus estados con palabras, no solo con color", () => {
    // Given el mapa pintado
    renderMap();

    // When se busca la leyenda
    // Then cada estado tiene su frase, legible sin distinguir colores
    expect(screen.getAllByText(/ni una sola fila ese día/)).not.toHaveLength(0);
    expect(
      screen.getByText(/parado con sol pleno: avería que revisar, no dato malo/i),
    ).toBeInTheDocument();
  });

  it("si la lectura de los días falla, lo dice en vez de pintar tiras vacías", () => {
    // Given la lectura diferida de los 221 KB de días, caída
    render(<DayMap state={errorChart("el servidor tardó demasiado en responder")} />);

    // When se mira el bloque
    // Then hay alerta con el motivo y ninguna tira: dos tiras vacías se leerían
    // como un período sin un solo día
    expect(screen.getByRole("alert")).toHaveTextContent(/tardó demasiado/);
    expect(screen.queryByRole("list", { name: QUALITY_STRIP })).not.toBeInTheDocument();
  });
});
