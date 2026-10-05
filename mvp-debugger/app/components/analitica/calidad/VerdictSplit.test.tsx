// Lo que protegen estas pruebas: que los DOS ejes no se vuelvan a fundir en
// uno, y que el número de días utilizables no pueda aparecer nunca solo.
//
// Un día con la planta parada es un día con dato BUENO sobre un sistema MALO.
// Hasta hace poco el sistema los mezclaba y hundía la confianza de meses cuya
// energía es exacta. Si alguien mueve la avería dentro del veredicto del dato,
// acá se rompe.
//
// Lo segundo es la razón de que el desglose viva pegado a la cifra y no solo en
// su pestaña: con otra pestaña abierta, el "25 días utilizables" seguiría en
// pantalla y sin el desglose diría que las 18 variables van juntas, que es falso.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AVAILABILITY_WARNING,
  SPREAD_WARNING,
  SUMMARY_WIRE,
} from "@/app/components/analitica/calidad/fixtures";
import {
  DATA_AXIS_NAME,
  EQUIPMENT_AXIS_NAME,
  VerdictSplit,
} from "@/app/components/analitica/calidad/VerdictSplit";
import { qualitySummarySchema } from "@/app/lib/analitica/contracts/calidad";

// `globals: false` deja a Testing Library sin su limpieza automática: sin esto,
// el segundo render encuentra dos veces cada región.
afterEach(cleanup);

const summary = qualitySummarySchema.parse(SUMMARY_WIRE);

function renderSplit() {
  render(<VerdictSplit verdict={summary.verdict} note={summary.note} />);
  return {
    data: within(screen.getByRole("region", { name: DATA_AXIS_NAME })),
    equipment: within(screen.getByRole("region", { name: EQUIPMENT_AXIS_NAME })),
  };
}

describe("VerdictSplit", () => {
  it("la avería del equipo vive en su propia región, fuera del veredicto del dato", () => {
    // Given un período con 25 días utilizables y 96 días de planta parada
    const { data, equipment } = renderSplit();

    // When se busca la parada en cada región
    // Then aparece solo en la del equipo, nunca dentro de la del dato
    expect(equipment.getByText(new RegExp(AVAILABILITY_WARNING.slice(0, 40)))).toBeInTheDocument();
    expect(data.queryByText(/planta estuvo parada/)).not.toBeInTheDocument();
    expect(data.queryByText("96")).not.toBeInTheDocument();
  });

  it("cada eje muestra la advertencia que el servicio redactó para él", () => {
    // Given las dos advertencias del payload real
    const { data, equipment } = renderSplit();

    // When se leen las notas de cada tarjeta
    // Then van literales y en su lado: reescribirlas las desincroniza
    expect(data.getByRole("note")).toHaveTextContent(SPREAD_WARNING);
    expect(equipment.getByRole("note")).toHaveTextContent(
      /Es una averia que revisar, no un problema de calidad de dato/,
    );
  });

  it("el eje del equipo dice que NO baja los días utilizables", () => {
    // Given la nota del servicio sobre la disponibilidad
    const { equipment } = renderSplit();

    // When se lee la tarjeta del equipo
    // Then queda escrito que el dato de esos días es correcto
    expect(equipment.getByText(/NO baja `dias_utilizables`/)).toBeInTheDocument();
  });

  it("el número grande nunca aparece sin el desglose por variable", () => {
    // Given las tres variables del período, de 25 a 241 días utilizables
    const { data } = renderSplit();

    // When se lee la tarjeta del dato, sin abrir ni tocar nada
    const spread = data.getByRole("list", { name: /de la peor a la mejor/i });

    // Then cada variable trae su propia cifra ahí mismo: el agregado no puede
    // leerse como si las 18 fueran juntas
    expect(within(spread).getByLabelText(/frecuencia_hz: 25 días utilizables/)).toBeVisible();
    expect(within(spread).getByLabelText(/voltaje_pv1_v: 241 días utilizables/)).toBeVisible();
    expect(data.getByText("frecuencia_hz")).toBeVisible();
  });

  it("los días parados bajo sol se leen aparte de los días parados", () => {
    // Given 96 días de planta parada, 69 de ellos con sol pleno
    const { equipment } = renderSplit();

    // When se mira la cifra secundaria del eje del equipo
    const underSun = equipment.getByText("69");

    // Then el 69 está escrito y rotulado: es el que distingue la avería real
    // del día nublado, y dentro de la advertencia larga se pierde
    expect(underSun).toBeVisible();
    expect(underSun.closest("p")).toHaveTextContent(/con sol pleno/);
  });
});
