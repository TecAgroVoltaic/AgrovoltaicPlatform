// Lo que protege esta prueba: que el orden lo siga poniendo el servicio y que
// "nadie contó las lecturas" no se convierta en un cero.
//
// Este bloque es lo que permite que la tabla de 133 filas por tipo se vaya a una
// pestaña sin que la pantalla pierda la alarma: es la respuesta a "¿hay algo
// grave?" en los primeros tres segundos.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SUMMARY_WIRE } from "@/app/components/analitica/calidad/fixtures";
import { TopProblems } from "@/app/components/analitica/calidad/TopProblems";
import { qualitySummarySchema } from "@/app/lib/analitica/contracts/calidad";

afterEach(cleanup);

const DAYS_WITH_DATA = 274;
const { topProblems } = qualitySummarySchema.parse(SUMMARY_WIRE);

function renderRanking() {
  const { container } = render(
    <TopProblems problems={topProblems} daysWithData={DAYS_WITH_DATA} />,
  );
  return [...container.querySelectorAll("li")].map((row) => row.textContent ?? "");
}

describe("TopProblems", () => {
  it("respeta el orden que mandó el servicio, sin reordenar acá", () => {
    // Given el ranking del backend: 232 días, luego 190, luego 15
    const rows = renderRanking();

    // When se leen las filas en pantalla
    // Then salen en ese orden: reordenarlas haría discrepar la vista del agente
    expect(rows[0]).toMatch(/fuera_de_rango/);
    expect(rows[1]).toMatch(/columna_ausente/);
    expect(rows[2]).toMatch(/cambio_de_cadencia/);
  });

  it("cada problema dice cuántos días toca de cuántos, no solo cuántos", () => {
    // Given `fuera_de_rango`, con 232 días sobre 274 con datos
    const rows = renderRanking();

    // When se lee su fila
    // Then el denominador va escrito: 232 solo no dice si es mucho o poco
    expect(rows[0]).toMatch(/232 de 274 días/);
  });

  it("un tipo sin conteo de lecturas lo dice, en vez de mostrar un cero", () => {
    // Given `cambio_de_cadencia`, que llega con `lecturas: null`
    const rows = renderRanking();

    // When se lee su fila
    // Then se admite que nadie las contó, que no es "no afectó a ninguna"
    expect(rows[2]).toMatch(/sin conteo de lecturas/);
    expect(rows[2]).not.toMatch(/0 lecturas/);
  });

  it("un período sin ranking no pasa por período limpio", () => {
    // Given un período que el servicio devolvió sin problemas frecuentes
    render(<TopProblems problems={[]} daysWithData={0} />);

    // When se mira el bloque
    // Then dice adónde ir antes de darlo por limpio
    expect(screen.getByText(/antes de darlo por limpio/)).toBeInTheDocument();
  });
});
