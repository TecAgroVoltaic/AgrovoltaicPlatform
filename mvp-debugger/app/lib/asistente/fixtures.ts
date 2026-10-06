// Fixtures que cumplen el contrato de docs/referencia/contratos-asistente-alertas.md
// (§1 ChartSpec, §2 DescargaSpec, §3 eventos SSE). Solo para pruebas: el backend
// real se construye en paralelo contra el mismo documento.
import type { ChartSpecKind } from "@/app/lib/asistente/contracts/chartSpec";

type SpecFixture = Readonly<Record<string, unknown>> & { readonly datos: Readonly<Record<string, unknown>> };

export const CHART_SPEC_KINDS: readonly ChartSpecKind[] = ["serie", "barras", "cajas", "carpeta", "dispersion", "crestas"];

export const CHART_SPEC_BY_KIND: Readonly<Record<ChartSpecKind, SpecFixture>> = {
  serie: {
    version: 1,
    tipo: "serie",
    titulo: "Potencia PV1",
    subtitulo: "2026-08-01 a 2026-08-31 · media diaria",
    unidad: "W",
    datos: {
      unit: "W",
      lines: [
        {
          id: "potencia_pv1_w",
          label: "Potencia PV1",
          points: [
            { timestamp: "2026-08-01T00:00:00", value: 410.5 },
            { timestamp: "2026-08-02T00:00:00", value: null },
          ],
        },
      ],
    },
  },
  barras: {
    version: 1,
    tipo: "barras",
    titulo: "Irradiación mensual",
    unidad: "kWh/m2",
    datos: {
      unit: "kWh/m2",
      categories: ["2026-07", "2026-08"],
      series: [{ id: "ghi", label: "GHI", values: [152.1, 160.4] }],
    },
  },
  cajas: {
    version: 1,
    tipo: "cajas",
    titulo: "Temperatura por mes",
    unidad: "°C",
    datos: {
      unit: "°C",
      // Como lo manda el backend: sin `outliers`, y un mes sin dato con count 0 y ceros.
      boxes: [
        { label: "2026-07", min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 },
        { label: "2026-08", min: 18, q1: 24, median: 31, q3: 40, max: 55, count: 8000 },
      ],
    },
  },
  carpeta: {
    version: 1,
    tipo: "carpeta",
    titulo: "Irradiancia día-hora",
    unidad: "W/m2",
    datos: {
      unit: "W/m2",
      columns: ["2026-08-01", "2026-08-02"],
      rows: ["11", "12"],
      cells: [
        { column: 0, row: 0, value: 800 },
        { column: 1, row: 1, value: null },
      ],
    },
  },
  dispersion: {
    version: 1,
    tipo: "dispersion",
    titulo: "Potencia contra irradiancia",
    unidad: "W",
    datos: {
      points: [
        { x: 500, y: 600 },
        { x: 800, y: 950, label: "2026-08-01 12:00" },
      ],
      fit: { slope: 1.17, intercept: 12.3, r2: 0.91 },
      xUnit: "W/m2",
      yUnit: "W",
    },
  },
  crestas: {
    version: 1,
    tipo: "crestas",
    titulo: "Distribución de temperatura por sensor",
    unidad: "°C",
    datos: {
      unit: "°C",
      curves: [
        { id: "temp_inclinado", label: "Inclinado", x: [20, 30, 40], density: [0.1, 1, 0.2], tailProbability: null },
      ],
      threshold: { value: 85, label: "85 °C" },
    },
  },
};

export const DESCARGA_SPEC = {
  version: 1,
  tabla: "radiacion_calibrada",
  fuente: "supabase",
  formato: "csv",
  desde: "2026-08-01",
  hasta: "2026-08-31",
  columnas: ["timestamp", "irradiancia_incidente_wm2"],
  filtros: { caja: [], sensor_tipo: [] },
  paso: 0,
  filas_estimadas: 8640,
  cota: false,
  nombre_sugerido: "radiacion_calibrada_2026-08-01_2026-08-31.csv",
  url: "/datos/exportar?tabla=radiacion_calibrada&formato=csv&desde=2026-08-01&hasta=2026-08-31&columnas=timestamp,irradiancia_incidente_wm2",
} as const;

export const CHART_TOOL_INPUT = {
  tipo: "serie",
  variables: ["potencia_pv1_w"],
  desde: "2026-08-01",
  hasta: "2026-09-01",
} as const;

/** Un evento SSE con el formato del cable (`event:` + `data:` + línea en blanco). */
export function sseEvent(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Un turno completo: pide un gráfico, lo arma y lo comenta. */
export function chartTurnEvents(): string[] {
  const chartStep = {
    tipo: "tool",
    nombre: "graficar",
    input: CHART_TOOL_INPUT,
    salida: { resumen: { n: 2 }, _grafico: CHART_SPEC_BY_KIND.serie, nota: "..." },
    error: false,
    ms: 120,
  };
  const pasos = [
    {
      tipo: "modelo",
      texto: "Grafico la potencia de agosto.",
      solicita: [{ id: "toolu_1", nombre: "graficar", input: CHART_TOOL_INPUT }],
      stop_reason: "tool_use",
    },
    chartStep,
    { tipo: "modelo", texto: "La potencia **subió** a fin de mes.", solicita: [], stop_reason: "end_turn" },
  ];
  return [
    sseEvent("inicio", { modelo: "claude-sonnet-5-5" }),
    // Los deltas traen TODOS los turnos, también el intermedio que pide la tool.
    sseEvent("texto", { delta: "Grafico la potencia de agosto." }),
    sseEvent("paso", pasos[0]),
    sseEvent("tool_inicio", { id: "toolu_1", nombre: "graficar", input: CHART_TOOL_INPUT }),
    sseEvent("paso", chartStep),
    sseEvent("texto", { delta: "La potencia **subió** " }),
    sseEvent("texto", { delta: "a fin de mes." }),
    sseEvent("paso", pasos[2]),
    sseEvent("fin", {
      respuesta: "La potencia **subió** a fin de mes.",
      modelo: "claude-sonnet-5-5",
      pasos,
      usage: { input_tokens: 1200, output_tokens: 80 },
      costo: { usd_total: 0.0042 },
      ms_total: 3100,
    }),
  ];
}

/** Respuesta HTTP cuyo cuerpo entrega `chunks` uno por uno, como la red. */
export function streamedResponse(chunks: readonly string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    ...init,
  });
}

/** Un cuerpo que nunca termina ni manda nada hasta que lo abortan. */
export function hangingFetch(): (input: string, init?: RequestInit) => Promise<Response> {
  return (_input, init) =>
    new Promise<Response>((resolve, reject) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            const abort = new DOMException("aborted", "AbortError");
            controller.error(abort);
            reject(abort);
          });
        },
      });
      resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    });
}
