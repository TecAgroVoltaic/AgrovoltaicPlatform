// Lo que esta prueba protege: la carrera de respuestas al cambiar de variable.
//
// Es el fallo que no se ve. Si la petición vieja vuelve después de la nueva y
// nadie la descarta, el gráfico termina mostrando los datos de la variable
// anterior bajo el título de la actual: no hay error, no hay aviso, y el número
// que el experto lee es de otra cosa.
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { useAnalyticsQuery } from "@/app/components/analitica/series/useAnalyticsQuery";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const RANGE: DateRange = { from: "2026-05-01", toExclusive: "2026-06-02", granularity: "day" };
const PATH = "analitica/series";
const LABEL_SCHEMA = z.object({ etiqueta: z.string() });

function Probe({ variable }: { readonly variable: string }) {
  const state = useAnalyticsQuery({
    path: PATH,
    range: RANGE,
    schema: LABEL_SCHEMA,
    query: { variables: variable },
  });
  return <p data-testid="estado">{state.status === "loaded" ? state.data.etiqueta : state.status}</p>;
}

type Resolver = (body: unknown) => void;

const fetchStub = vi.fn();
const resolvers: Resolver[] = [];

beforeEach(() => {
  resolvers.length = 0;
  fetchStub.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push((body) => resolve(new Response(JSON.stringify(body), { status: 200 })));
      }),
  );
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("useAnalyticsQuery", () => {
  it("la respuesta vieja no pinta encima de la nueva, y su petición se corta", async () => {
    // Given una consulta en vuelo por la primera variable
    const view = render(<Probe variable="potencia_pv1_w" />);
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));

    // When se cambia de variable y la SEGUNDA respuesta llega antes que la primera
    view.rerender(<Probe variable="temp_inclinado" />);
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2));
    resolvers[1]({ etiqueta: "Temperatura módulo inclinado" });
    await screen.findByText("Temperatura módulo inclinado");
    resolvers[0]({ etiqueta: "Potencia PV1 (inclinado)" });

    // Then sigue mandando la nueva, y la vieja viajó con su señal ya abortada
    await waitFor(() =>
      expect(screen.getByTestId("estado")).toHaveTextContent("Temperatura módulo inclinado"),
    );
    expect(fetchStub.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("cambiar de variable vuelve a «cargando» en vez de dejar el dato anterior", async () => {
    // Given una consulta ya resuelta
    const view = render(<Probe variable="potencia_pv1_w" />);
    await waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers[0]({ etiqueta: "Potencia PV1 (inclinado)" });
    await screen.findByText("Potencia PV1 (inclinado)");

    // When se pide otra variable
    view.rerender(<Probe variable="temp_inclinado" />);

    // Then el dato viejo desaparece de inmediato: no se queda como si fuera el nuevo
    await waitFor(() => expect(screen.getByTestId("estado")).toHaveTextContent("loading"));
  });

  it("con la consulta deshabilitada no sale ninguna petición", async () => {
    // Given una variable que la vista ya sabe que no tiene sentido pedir
    function Disabled() {
      const state = useAnalyticsQuery({
        path: PATH,
        range: RANGE,
        schema: LABEL_SCHEMA,
        enabled: false,
      });
      return <p data-testid="estado">{state.status}</p>;
    }

    // When se pinta
    render(<Disabled />);

    // Then el estado es «sin pedir» y la red no se tocó
    await waitFor(() => expect(screen.getByTestId("estado")).toHaveTextContent("idle"));
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
