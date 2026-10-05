// Lo que protege esta prueba: que la URL del archivo diga lo que la pantalla
// prometió. Es el único punto donde la elección de la persona se convierte en
// petición, y un parámetro mal escrito no falla, entrega OTRO archivo.
import { describe, expect, it } from "vitest";

import {
  buildDownloadUrl,
  metadataAllowed,
  toWireFormat,
  DOWNLOAD_ENDPOINT,
} from "@/app/components/analitica/descargas/download";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const RANGE: DateRange = { from: "2026-05-01", toExclusive: "2026-06-02", granularity: "day" };
const COLUMNS = ["timestamp", "potencia_pv1_w", "voltaje_vac"];

function paramsOf(url: string): URLSearchParams {
  return new URL(url, "http://localhost").searchParams;
}

describe("buildDownloadUrl", () => {
  it("dado un rango y unas columnas, cuando arma la URL, entonces manda cada elección tal cual", () => {
    // Given: la selección completa de la pantalla.
    const request = {
      relationKey: "electrico_corregido",
      range: RANGE,
      columns: COLUMNS,
      wireFormat: "csv",
      metadata: true,
    } as const;

    // When
    const url = buildDownloadUrl(request);

    // Then
    expect(url.startsWith(`${DOWNLOAD_ENDPOINT}?`)).toBe(true);
    const params = paramsOf(url);
    expect(params.get("relacion")).toBe("electrico_corregido");
    expect(params.get("columnas")).toBe("timestamp,potencia_pv1_w,voltaje_vac");
    expect(params.get("formato")).toBe("csv");
    expect(params.get("metadatos")).toBe("1");
  });

  it("dado el fin exclusivo del cascarón, cuando arma la URL, entonces «hasta» viaja sin convertir", () => {
    // Given / When: el rango es [desde, hasta) en toda la aplicación.
    const params = paramsOf(
      buildDownloadUrl({
        relationKey: "electrico_crudo",
        range: RANGE,
        columns: COLUMNS,
        wireFormat: "csv",
        metadata: false,
      }),
    );

    // Then: traducirlo a un fin inclusivo haría que la misma fecha signifique
    // dos cosas según quién la lea.
    expect(params.get("desde")).toBe("2026-05-01");
    expect(params.get("hasta")).toBe("2026-06-02");
    // Una descarga entrega filas crudas: la granularidad del cascarón no aplica.
    expect(params.get("granularidad")).toBeNull();
  });

  it("dado `.dat` numérico con metadatos marcados, cuando arma la URL, entonces los apaga igual", () => {
    // Given: la combinación que el backend rechaza con un 400 tipado.
    const url = buildDownloadUrl({
      relationKey: "performance",
      range: RANGE,
      columns: COLUMNS,
      wireFormat: "dat_numerico",
      metadata: true,
    });

    // Then: segunda red tras la interfaz, que ya la hace imposible.
    expect(paramsOf(url).get("formato")).toBe("dat_numerico");
    expect(paramsOf(url).get("metadatos")).toBe("0");
  });

  it("dada una selección sin columnas, cuando arma la URL, entonces `columnas` va vacío y no ausente", () => {
    // Given: el caso límite que la pantalla bloquea, para que si algún día se
    // desbloquea el parámetro siga siendo explícito y no un valor por defecto.
    const params = paramsOf(
      buildDownloadUrl({
        relationKey: "diccionario",
        range: RANGE,
        columns: [],
        wireFormat: "mat",
        metadata: true,
      }),
    );

    expect(params.get("columnas")).toBe("");
  });
});

describe("toWireFormat", () => {
  it("dado `.dat` con la casilla de MATLAB, cuando traduce el formato, entonces pide la variante numérica", () => {
    expect(toWireFormat("dat", true)).toBe("dat_numerico");
  });

  it("dado otro formato con la casilla marcada, cuando traduce, entonces la casilla no aplica", () => {
    // La casilla solo se ofrece con `.dat`, pero el estado sobrevive al cambio
    // de formato para no perder la elección al ir y volver.
    expect(toWireFormat("csv", true)).toBe("csv");
    expect(toWireFormat("mat", true)).toBe("mat");
  });
});

describe("metadataAllowed", () => {
  it("dada cada variante, cuando pregunta por los metadatos, entonces solo la numérica los prohíbe", () => {
    expect(metadataAllowed("csv")).toBe(true);
    expect(metadataAllowed("dat")).toBe(true);
    expect(metadataAllowed("mat")).toBe(true);
    expect(metadataAllowed("dat_numerico")).toBe(false);
  });
});
