// Lo que estas pruebas protegen: que el diagrama de carpeta NO corra las horas.
//
// Es el fallo más caro de esta vista y el más difícil de ver: si el navegador
// reinterpretara como UTC la hora local que ya manda el backend, el perfil
// diario entero se desplazaría seis horas y el mediodía solar aparecería a las
// seis de la mañana, con un gráfico que sigue viéndose perfectamente sano.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FolderFigure, toHeatmapData } from "@/app/components/analitica/estadistica/figures/FolderFigure";
import type { CalendarHeatmapData } from "@/app/components/charts";
import type { FolderResponse } from "@/app/lib/analitica/contracts/estadistica";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const HOURS_IN_DAY = 24;
const NOON = 12;
const NIGHT_HOUR = 3;
const DAWN_HOUR = 5;
const PEAK_VALUE = 1120.5;
/** Un instante cualquiera: solo sirve para comprobar que cambiar de huso HACE algo. */
const SAMPLE_INSTANT = "2026-05-01T12:00:00Z";

const ENVELOPE = {
  window: { from: "2026-05-01", toExclusive: "2026-05-03", days: 2, granularity: "day" as const },
  confidence: {},
};

function dayProfile(): (number | null)[] {
  const hours = Array.from({ length: HOURS_IN_DAY }, (): number | null => null);
  hours[NOON] = PEAK_VALUE;
  // Cero MEDIDO: de madrugada la potencia es cero de verdad, y tiene que
  // distinguirse de la hora en que no hubo lectura.
  hours[DAWN_HOUR] = 0;
  return hours;
}

function folderResponse(overrides: Partial<FolderResponse["payload"]> = {}): FolderResponse {
  return {
    ...ENVELOPE,
    payload: {
      variable: { key: "potencia_pv1_w", label: "Potencia PV1 (inclinado)", unit: "W" },
      days: ["2026-05-01", "2026-05-02"],
      hours: Array.from({ length: HOURS_IN_DAY }, (_unused, hour) => hour),
      matrix: [dayProfile(), dayProfile()],
      range: {
        minimum: { status: "measured", value: 0, count: 4, unit: "W" },
        maximum: { status: "measured", value: PEAK_VALUE, count: 4, unit: "W" },
      },
      cellsWithData: 4,
      totalCells: 48,
      ...overrides,
    },
  };
}

function withTimeZone<TResult>(timeZone: string, run: () => TResult): TResult {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    process.env.TZ = previous;
  }
}

function valueAt(data: CalendarHeatmapData, hourLabel: string, column: number): number | null {
  const row = data.rows.indexOf(hourLabel);
  return data.cells.find((cell) => cell.row === row && cell.column === column)?.value ?? null;
}

describe("toHeatmapData", () => {
  it("deja el pico del mediodía en la fila 12, no seis horas antes", () => {
    // Given una respuesta cuyo único pico está en la hora local 12
    const response = folderResponse();

    // When se arma el mapa de calor
    const data = toHeatmapData(response);

    // Then el pico sigue en la fila «12» y las filas son las 24 horas locales
    expect(data.rows).toHaveLength(HOURS_IN_DAY);
    expect(data.rows[NOON]).toBe("12");
    expect(valueAt(data, "12", 0)).toBe(PEAK_VALUE);
  });

  it("da lo mismo con el navegador en cualquier huso horario", () => {
    // Given la misma respuesta y dos husos separados nueve horas
    const response = folderResponse();
    // Guarda de la propia prueba: si cambiar el huso no tuviera efecto, comparar
    // los dos resultados no demostraría nada.
    const utcHour = withTimeZone("UTC", () => new Date(SAMPLE_INSTANT).getHours());
    const tokyoHour = withTimeZone("Asia/Tokyo", () => new Date(SAMPLE_INSTANT).getHours());
    expect(tokyoHour).not.toBe(utcHour);

    // When se arma el mapa bajo cada huso
    const fromUtc = withTimeZone("UTC", () => toHeatmapData(response));
    const fromTokyo = withTimeZone("Asia/Tokyo", () => toHeatmapData(response));

    // Then sale exactamente el mismo mapa: acá no se convierte zona horaria
    expect(fromTokyo).toEqual(fromUtc);
    expect(valueAt(fromTokyo, "12", 1)).toBe(PEAK_VALUE);
  });

  it("distingue la hora sin lecturas del cero medido", () => {
    // Given un día con un cero medido al amanecer y madrugada sin registro
    const response = folderResponse();

    // When se arma el mapa
    const data = toHeatmapData(response);

    // Then el cero se pinta como cero y la hora sin dato queda sin valor
    expect(valueAt(data, "05", 0)).toBe(0);
    expect(valueAt(data, "03", 0)).toBeNull();
    expect(data.cells.filter((cell) => cell.row === NIGHT_HOUR)).toHaveLength(2);
  });

  it("toma los extremos de la escala del backend y no de las celdas dibujadas", () => {
    // Given una respuesta cuyo rango lo midió el backend sobre todas las lecturas
    const response = folderResponse();

    // When se arma el mapa
    const data = toHeatmapData(response);

    // Then la escala de color usa esos extremos
    expect(data.min).toBe(0);
    expect(data.max).toBe(PEAK_VALUE);
  });
});

describe("FolderFigure", () => {
  it("una variable fuera de su ventana explica el vacío en vez de girar para siempre", () => {
    // Given el SP722, que solo registró dieciocho días, con la consulta en vuelo
    render(
      <FolderFigure
        result={null}
        outOfCoverage="Irradiancia SP722: el sensor registró dieciocho días y se detuvo."
        onRetry={vi.fn()}
        focusLabel="Irradiancia SP722"
      />,
    );

    // When se mira la pantalla
    // Then dice el motivo, y no muestra ni lienzo ni carga eterna
    expect(screen.getByText(/dieciocho días/i)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sin ninguna celda con medición dice por qué, en vez de pintar un lienzo vacío", () => {
    // Given un rango en que la variable no dejó una sola celda
    const response = folderResponse({
      matrix: [[], []],
      cellsWithData: 0,
    });

    // When se pinta la figura
    render(
      <FolderFigure
        result={{ ok: true, data: response }}
        outOfCoverage={null}
        onRetry={vi.fn()}
        focusLabel="Potencia Inclinado (PV1)"
      />,
    );

    // Then el vacío llega con su explicación
    expect(screen.getByText(/ni un día del período trae lecturas/i)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });

  it("un fallo de red se anuncia y deja reintentar", () => {
    // Given una consulta que no llegó a salir
    const retry = vi.fn();
    render(
      <FolderFigure
        result={{ ok: false, failure: { code: "NETWORK", message: "no se pudo contactar al servidor" } }}
        outOfCoverage={null}
        onRetry={retry}
        focusLabel="Potencia Inclinado (PV1)"
      />,
    );

    // When se mira la pantalla
    // Then el error se ve y el reintento está disponible
    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo contactar/i);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });
});
