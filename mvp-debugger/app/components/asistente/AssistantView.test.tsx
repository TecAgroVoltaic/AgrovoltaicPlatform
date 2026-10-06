// Lo que protege: el flujo entero de la sección contra un backend simulado que
// cumple el contrato. Pregunta -> pasos en vivo -> gráfico y texto -> «Descargar
// estos datos» -> tarjeta de descarga; y los caminos de fallo y de historial.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssistantView } from "@/app/components/asistente/AssistantView";
import { EXAMPLE_QUESTIONS } from "@/app/components/asistente/EmptyState";
import { DESCARGA_SPEC, chartTurnEvents, sseEvent, streamedResponse } from "@/app/lib/asistente/fixtures";
import { THREADS_STORAGE_KEY } from "@/app/lib/asistente/threadStorage";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/asistente",
  useSearchParams: () => new URLSearchParams("desde=2026-08-01&hasta=2026-09-01&granularidad=dia"),
}));

const CHART_QUESTION = "Graficá la potencia de agosto";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function exportTurnEvents(): string[] {
  const step = { tipo: "tool", nombre: "exportar_datos", input: {}, salida: { _descarga: DESCARGA_SPEC }, error: false };
  return [
    sseEvent("paso", step),
    sseEvent("fin", { respuesta: "Ahí tenés la descarga.", pasos: [step, { tipo: "modelo", texto: "Ahí tenés la descarga.", stop_reason: "end_turn" }] }),
  ];
}

/** Un stream que se abre ahora y se alimenta desde el test. */
function controllableStream() {
  const encoder = new TextEncoder();
  let push: (frame: string) => void = () => undefined;
  let close: () => void = () => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (frame) => controller.enqueue(encoder.encode(frame));
      close = () => controller.close();
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    push: (frame: string) => push(frame),
    close: () => close(),
  };
}

function requestBody(httpFetch: ReturnType<typeof vi.fn>, call: number): { mensajes: { texto: string }[]; contexto: string } {
  const init: unknown = httpFetch.mock.calls[call]?.[1];
  const body = init && typeof init === "object" && "body" in init ? String(init.body) : "{}";
  return JSON.parse(body);
}

describe("AssistantView", () => {
  it("sin conversación muestra los ejemplos, y un ejemplo arranca la pregunta con el rango como contexto", async () => {
    // Given la sección vacía y un backend que grafica
    const httpFetch = vi.fn(async (_url: string, _init?: RequestInit) => streamedResponse(chartTurnEvents()));
    render(<AssistantView deps={{ storage: memoryStorage, httpFetch }} />);
    EXAMPLE_QUESTIONS.forEach((question) => expect(screen.getByRole("button", { name: question })).toBeInTheDocument());
    // When se pulsa el ejemplo del gráfico
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    // Then llega el gráfico y el comentario, y el contexto lleva el rango de la URL
    expect(await screen.findByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    expect(screen.getByText("subió")).toBeInTheDocument();
    expect(requestBody(httpFetch, 0).contexto).toContain("2026-08-01 a 2026-08-31");
  });

  it("muestra la tool en curso mientras corre", async () => {
    const stream = controllableStream();
    render(<AssistantView deps={{ storage: memoryStorage, httpFetch: async () => stream.response }} />);
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    stream.push(sseEvent("tool_inicio", { id: "t1", nombre: "graficar", input: {} }));
    expect(await screen.findByText(/Armando el gráfico/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Detener" })).toBeInTheDocument();
    stream.close();
  });

  it("«Descargar estos datos» pide la exportación por chat y la respuesta trae la tarjeta", async () => {
    // Given una respuesta con gráfico
    const httpFetch = vi
      .fn(async (_url: string, _init?: RequestInit) => streamedResponse(chartTurnEvents()))
      .mockImplementationOnce(async () => streamedResponse(chartTurnEvents()))
      .mockImplementationOnce(async () => streamedResponse(exportTurnEvents()));
    render(<AssistantView deps={{ storage: memoryStorage, httpFetch }} />);
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    // When se pide descargar los datos del gráfico
    // (mientras la respuesta llega el botón está, pero deshabilitado)
    await waitFor(() => expect(screen.getByRole("button", { name: "Descargar estos datos" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Descargar estos datos" }));
    await waitFor(() => expect(httpFetch).toHaveBeenCalledTimes(2));
    // Then el pedido es un mensaje de texto con las mismas variables y rango
    const lastQuestion = requestBody(httpFetch, 1).mensajes.at(-1)?.texto ?? "";
    expect(lastQuestion).toContain("potencia_pv1_w");
    expect(lastQuestion).toContain("desde 2026-08-01 hasta 2026-09-01");
    // And la tarjeta muestra el archivo y el rango inclusivo, con su botón
    expect(await screen.findByText(DESCARGA_SPEC.nombre_sugerido)).toBeInTheDocument();
    expect(screen.getByText(/CSV · 8.640 filas · radiacion_calibrada · 2026-08-01 a 2026-08-31/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar" })).toBeInTheDocument();
  });

  it("un fallo se ve en pantalla y «Reintentar» vuelve a preguntar lo mismo", async () => {
    // Given la puerta del chat cerrada en el primer intento
    const httpFetch = vi
      .fn(async (_url: string, _init?: RequestInit) => streamedResponse(chartTurnEvents()))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ error: "chat desactivado" }), { status: 503 }));
    render(<AssistantView deps={{ storage: memoryStorage, httpFetch }} />);
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chat desactivado");
    // When se reintenta
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    // Then responde, sin el error y con una sola copia de la pregunta en el historial
    expect(await screen.findByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requestBody(httpFetch, 1).mensajes).toEqual([{ rol: "user", texto: CHART_QUESTION }]);
  });

  it("la conversación queda guardada y vuelve al recargar", async () => {
    // Given una conversación terminada
    const storage = memoryStorage();
    const access = () => storage;
    const httpFetch = async () => streamedResponse(chartTurnEvents());
    const first = render(<AssistantView deps={{ storage: access, httpFetch }} />);
    fireEvent.click(screen.getByRole("button", { name: CHART_QUESTION }));
    await screen.findByRole("img", { name: "Potencia PV1" });
    await waitFor(() => expect(storage.getItem(THREADS_STORAGE_KEY)).toContain("Potencia PV1"));
    first.unmount();
    // When se vuelve a abrir la sección
    render(<AssistantView deps={{ storage: access, httpFetch }} />);
    // Then el gráfico sigue ahí, sin pedir nada nuevo
    expect(await screen.findByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Conversaciones guardadas" })).toHaveDisplayValue(CHART_QUESTION);
  });
});
