// Lo que protege esta prueba: que el desglose siga trayendo el nombre y la
// cifra de cada variable, que es lo único que la tira comprimida del veredicto
// no puede dar.
//
// "25 días utilizables" es lo que queda al exigir que todas las variables estén
// sanas A LA VEZ. Por variable va de 25 a 241. La forma de ese reparto ya se ve
// pegada al número (`UsableSpread`); acá se comprueba lo demás: quién es cada
// barra y cuánto le toca.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SUMMARY_WIRE } from "@/app/components/analitica/calidad/fixtures";
import { UsableDaysByVariable } from "@/app/components/analitica/calidad/UsableDaysByVariable";
import { qualitySummarySchema } from "@/app/lib/analitica/contracts/calidad";

afterEach(cleanup);

const { verdict } = qualitySummarySchema.parse(SUMMARY_WIRE);

describe("UsableDaysByVariable", () => {
  it("lista cada variable con sus propios días, de la peor a la mejor", () => {
    // Given las tres variables del período
    const { container } = render(<UsableDaysByVariable variables={verdict.byVariable} />);

    // When se recorren las filas
    const rows = [...container.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");

    // Then van ordenadas de menos a más días utilizables, con su cifra propia
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/frecuencia_hz.*25 d.*4\.4 %/);
    expect(rows[2]).toMatch(/voltaje_pv1_v.*241 d/);
  });

  it("dice qué arreglo es cada PV, que el nombre de la columna no revela", () => {
    // Given nombres como `potencia_pv1_w`, que no dicen la orientación
    render(<UsableDaysByVariable variables={verdict.byVariable} />);

    // When se lee el encabezado del bloque
    // Then queda escrito cuál es el Inclinado y cuál el Vertical
    expect(screen.getByText(/PV1 es el arreglo Inclinado/)).toBeInTheDocument();
  });

  it("sin desglose lo dice, en vez de dejar una tabla vacía", () => {
    // Given un período que el servicio devolvió sin `por_variable`
    const { container } = render(<UsableDaysByVariable variables={[]} />);

    // When se mira el bloque
    // Then explica la ausencia: una tabla vacía se leería como "todo bien"
    expect(screen.getByText(/no devolvió el desglose por variable/)).toBeInTheDocument();
    expect(container.querySelector("tbody")).toBeNull();
  });
});
