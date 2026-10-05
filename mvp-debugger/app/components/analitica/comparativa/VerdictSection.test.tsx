// Lo que estas pruebas protegen: que en los primeros tres segundos se lea quién
// produce más Y que ese ganador no salga del método elegido.
//
// La comparación entre los dos arreglos es lo único que esta pantalla existe
// para comunicar. Si el ganador se marcara solo con un matiz, quien no lo
// distinga no tendría cómo leer el resultado; y si el veredicto llegara sin la
// coincidencia entre métodos, sería un resultado del método.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerdictSection } from "@/app/components/analitica/comparativa/VerdictSection";
import {
  arrayComparison,
  EMPTY_TOTALS,
  performanceReport,
} from "@/app/components/analitica/comparativa/fixtures";
import { failure } from "@/app/lib/analitica/errors";

const NO_WINNER = {
  ganador: null,
  lectura: "no se pueden comparar: a uno de los dos arreglos le falta energia",
};

const okComparison = () => ({ ok: true, data: arrayComparison() }) as const;
const okReport = () => ({ ok: true, data: performanceReport() }) as const;

describe("VerdictSection", () => {
  it("nombra al ganador con palabras y no solo con un color", () => {
    // Given un período en que el backend ya resolvió quién produjo más
    render(<VerdictSection comparison={okComparison()} report={okReport()} onRetry={vi.fn()} />);

    // When se lee la tarjeta
    // Then el ganador está escrito, junto a la frase que redactó el backend
    expect(screen.getByText("Produce más")).toBeInTheDocument();
    expect(screen.getByText(/el arreglo inclinado genero 227.17 kWh mas/)).toBeInTheDocument();
    expect(screen.getByText("543,3")).toBeInTheDocument();
  });

  it("nunca llama PV1 y PV2 a secas: dice la geometría", () => {
    // Given los dos arreglos, con la misma potencia pico
    render(<VerdictSection comparison={okComparison()} report={okReport()} onRetry={vi.fn()} />);

    // When se leen sus cabeceras
    // Then cada uno viene con su inclinación, su azimut y sus Wp
    expect(screen.getByText(/20° de inclinación, azimut 150° · 1.420 Wp/)).toBeInTheDocument();
    expect(screen.getByText(/90° de inclinación, azimut 50° · 1.420 Wp/)).toBeInTheDocument();
  });

  it("dice de entrada que el ganador no depende del método", () => {
    // Given los seis métodos del PR, dos de ellos con un PR imposible, más el
    // cruce punto a punto, que es el único que deja arriba al vertical
    render(<VerdictSection comparison={okComparison()} report={okReport()} onRetry={vi.fn()} />);

    // When se lee la línea que acompaña al veredicto
    // Then trae la cuenta de los que coinciden y la de los que salen de escala
    expect(screen.getByText(/métodos comparables dan el mismo ganador/)).toHaveTextContent(
      "4 de 5 métodos comparables dan el mismo ganador",
    );
    expect(screen.getByText("2 métodos quedan fuera: su PR es imposible")).toBeVisible();
  });

  it("con el informe del método caído, el veredicto se pinta igual", () => {
    // Given la comparación resuelta y la consulta del PR caída
    render(
      <VerdictSection
        comparison={okComparison()}
        report={{ ok: false, failure: failure("NETWORK") }}
        onRetry={vi.fn()}
      />,
    );

    // When se lee la tarjeta
    // Then el ganador sigue ahí y no se inventa ninguna coincidencia
    expect(screen.getByText("Produce más")).toBeInTheDocument();
    expect(screen.queryByText(/métodos comparables/)).not.toBeInTheDocument();
  });

  it("sin energía en el rango explica el motivo y no escribe un cero", () => {
    // Given un rango que vuelve con 200 y los dos totales en null
    render(
      <VerdictSection
        comparison={{
          ok: true,
          data: arrayComparison({ totales: EMPTY_TOTALS, diferencia: NO_WINNER }),
        }}
        report={okReport()}
        onRetry={vi.fn()}
      />,
    );

    // When se mira dónde iría el número
    // Then hay motivo, no hay ganador y no hay ningún cero inventado
    expect(screen.getByText("Sin datos para este rango")).toBeInTheDocument();
    expect(screen.getByText(/no hay ni una lectura de esta variable/)).toBeInTheDocument();
    expect(screen.queryByText("Produce más")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("con la consulta caída ofrece reintentar", () => {
    // Given un fallo de red, que sí puede pasar solo
    const onRetry = vi.fn();
    render(
      <VerdictSection
        comparison={{ ok: false, failure: failure("NETWORK") }}
        report={okReport()}
        onRetry={onRetry}
      />,
    );

    // When se lee la tarjeta
    // Then avisa del fallo con un botón para volver a intentar
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
