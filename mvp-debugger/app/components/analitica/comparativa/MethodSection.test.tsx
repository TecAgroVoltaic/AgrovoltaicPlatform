// Lo que estas pruebas protegen: que la sección diga las cuatro cosas que no se
// pueden perder por el camino.
//
//   1. Cada método viene con SU muestra, y los dos caminos de energía nunca se
//      funden en un mismo número.
//   2. El PR imposible se marca, se lee sin abrir nada y NO gana la comparación.
//   3. El aviso de que las variantes POA esperan el aval de Hugo llega a la
//      pantalla y no se queda en el JSON.
//   4. Un rango sin datos explica POR QUÉ está vacío, en vez de dibujar ceros.
//
// Los números exactos viven detrás del pliegue: eso también se prueba abriéndolo,
// no borrando la afirmación.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MethodSection } from "@/app/components/analitica/comparativa/MethodSection";
import {
  arrayComparison,
  COUNTER_UNIT_NOTE,
  emptyPerformanceReport,
  ENERGY_PATHS_WARNING,
  ENERGY_PATHS_WITHOUT_WARNING,
  performanceReport,
  POA_OUT_OF_COVERAGE,
} from "@/app/components/analitica/comparativa/fixtures";
import { failure } from "@/app/lib/analitica/errors";

const okComparison = () => ({ ok: true, data: arrayComparison() }) as const;
const okReport = () => ({ ok: true, data: performanceReport() }) as const;

const methodTable = () => screen.getByRole("table", { name: /cada método/ });
const openDisclosure = (label: RegExp) => fireEvent.click(screen.getByText(label));

describe("MethodSection", () => {
  it("marca el PR imposible, lo deja sin ganador y no lo esconde", () => {
    // Given el período completo, donde el vertical contra POA frontal da 1,217
    render(
      <MethodSection report={okReport()} comparison={okComparison()} onRetry={vi.fn()} />,
    );

    // When se lee la tabla de métodos y el aviso que la acompaña
    // Then esos dos métodos quedan marcados, sin arreglo arriba, y el aviso con
    // los números del backend se lee sin abrir ningún pliegue
    expect(within(methodTable()).getAllByText("PR imposible")).toHaveLength(2);
    expect(screen.getByText(/PR mayor que 1, que es físicamente imposible/)).toBeVisible();
    expect(screen.getAllByText(/PR 1,217 en 197 días, con 138 días por encima de 1/)).toHaveLength(
      1,
    );
    expect(
      screen.getAllByText(/irradiancia con que se juzga este arreglo esta subestimada/),
    ).toHaveLength(2);
  });

  it("cada método trae su propia muestra y los caminos de energía no se funden", () => {
    // Given los seis métodos del PR más el cruce punto a punto
    render(
      <MethodSection report={okReport()} comparison={okComparison()} onRetry={vi.fn()} />,
    );

    // When se leen las muestras de la tabla
    // Then el contador va sobre 91 de 197 días, la integral sobre los 197, y el
    // cruce sobre las lecturas que logró emparejar
    const table = within(methodTable());
    expect(table.getAllByText("91 de 197 días")).toHaveLength(3);
    expect(table.getAllByText("197 de 197 días")).toHaveLength(3);
    expect(table.getByText(/3.041 de 28.996 lecturas/)).toBeInTheDocument();
    expect(screen.getByText(ENERGY_PATHS_WARNING)).toBeVisible();
  });

  it("los métodos legibles dan el mismo ganador, y el cruce es el que discrepa", () => {
    // Given los cuatro métodos que se pueden leer más el cruce
    render(
      <MethodSection report={okReport()} comparison={okComparison()} onRetry={vi.fn()} />,
    );

    // When se lee la columna de quién queda arriba
    // Then los cuatro coinciden y el único que deja arriba al vertical es el
    // cruce, que es también el que menos muestra conserva
    const table = within(methodTable());
    expect(table.getAllByText("Inclinado (PV1)")).toHaveLength(4);
    expect(table.getAllByText("Vertical (PV2)")).toHaveLength(1);
    expect(table.getByRole("row", { name: /Cruce punto a punto/ })).toHaveTextContent(
      "Vertical (PV2)",
    );
  });

  it("los números exactos esperan detrás del pliegue, y el pliegue los muestra", () => {
    // Given la sección con los seis métodos
    render(
      <MethodSection report={okReport()} comparison={okComparison()} onRetry={vi.fn()} />,
    );
    expect(screen.getByText("0,733")).not.toBeVisible();

    // When se abre «¿Cuánto da exactamente cada método?»
    openDisclosure(/Cuánto da exactamente cada método/);

    // Then aparecen los PR con sus tres decimales y la nota de unidades
    expect(screen.getByText("0,733")).toBeVisible();
    expect(screen.getByText("0,648")).toBeVisible();
    expect(screen.getByText(COUNTER_UNIT_NOTE)).toBeVisible();
  });

  it("el cruce punto a punto se explica al abrirlo, con la nota del backend", () => {
    // Given la sección con la comparación cargada
    render(
      <MethodSection report={okReport()} comparison={okComparison()} onRetry={vi.fn()} />,
    );

    // When se abre «¿Por qué el cruce punto a punto no es un Performance Ratio?»
    openDisclosure(/no es un Performance Ratio/);

    // Then están los dos cocientes con su unidad y el aviso que redactó el servicio
    expect(screen.getByText("0,883")).toBeVisible();
    expect(screen.getByText(/NO es un Performance Ratio/)).toBeVisible();
  });

  it("sin advertencia pinta la tabla igual y no deja un párrafo en blanco", () => {
    // Given un rango donde el contador cubre todos los días válidos y el
    // servicio manda `fuente_energia.advertencia` en null
    const report = performanceReport({ fuente_energia: ENERGY_PATHS_WITHOUT_WARNING });

    // When se renderiza la sección
    const { container } = render(
      <MethodSection
        report={{ ok: true, data: report }}
        comparison={okComparison()}
        onRetry={vi.fn()}
      />,
    );

    // Then la tabla de métodos sigue ahí, la nota de unidades también, y no
    // queda ningún párrafo vacío ocupando el lugar del aviso ausente
    expect(within(methodTable()).getAllByText("Inclinado (PV1)")).toHaveLength(4);
    expect(screen.getByText(COUNTER_UNIT_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(ENERGY_PATHS_WARNING)).not.toBeInTheDocument();
    const blankParagraphs = Array.from(container.querySelectorAll("p")).filter(
      (paragraph) => paragraph.textContent?.trim() === "",
    );
    expect(blankParagraphs).toHaveLength(0);
  });

  it("dice que las variantes POA esperan el aval de Hugo, sin plegarlo", () => {
    // Given un informe con `aval_pendiente`
    render(
      <MethodSection report={okReport()} comparison={okComparison()} onRetry={vi.fn()} />,
    );

    // When se busca el aviso
    // Then nombra a quien lo tiene que dar y a los dos insumos provisionales
    expect(
      screen.getByText(/Las variantes contra POA bifacial y POA frontal son provisionales/),
    ).toBeVisible();
    expect(screen.getByText(/esperan el aval de Hugo/)).toBeVisible();
    expect(screen.getByText(/deja abierta CUAL ecuacion de transposicion/)).toBeVisible();
  });

  it("un rango sin datos explica el motivo y no dibuja nada", () => {
    // Given un rango que el servicio devuelve con 200 y todo en null
    render(
      <MethodSection
        report={{ ok: true, data: emptyPerformanceReport() }}
        comparison={okComparison()}
        onRetry={vi.fn()}
      />,
    );

    // When se mira el lugar de la tabla
    // Then dice por qué está vacía, con el texto del backend, y no hay tabla
    expect(screen.getByText("Sin datos para este rango")).toBeInTheDocument();
    expect(screen.getByText(/no tiene ni un día con dato para medir el PR/)).toBeInTheDocument();
    expect(screen.getByText(POA_OUT_OF_COVERAGE)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("una consulta caída ofrece reintentar y no finge un resultado", () => {
    // Given una respuesta que nunca llegó
    const onRetry = vi.fn();
    render(
      <MethodSection
        report={{ ok: false, failure: failure("TIMEOUT") }}
        comparison={okComparison()}
        onRetry={onRetry}
      />,
    );

    // When se lee la sección
    // Then avisa del fallo y ofrece volver a intentar
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/tardó demasiado en responder/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
