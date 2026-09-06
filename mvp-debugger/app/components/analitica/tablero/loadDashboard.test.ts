// Los cuatro estados nacen acá: el cargador es el único punto donde se decide
// si el tablero muestra números, un vacío con motivo o un error. Se prueba con
// un `fetch` inyectado, así que ninguna prueba toca la red ni depende del
// servicio levantado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dashboardPayload } from "@/app/components/analitica/tablero/dashboardFixture";
import { loadDashboard, type ServerFetch } from "@/app/components/analitica/tablero/loadDashboard";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const RANGE: DateRange = { from: "2025-09-01", toExclusive: "2026-06-02", granularity: "week" };

function respondWith(body: unknown, status = 200): ServerFetch {
  return vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

describe("loadDashboard", () => {
  // El cargador registra todo fallo antes de traducirlo: se silencia la salida
  // para no ensuciar el informe de pruebas, no para dejar de comprobarlo.
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorLog.mockRestore();
  });

  it("devuelve `ready` con el resumen cuando el servicio responde bien", async () => {
    // Given un servicio que responde el cuerpo real del resumen
    const httpFetch = respondWith(dashboardPayload());

    // When se carga el tablero
    const state = await loadDashboard(RANGE, httpFetch);

    // Then el estado es `ready` y trae las dos energías ya separadas
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;
    expect(state.data.accounts.recorded).toMatchObject({ value: 1392.12 });
    expect(state.data.accounts.plant).toMatchObject({ value: 1572.2 });
  });

  it("pide solo el rango, sin granularidad, al endpoint del resumen", async () => {
    // Given un servicio que responde bien
    const httpFetch = respondWith(dashboardPayload());

    // When se carga el tablero
    await loadDashboard(RANGE, httpFetch);

    // Then la petición es UNA sola y lleva desde/hasta tal como los pidió la URL
    expect(httpFetch).toHaveBeenCalledTimes(1);
    const url = vi.mocked(httpFetch).mock.calls[0][0];
    expect(url).toContain("/analitica/resumen?");
    expect(url).toContain("desde=2025-09-01");
    expect(url).toContain("hasta=2026-06-02");
    expect(url).not.toContain("granularidad");
  });

  it("devuelve `empty` con motivo cuando el rango no toca ni un día de la base", async () => {
    // Given un rango fuera de cobertura, que el servicio contesta con 200
    const warning = "no hay ni un dia de calendario en el rango pedido";
    const httpFetch = respondWith(
      dashboardPayload({
        confianza: {
          dias_en_rango: 0,
          dias_con_datos: 0,
          dias_utilizables: 0,
          cobertura: 0,
          advertencia: warning,
        },
      }),
    );

    // When se carga el tablero
    const state = await loadDashboard(RANGE, httpFetch);

    // Then es un vacío explicado, y no nueve casillas repitiendo «sin dato»
    expect(state.status).toBe("empty");
    if (state.status !== "empty") return;
    expect(state.reason.code).toBe("OUT_OF_COVERAGE");
    expect(state.reason.message).toBe(warning);
  });

  it("devuelve `empty` NO_ROWS cuando el rango existe pero ningún día grabó", async () => {
    // Given un rango de calendario válido en el que nadie registró nada
    const httpFetch = respondWith(
      dashboardPayload({
        confianza: {
          dias_en_rango: 31,
          dias_con_datos: 0,
          dias_utilizables: 0,
          cobertura: 0,
        },
      }),
    );

    // When se carga el tablero
    const state = await loadDashboard(RANGE, httpFetch);

    // Then el motivo distingue «no hay días» de «los días no tienen filas»
    expect(state.status).toBe("empty");
    if (state.status !== "empty") return;
    expect(state.reason.code).toBe("NO_ROWS");
  });

  it("devuelve `error` legible cuando el servicio falla, sin lanzar", async () => {
    // Given un servicio que revienta con 500
    const httpFetch = respondWith({ detail: "boom" }, 500);

    // When se carga el tablero
    const state = await loadDashboard(RANGE, httpFetch);

    // Then el fallo llega como estado, no como excepción que tumbe la página, y
    // queda registrado con su detalle técnico en vez de tragarse
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.message).toBe("el servicio de análisis devolvió un error");
    expect(errorLog).toHaveBeenCalledOnce();
  });

  it("trata un 200 con la forma equivocada como error y no como tablero vacío", async () => {
    // Given un 200 cuyo cuerpo no cumple el contrato
    const httpFetch = respondWith({ ventana: { desde: "x" } });

    // When se carga el tablero
    const state = await loadDashboard(RANGE, httpFetch);

    // Then se dice que la respuesta no tiene la forma esperada: pintar casillas
    // con `undefined` sería peor que no pintar nada
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.message).toBe("la respuesta del servicio no tiene la forma esperada");
  });

  it("devuelve `error` de red cuando el servicio ni siquiera contesta", async () => {
    // Given un servicio inalcanzable
    const httpFetch: ServerFetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    // When se carga el tablero
    const state = await loadDashboard(RANGE, httpFetch);

    // Then el mensaje habla de contacto, que es lo que la persona puede accionar
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.message).toBe("no se pudo contactar al servidor");
  });
});
