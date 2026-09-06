// Lo que protege esta prueba: que la explicación de cada tipo la siga poniendo
// el servicio, y que la jerarquía de gravedad esté en la estructura y no solo en
// el color.
//
// Hay 30 tipos de hallazgo repartidos en 133 filas, y su glosario vive en el
// backend. Una copia local se desincroniza el día que aparezca el tipo 31, y la
// tabla mostraría jerga sin traducir justo donde hace falta entender.
//
// El glosario llega ahora en su propia lectura, así que se comprueba también qué
// pasa cuando esa lectura falla: los conteos no dependen de ella y tienen que
// seguir en pantalla.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GLOSSARY_WIRE, SUMMARY_WIRE } from "@/app/components/analitica/calidad/fixtures";
import { FindingTypesTable } from "@/app/components/analitica/calidad/FindingTypesTable";
import { errorChart, loadingChart, readyChart } from "@/app/components/charts";
import {
  findingGlossarySchema,
  qualitySummarySchema,
} from "@/app/lib/analitica/contracts/calidad";

afterEach(cleanup);

const { types } = qualitySummarySchema.parse(SUMMARY_WIRE);
const glossary = findingGlossarySchema.parse(GLOSSARY_WIRE);

function renderTable(onSelectType = vi.fn()) {
  render(
    <FindingTypesTable
      types={types}
      glossaryState={readyChart(glossary)}
      onSelectType={onSelectType}
    />,
  );
  return onSelectType;
}

describe("FindingTypesTable", () => {
  it("cada tipo se explica con las palabras del servicio", () => {
    // Given el desglose por tipo y el glosario de /arquitectura
    renderTable();

    // When se busca la explicación de un tipo
    // Then es la del backend, no una escrita en el navegador
    expect(
      screen.getByText(/el inversor no se acopló a la red entre las 07:00 y las 17:00/),
    ).toBeInTheDocument();
  });

  it("si el glosario no llega, la tabla se pinta igual y admite el hueco", () => {
    // Given la lectura del glosario caída
    render(
      <FindingTypesTable
        types={types}
        glossaryState={errorChart("no se pudo contactar al servidor")}
        onSelectType={vi.fn()}
      />,
    );

    // When se mira el bloque
    // Then los conteos siguen, se dice qué falta y no se inventa ninguna
    // explicación: `undefined` en pantalla sería peor
    expect(screen.getByRole("alert")).toHaveTextContent(/glosario/);
    expect(screen.getAllByText(/no publicó una explicación/)).toHaveLength(types.length);
  });

  it("mientras el glosario viaja no se pinta media tabla", () => {
    // Given la lectura del glosario en vuelo
    render(
      <FindingTypesTable types={types} glossaryState={loadingChart()} onSelectType={vi.fn()} />,
    );

    // When se mira el bloque
    // Then avisa y no enseña filas que en un segundo cambiarían de contenido
    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("los graves se abren y el resto queda para profundizar", () => {
    // Given 3 tipos: uno grave, uno aviso y uno informativo
    const { container } = render(
      <FindingTypesTable
        types={types}
        glossaryState={readyChart(glossary)}
        onSelectType={vi.fn()}
      />,
    );

    // When se miran los grupos
    const groups = [...container.querySelectorAll("details")];

    // Then solo el de graves llega abierto: pintar 28.000 filas no informa
    expect(groups).toHaveLength(3);
    expect(groups.filter((group) => group.open)).toHaveLength(1);
    expect(groups[0].open).toBe(true);
  });

  it("la gravedad se lee escrita y con su significado, sin depender del color", () => {
    // Given la tabla pintada
    renderTable();

    // When se buscan las etiquetas de gravedad
    // Then están las tres palabras y qué implica cada una, en su propio grupo
    expect(screen.getAllByText("Grave").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aviso").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Informativo").length).toBeGreaterThan(0);
    expect(screen.getByText(/compromete el día/)).toBeInTheDocument();
  });

  it("elegir un tipo lo manda al explorador de hallazgos", () => {
    // Given la tabla y su callback
    const onSelectType = renderTable();

    // When se pulsa el botón de un tipo
    fireEvent.click(screen.getByRole("button", { name: /ruido_excesivo/ }));

    // Then el filtro sale con el tipo elegido
    expect(onSelectType).toHaveBeenCalledWith("ruido_excesivo");
  });
});
