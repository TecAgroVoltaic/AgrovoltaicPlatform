// Lo que protege esta prueba: que la vista no deje suponer que el conteo de
// hallazgos y el veredicto se corresponden.
//
// La POA acumula 1.089 hallazgos y ninguno puede pesar jamás en ningún
// veredicto; el albedo no está vigilado y sin embargo SÍ pesa. Son dos ejes
// distintos ("¿lo mira el barrido?" y "¿pesa en el veredicto?") y fundirlos en
// una sola categoría hace afirmar algo falso sobre casi uno de cada cinco
// hallazgos del período.
//
// Ese corte se comprobó siempre; ahora se comprueba ADEMÁS dónde está: el corte
// y su cifra se ven SIN ningún gesto, y lo que se pliega es la letra chica (la
// nota del servicio y la lista variable por variable). Si alguien mueve el corte
// dentro del pliegue, acá se rompe.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SUMMARY_WIRE, VIGILANCE_NOTE } from "@/app/components/analitica/calidad/fixtures";
import { Vigilance } from "@/app/components/analitica/calidad/Vigilance";
import { qualitySummarySchema } from "@/app/lib/analitica/contracts/calidad";

afterEach(cleanup);

const PERIOD_FINDINGS = 28509;
const { vigilance } = qualitySummarySchema.parse(SUMMARY_WIRE);

function renderVigilance() {
  render(<Vigilance vigilance={vigilance} findingsInPeriod={PERIOD_FINDINGS} />);
  return within(screen.getByRole("region", { name: /Lo que el veredicto no puede ver/ }));
}

function openDetail(block: ReturnType<typeof renderVigilance>) {
  fireEvent.click(block.getByText(/Por qué una variable sin vigilancia puede pesar/));
}

describe("Vigilance", () => {
  it("separa lo que no pesa jamás de lo que sí pesa, sin tener que abrir nada", () => {
    // Given cuatro variables fuera de vigilancia: tres sin peso y el albedo con peso
    const block = renderVigilance();

    // When se mira la tarjeta tal como llega
    // Then los dos grupos están y se ven: uno solo diría que "sin vigilancia" es
    // "sin peso", y plegarlos los convertiría en una nota al pie
    expect(block.getByText(/no pueden pesar jamás en el veredicto/)).toBeVisible();
    expect(block.getByText(/aun así pesan en el veredicto/)).toBeVisible();
  });

  it("el titular trae la cifra mayor con la escala del período al lado", () => {
    // Given la POA, con 1.089 hallazgos que no cuentan
    const block = renderVigilance();

    // When se lee sin abrir el pliegue
    // Then la cifra y su denominador están a la vista: "1.089" solo no dice nada
    // `\D` y no un punto: el separador de miles depende del ICU del entorno
    expect(block.getByText(/^1\D089 de 28\D509 hallazgos del período$/)).toBeVisible();
    expect(block.getAllByText("poa_pv1_wm2")[0]).toBeVisible();
  });

  it("la letra chica está, plegada, y se abre con un gesto", () => {
    // Given la nota del servicio y las cuatro variables, detrás del pliegue
    const block = renderVigilance();

    // When todavía no se abrió
    expect(block.getByRole("note")).not.toBeVisible();

    // Then abrirlo la muestra literal: reescribirla la desincroniza
    openDetail(block);
    expect(block.getByRole("note")).toBeVisible();
    expect(block.getByRole("note")).toHaveTextContent(VIGILANCE_NOTE);
  });

  it("los cuatro motivos se muestran uno por uno, no como una sola categoría", () => {
    // Given variables con motivos distintos
    const block = renderVigilance();

    // When se abre el detalle
    openDetail(block);

    // Then cada una conserva el suyo: significan cosas distintas
    expect(block.getByText("fuente_sin_denominador")).toBeVisible();
    expect(block.getByText("columna_no_barrida")).toBeVisible();
    expect(block.getByText("variable_derivada")).toBeVisible();
    expect(block.getByText("sin_fuente_en_la_base")).toBeVisible();
    expect(block.getAllByText("✕ no pesa nunca")).toHaveLength(3);
    expect(block.getAllByText("△ sí pesa")).toHaveLength(1);
  });

  it("una variable sin hallazgos no pasa por aprobada", () => {
    // Given el viento, que el período dejó en 0 hallazgos y nadie mide
    const block = renderVigilance();

    // When se abre el detalle y se lee su fila
    openDetail(block);

    // Then el 0 aparece dentro del grupo sin peso, con su motivo: examen en blanco
    expect(block.getByText(/^0 de 28\D509 hallazgos$/)).toBeVisible();
    expect(block.getByText("velocidad_viento_ms")).toBeVisible();
  });
});
