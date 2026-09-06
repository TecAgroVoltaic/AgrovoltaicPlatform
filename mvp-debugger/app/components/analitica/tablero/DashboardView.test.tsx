// Lo que de verdad importa de esta vista no es que pinte números, sino que no
// se los pueda leer mal: que la frescura se anuncie como alerta, que las dos
// energías no se confundan, que «últimos 7 días» diga contra qué se cuentan y
// que una casilla sin dato muestre su motivo en vez de un cero.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DashboardView } from "@/app/components/analitica/tablero/DashboardView";
import { dashboardPayload } from "@/app/components/analitica/tablero/dashboardFixture";
import { dashboardSummarySchema, type DashboardSummary } from "@/app/lib/analitica/contracts/tablero";
import { emptyChart, errorChart, loadingChart, readyChart } from "@/app/components/charts";

function summaryFrom(patch: Record<string, unknown> = {}): DashboardSummary {
  return dashboardSummarySchema.parse(dashboardPayload(patch));
}

describe("DashboardView", () => {
  // La configuración de Vitest corre con `globals: false`, así que Testing
  // Library no engancha su limpieza automática: sin esto, cada prueba vería
  // también el DOM de la anterior y las búsquedas encontrarían duplicados.
  afterEach(cleanup);

  it("mientras carga no muestra ninguna casilla", () => {
    // Given un tablero todavía sin respuesta
    render(<DashboardView state={loadingChart()} />);

    // When se mira la pantalla
    // Then hay un aviso de carga y ni un número
    expect(screen.getByRole("status")).toHaveTextContent("Cargando el tablero");
    expect(screen.queryByText(/¿Cuánta energía registramos\?/)).toBeNull();
  });

  it("con un fallo del servicio explica qué pasó y no deja casillas a medias", () => {
    // Given un fallo ya traducido a mensaje
    render(<DashboardView state={errorChart("el servidor tardó demasiado en responder")} />);

    // When se mira la pantalla
    const alert = screen.getByRole("alert");

    // Then el error se anuncia como tal
    expect(alert).toHaveTextContent("No se pudo cargar el tablero");
    expect(alert).toHaveTextContent("el servidor tardó demasiado en responder");
  });

  it("con el rango vacío muestra el MOTIVO, nunca una pantalla en blanco", () => {
    // Given un rango que cae fuera de la cobertura de la base
    const state = emptyChart<DashboardSummary>("OUT_OF_COVERAGE", {
      message: "no hay ni un dia de calendario en el rango pedido",
      hint: "Los datos van del 2024-11-10 al 2026-06-01.",
    });

    // When se pinta el tablero
    render(<DashboardView state={state} />);

    // Then se lee la causa y la pista, no un vacío mudo
    expect(screen.getByText("no hay ni un dia de calendario en el rango pedido")).toBeVisible();
    expect(screen.getByText("Los datos van del 2024-11-10 al 2026-06-01.")).toBeVisible();
  });

  it("anuncia la frescura como alerta cuando el sistema dejó de reportar", () => {
    // Given un resumen cuyo último dato tiene 92 días
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se busca el aviso de frescura
    const alert = screen.getByRole("alert", { name: "Última actualización del dato" });

    // Then es una alerta que dice la antigüedad y avisa de que todo es pasado
    expect(alert).toHaveTextContent("El sistema dejó de reportar");
    expect(alert).toHaveTextContent("92 días sin dato nuevo");
    expect(alert).toHaveTextContent("2026-06-01, 17:55");
    expect(alert).toHaveTextContent("no la producción de hoy");
  });

  it("presenta las dos energías como respuestas a preguntas distintas", () => {
    // Given un resumen con energía registrada y energía de planta
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se leen las dos casillas de total
    const recorded = screen.getByRole("heading", { name: "¿Cuánta energía registramos?" })
      .parentElement as HTMLElement;
    const plant = screen.getByRole("heading", { name: "¿Cuánta energía produjo la planta?" })
      .parentElement as HTMLElement;

    // Then cada una lleva su número, su definición y se dice cuál manda
    expect(within(recorded).getByText(/^1\D?392,1$/)).toBeVisible();
    expect(within(recorded).getByText("Es la que usan las otras ocho casillas")).toBeVisible();
    expect(within(plant).getByText(/^1\D?572,2$/)).toBeVisible();
    expect(within(plant).getByText(/Contador de vida del inversor/)).toBeVisible();
    expect(screen.getByText(/902,2 kWh/)).toBeVisible();
  });

  it("dice que los últimos 7 días se cuentan contra el último día CON DATOS", () => {
    // Given un resumen cuyo último día con datos es el 2026-06-01
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se lee la ventana reciente y los títulos de sus tres casillas
    const window = screen.getByText(/2026-05-26 a 2026-06-01/);
    const titles = screen.getAllByText("Últimos 7 días con datos");

    // Then la ventana se declara UNA vez con sus fechas (repetirla en cada
    // casilla era la misma advertencia tres veces), y las tres casillas llevan
    // «con datos» en el título: ninguna se puede leer como el calendario
    expect(window).toHaveTextContent("no los últimos del calendario");
    expect(titles).toHaveLength(3);
  });

  it("nombra los arreglos por su geometría y nunca solo por PV1 y PV2", () => {
    // Given el resumen del período
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se leen las cabeceras de los dos arreglos
    const tilted = screen.getByRole("region", { name: "Arreglo Inclinado (PV1)" });
    const vertical = screen.getByRole("region", { name: "Arreglo Vertical (PV2)" });

    // Then el subtítulo de cada uno lleva inclinación, azimut y potencia pico
    expect(within(tilted).getByText(/20° de inclinación/)).toHaveTextContent(/1\D?420 Wp/);
    expect(within(tilted).getByText(/20° de inclinación/)).toHaveTextContent("azimut 150°");
    expect(within(vertical).getByText(/90° de inclinación/)).toHaveTextContent("azimut 50°");
  });

  it("una casilla sin dato muestra su motivo y no un cero", () => {
    // Given un período en el que el contador de vida no dejó ninguna lectura
    const summary = summaryFrom({
      energia_ac: {
        registrada_kwh: { valor: 1392.12, n: 28965, unidad: "kWh" },
        planta_kwh: { valor: null, n: 0, unidad: "kWh", motivo: "sin lecturas del contador" },
        no_registrada_kwh: { valor: null, n: 0, unidad: "kWh", motivo: "sin lecturas del contador" },
        dias_con_cierre_ac: 228,
        dias_con_contador_de_vida: 0,
      },
    });

    // When se pinta el tablero
    render(<DashboardView state={readyChart(summary)} />);
    const plant = screen.getByRole("heading", { name: "¿Cuánta energía produjo la planta?" })
      .parentElement as HTMLElement;

    // Then esa casilla dice «sin dato» con su motivo, y no aparece un 0 ni la unidad
    expect(within(plant).getByText("sin dato")).toBeVisible();
    expect(within(plant).getByText("sin lecturas del contador")).toBeVisible();
    expect(within(plant).queryByText("0")).toBeNull();
  });

  it("separa la avería de la planta del problema de calidad del dato", () => {
    // Given un resumen con el bloque de disponibilidad
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se buscan las dos tarjetas de contexto
    const quality = screen.getByRole("heading", { name: "Cuánto del período se midió" });
    const outage = screen.getByRole("heading", { name: /una avería, no un dato malo/ });

    // Then son dos tarjetas distintas, y la advertencia que se lee es la del
    // BACKEND tal cual: decía lo mismo que el párrafo propio que había al lado
    expect(quality).toBeVisible();
    expect(outage).toBeVisible();
    expect(outage.parentElement).not.toBe(quality.parentElement);
    expect(screen.getByText(/Es una averia que revisar, no un problema de calidad de dato/))
      .toBeVisible();
  });

  it("los conteos del contexto se dibujan y siguen legibles como números", () => {
    // Given el resumen, con 274 días de rango, 228 con datos y 48 utilizables
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se lee la tarjeta de cuánto se midió
    const usable = screen.getByText("48 de 274 días");

    // Then el embudo está dibujado Y contado: la barra es geometría, pero el
    // número que se lee sigue siendo el que mandó el backend
    expect(usable).toBeVisible();
    expect(screen.getByText("228 de 274 días")).toBeVisible();
    expect(screen.getByText("90 de 228 días")).toBeVisible();
  });

  it("la metodología de AC contra DC sigue en la página, plegada tras su gesto", () => {
    // Given el tablero con datos
    render(<DashboardView state={readyChart(summaryFrom())} />);

    // When se busca el pliegue que la guarda
    const summary = screen.getByText("Por qué Inclinado + Vertical no suman el total");

    // Then el texto NO se borró: vive dentro de un <details>, a un clic de quien
    // lo necesite y fuera del camino de quien no
    expect(summary.tagName).toBe("SUMMARY");
    expect(screen.getByText(/el inversor no reporta alterna por arreglo/)).toBeInTheDocument();
  });
});
