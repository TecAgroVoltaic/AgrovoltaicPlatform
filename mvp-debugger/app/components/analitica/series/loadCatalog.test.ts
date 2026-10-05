// Lo que estas pruebas protegen: que el catálogo se resuelva en el servidor sin
// poder tumbar la página. Corre dentro del render del Server Component, así que
// una excepción acá no es un gráfico vacío: es un 500 y la pantalla entera se
// pierde, incluida la completitud, que no depende del catálogo para nada.
//
// Y valida el contrato con la forma REAL de `GET /analitica/variables`: si el
// backend renombra un campo, falla acá y no en el selector de alguien.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadVariableCatalog } from "@/app/components/analitica/series/loadCatalog";

const WIRE_CATALOG = {
  variables: [
    {
      clave: "potencia_pv1_w",
      etiqueta: "Potencia PV1 (inclinado)",
      unidad: "W",
      familia: "electrico",
      dato_desde: null,
      dato_hasta: null,
      hueco: null,
      fuente_ausente: null,
      graficable: true,
    },
    {
      clave: "energia_pv1_wh",
      etiqueta: "Energia DC del dia de PV1 (contador, kWh)",
      unidad: "kWh",
      familia: "electrico",
      dato_desde: null,
      dato_hasta: null,
      hueco: "solo 144 dias con dato, y NI UNO entre 2025-11 y 2026-02",
      fuente_ausente: null,
      graficable: true,
    },
    {
      clave: "velocidad_viento_ms",
      etiqueta: "Velocidad del viento",
      unidad: "m/s",
      familia: "ambiental",
      dato_desde: null,
      dato_hasta: null,
      hueco: null,
      fuente_ausente: "no hay anemometro en el sitio ni en las tablas ingestadas",
      graficable: false,
    },
  ],
  familias: ["ambiental", "electrico", "radiacion", "termico"],
  nota: "`graficable` dice si /analitica/series acepta esa clave.",
};

const fetchStub = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchStub));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function respondWith(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("loadVariableCatalog", () => {
  it("traduce el payload real, incluidos el gate y los dos porqués", async () => {
    // Given la respuesta del catálogo, sin sobre de `resultado`
    fetchStub.mockImplementation(() => respondWith(WIRE_CATALOG));

    // When se carga
    const load = await loadVariableCatalog();

    // Then llegan las tres variables con `graficable` como gate, el hueco
    // interior y la prosa de la fuente ausente, cada uno en su campo
    expect(load.status).toBe("ready");
    if (load.status !== "ready") return;
    const [power, energy, wind] = load.catalog.variables;
    expect(power.plottable).toBe(true);
    expect(energy.innerGap).toContain("NI UNO entre 2025-11 y 2026-02");
    expect(wind.plottable).toBe(false);
    expect(wind.missingSource).toContain("anemometro");
  });

  it("un error del servicio se devuelve como fallo, no como excepción", async () => {
    // Given un servicio que responde 503
    fetchStub.mockImplementation(() => respondWith({ detail: "apagado" }, 503));

    // When se carga
    const load = await loadVariableCatalog();

    // Then la página sigue en pie y el motivo viaja para mostrarlo
    expect(load).toEqual({ status: "failed", message: "el servicio respondió 503" });
  });

  it("un contrato roto NO se cuela: se reporta en vez de llegar a la pantalla", async () => {
    // Given una respuesta a la que le falta el campo que decide qué se ofrece
    const withoutGate = {
      ...WIRE_CATALOG,
      variables: [{ ...WIRE_CATALOG.variables[0], graficable: undefined }],
    };
    fetchStub.mockImplementation(() => respondWith(withoutGate));

    // When se carga
    const load = await loadVariableCatalog();

    // Then se declara el fallo: sin `graficable` el selector ofrecería claves que
    // el endpoint de series rechaza con 400
    expect(load.status).toBe("failed");
    if (load.status !== "failed") return;
    expect(load.message).toMatch(/forma esperada/i);
  });

  it("si el servicio no está, tampoco lanza", async () => {
    // Given una red que ni siquiera conecta
    fetchStub.mockRejectedValue(new Error("ECONNREFUSED"));

    // When se carga
    const load = await loadVariableCatalog();

    // Then se degrada con un mensaje y el render del servidor no se rompe
    expect(load.status).toBe("failed");
    if (load.status !== "failed") return;
    expect(load.message).toMatch(/no se pudo contactar/i);
  });
});
