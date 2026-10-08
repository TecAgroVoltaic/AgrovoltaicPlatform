// Lo que protege: el flujo entero de la sección contra un backend simulado que
// cumple el contrato. Pregunta -> pasos en vivo -> gráfico y texto -> pasos
// plegados -> «Descargar estos datos» -> tarjeta de descarga; y los caminos de
// fallo, de historial y de cambio de hilo.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssistantView } from "@/app/components/asistente/AssistantView";
import { SectionMenuProvider } from "@/app/components/analitica/SectionMenu";
import { DESCARGA_SPEC, chartTurnEvents, sseEvent, streamedResponse } from "@/app/lib/asistente/fixtures";
import { buildExamples } from "@/app/lib/asistente/examples";
import type { AssistantChatDeps } from "@/app/lib/asistente/useAssistantChat";
import { THREADS_STORAGE_KEY } from "@/app/lib/asistente/threadStorage";
import { controllableStream, memoryStorage, requestBody } from "@/app/lib/asistente/testSupport";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/asistente",
  useSearchParams: () => new URLSearchParams("desde=2026-08-01&hasta=2026-09-01&granularidad=dia"),
}));

// Sin cobertura: los ejemplos sin fecha, y el estado vacío no sale a la red.
const EXAMPLES = buildExamples({ coverage: null, latestOutageDate: null });
vi.mock("@/app/lib/asistente/useExamples", () => ({
  useExamples: () => ({ examples: EXAMPLES, bounds: null }),
}));

const CHART_QUESTION = EXAMPLES.find((example) => example.kind === "chart")?.question ?? "";

function renderView(deps: AssistantChatDeps) {
  return render(
    <SectionMenuProvider>
      <AssistantView deps={deps} />
    </SectionMenuProvider>,
  );
}

function exportTurnEvents(): string[] {
  const step = { tipo: "tool", nombre: "exportar_datos", input: {}, salida: { _descarga: DESCARGA_SPEC }, error: false };
  return [
    sseEvent("paso", step),
    sseEvent("fin", { respuesta: "Ahí tenés la descarga.", pasos: [step, { tipo: "modelo", texto: "Ahí tenés la descarga.", stop_reason: "end_turn" }] }),
  ];
}

describe("AssistantView", () => {
  it("sin conversación muestra el estado vacío, y un ejemplo arranca la pregunta con el rango como contexto", async () => {
    // Given la sección vacía y un backend que grafica
    const httpFetch = vi.fn(async (_url: string, _init?: RequestInit) => streamedResponse(chartTurnEvents()));
    renderView({ storage: memoryStorage, httpFetch });
    expect(screen.getByRole("heading", { name: "¿Qué querés saber de la planta?" })).toBeInTheDocument();
    EXAMPLES.forEach((example) => expect(screen.getByRole("button", { name: example.question })).toBeInTheDocument());
    // When se pulsa el ejemplo del gráfico
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    // Then llega el gráfico y el comentario, y el contexto lleva el rango de la URL
    expect(await screen.findByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    expect(screen.getByText("subió")).toBeInTheDocument();
    expect(requestBody(httpFetch, 0).contexto).toContain("2026-08-01 a 2026-08-31");
  });

  it("mientras corre lista la tool en curso con «Detener», y Detener corta la respuesta", async () => {
    // Given una respuesta que queda abierta con una tool corriendo
    const stream = controllableStream();
    renderView({ storage: memoryStorage, httpFetch: stream.fetch });
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    stream.push(sseEvent("tool_inicio", { id: "t1", nombre: "graficar", input: {} }));
    // Then el paso se ve en vivo, con el texto de progreso
    const steps = await screen.findByRole("list", { name: "Pasos del asistente" });
    expect(within(steps).getByText(/Armando el gráfico…/)).toBeInTheDocument();
    // When se pulsa Detener
    fireEvent.click(screen.getByRole("button", { name: "Detener" }));
    // Then la respuesta queda cerrada como cancelada
    expect(await screen.findByRole("alert")).toHaveTextContent("Cancelaste esta respuesta.");
  });

  it("al terminar, los pasos se pliegan a una línea que despliega la traza", async () => {
    // Given una respuesta terminada con una tool
    renderView({ storage: memoryStorage, httpFetch: async () => streamedResponse(chartTurnEvents()) });
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    const toggle = await screen.findByRole("button", { name: "1 consulta · 3,1 s" });
    // Then la lista en vivo ya no está y la traza empieza plegada
    expect(screen.queryByRole("list", { name: "Pasos del asistente" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Ejecutó el algoritmo")).toBeNull();
    // When se despliega
    fireEvent.click(toggle);
    // Then se ve la traza legible del paso
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ejecutó el algoritmo")).toBeInTheDocument();
  });

  it("«Descargar estos datos» pide la exportación por chat y la respuesta trae la tarjeta", async () => {
    // Given una respuesta con gráfico
    const httpFetch = vi
      .fn(async (_url: string, _init?: RequestInit) => streamedResponse(chartTurnEvents()))
      .mockImplementationOnce(async () => streamedResponse(chartTurnEvents()))
      .mockImplementationOnce(async () => streamedResponse(exportTurnEvents()));
    renderView({ storage: memoryStorage, httpFetch });
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    // When se piden los datos del gráfico (deshabilitado mientras la respuesta llega)
    await waitFor(() => expect(screen.getByRole("button", { name: "Descargar estos datos" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Descargar estos datos" }));
    await waitFor(() => expect(httpFetch).toHaveBeenCalledTimes(2));
    // Then el pedido es un mensaje de texto con las mismas variables y rango
    const lastQuestion = requestBody(httpFetch, 1).mensajes.at(-1)?.texto ?? "";
    expect(lastQuestion).toContain("potencia_pv1_w");
    expect(lastQuestion).toContain("desde 2026-08-01 hasta 2026-09-01");
    // And la tarjeta muestra el archivo, filas y columnas, con su botón
    const card = await screen.findByRole("group", { name: `Descarga: ${DESCARGA_SPEC.nombre_sugerido}` });
    expect(within(card).getByText(/8.640 filas estimadas · timestamp, irradiancia_incidente_wm2 · hora local/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Descargar" })).toBeInTheDocument();
  });

  it("un fallo se ve en pantalla y «Reintentar» vuelve a preguntar lo mismo", async () => {
    // Given la puerta del chat cerrada en el primer intento
    const httpFetch = vi
      .fn(async (_url: string, _init?: RequestInit) => streamedResponse(chartTurnEvents()))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ error: "chat desactivado" }), { status: 503 }));
    renderView({ storage: memoryStorage, httpFetch });
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chat desactivado");
    // When se reintenta
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    // Then responde, sin el error y con una sola copia de la pregunta en el historial
    expect(await screen.findByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requestBody(httpFetch, 1).mensajes).toEqual([{ rol: "user", texto: CHART_QUESTION }]);
  });

  it("la conversación queda guardada y vuelve al recargar, con su título y su costo", async () => {
    // Given una conversación terminada
    const storage = memoryStorage();
    const access = () => storage;
    const httpFetch = async () => streamedResponse(chartTurnEvents());
    const first = renderView({ storage: access, httpFetch });
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    await screen.findByRole("img", { name: "Potencia PV1" });
    await waitFor(() => expect(storage.getItem(THREADS_STORAGE_KEY)).toContain("Potencia PV1"));
    first.unmount();
    // When se vuelve a abrir la sección
    renderView({ storage: access, httpFetch });
    // Then el gráfico sigue ahí, la cabecera nombra el hilo y suma lo gastado
    expect(await screen.findByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent(CHART_QUESTION);
    expect(within(title.parentElement ?? document.body).getByText(/^2 mensajes · /)).toBeInTheDocument();
    expect(screen.getByText("USD 0,004")).toBeInTheDocument();
  });
});
