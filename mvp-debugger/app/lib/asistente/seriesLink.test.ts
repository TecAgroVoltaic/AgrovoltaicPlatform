// Lo que protege: que «Abrir en Series» lleve a la vista con lo MISMO que se
// graficó. Un enlace con otro rango mostraría otro dato bajo el mismo título.
import { describe, expect, it } from "vitest";

import { seriesHref } from "@/app/lib/asistente/seriesLink";

function paramsOf(href: string): URLSearchParams {
  return new URL(href, "http://consola").searchParams;
}

describe("seriesHref", () => {
  it("lleva las variables, el rango (con hasta exclusivo) y el grano del pedido", () => {
    // Given el pedido de un gráfico de dos variables con grano diario
    const request = { variables: ["potencia_pv1_w", "potencia_pv2_w"], from: "2026-08-01", toExclusive: "2026-09-01", granularity: "dia" };
    // When se arma el enlace
    const href = seriesHref(request);
    // Then apunta a Series con exactamente esos parámetros
    expect(href.startsWith("/series?")).toBe(true);
    const params = paramsOf(href);
    expect(params.get("variables")).toBe("potencia_pv1_w,potencia_pv2_w");
    expect(params.get("desde")).toBe("2026-08-01");
    expect(params.get("hasta")).toBe("2026-09-01");
    expect(params.get("granularidad")).toBe("dia");
  });

  it("sin fechas en el pedido no inventa un rango", () => {
    const params = paramsOf(seriesHref({ variables: ["temp_inclinado"], from: null, toExclusive: null, granularity: null }));
    expect([...params.keys()]).toEqual(["variables"]);
  });
});
