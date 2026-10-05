// Lo que estas pruebas protegen: que el catálogo que no llega deje la vista
// coja y no rota, y que cada forma de no llegar se distinga de las demás.
//
// El selector de variables y la decisión de si una variable tiene sentido en el
// rango cuelgan de esta petición. Si un fallo se perdiera en silencio, la vista
// ofrecería un selector vacío sin poder decir por qué.
import { describe, expect, it, vi } from "vitest";

import { fetchVariableCatalog } from "@/app/lib/analitica/variableCatalog";

const BASE_URL = "http://127.0.0.1:8010";

// Recortado del payload real de `GET /analitica/variables`.
const PAYLOAD = {
  variables: [
    {
      clave: "irradiancia_incidente_sp722_wm2",
      etiqueta: "Irradiancia incidente SP722",
      unidad: "W/m2",
      familia: "radiacion",
      dato_desde: "2026-05-11",
      dato_hasta: "2026-05-28",
      hueco: null,
      fuente_ausente: null,
      graficable: true,
    },
  ],
  familias: ["radiacion"],
  nota: "`graficable` dice si `/analitica/series` acepta esa clave",
};

function respondWith(body: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

describe("fetchVariableCatalog", () => {
  it("traduce el catálogo del servicio a los nombres del frontend", async () => {
    // Given el servicio respondiendo su payload real
    const httpFetch = respondWith(PAYLOAD);

    // When se baja el catálogo
    const result = await fetchVariableCatalog({ baseUrl: BASE_URL, httpFetch });

    // Then llega validado, con `dato_hasta` como `until` y sin castellano suelto
    expect(httpFetch).toHaveBeenCalledWith(
      `${BASE_URL}/analitica/variables`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.variables[0]).toMatchObject({
      key: "irradiancia_incidente_sp722_wm2",
      from: "2026-05-11",
      until: "2026-05-28",
      plottable: true,
    });
  });

  it("un 500 del servicio se reporta como fallo de arriba, no como catálogo vacío", async () => {
    // Given el servicio caído
    const result = await fetchVariableCatalog({
      baseUrl: BASE_URL,
      httpFetch: respondWith({ detail: "boom" }, 500),
    });

    // When se lee el desenlace
    // Then hay un fallo con código, que es lo que decide si se ofrece reintentar
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("UPSTREAM_ERROR");
    expect(result.failure.status).toBe(500);
  });

  it("un 200 con la forma cambiada es un fallo, no un catálogo a medias", async () => {
    // Given una respuesta que ya no cumple el contrato
    const result = await fetchVariableCatalog({
      baseUrl: BASE_URL,
      httpFetch: respondWith({ variables: [{ clave: "x" }], familias: [] }),
    });

    // When se valida en la frontera
    // Then se declara malformada en vez de dejar pasar variables sin cobertura
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("MALFORMED_RESPONSE");
  });

  it("un cuerpo que ni siquiera es JSON tampoco lanza", async () => {
    // Given una respuesta HTML (el proxy devolviendo una página de error)
    const result = await fetchVariableCatalog({
      baseUrl: BASE_URL,
      httpFetch: respondWith("<html>502</html>"),
    });

    // When se intenta leer
    // Then es el mismo fallo declarado, y la vista sigue en pie
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("MALFORMED_RESPONSE");
  });

  it("si la petición ni sale, el fallo es de red y trae el detalle", async () => {
    // Given un fetch que revienta antes de llegar
    const httpFetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    // When se baja el catálogo
    const result = await fetchVariableCatalog({ baseUrl: BASE_URL, httpFetch });

    // Then se devuelve el fallo con su rastro, en vez de propagar la excepción
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("NETWORK");
    expect(result.failure.detail).toContain("ECONNREFUSED");
  });
});
