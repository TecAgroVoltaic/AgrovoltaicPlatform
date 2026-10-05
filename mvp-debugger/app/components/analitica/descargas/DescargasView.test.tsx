// Lo que protegen estas pruebas: que nadie baje un archivo distinto del que
// creyó pedir.
//
// Tres cosas no se ven mirando el formulario: que la casilla de MATLAB cambie el
// formato QUE VIAJA (y apague los metadatos), que un rango fuera de cobertura se
// avise antes y no después, y que las columnas destildadas desaparezcan de la
// URL. Las tres se rompen en silencio: el archivo baja igual, con otro contenido.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DescargasView } from "@/app/components/analitica/descargas/DescargasView";
import { EXPORT_RELATIONS } from "@/app/components/analitica/descargas/fixtures";
import { formatApproximate } from "@/app/components/analitica/descargas/format";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

const FULL_RANGE: DateRange = {
  from: "2024-11-10",
  toExclusive: "2026-09-01",
  granularity: "day",
};

const { loadExportRelations, mocked } = vi.hoisted(() => ({
  loadExportRelations: vi.fn<() => Promise<unknown>>(),
  // El rango se muta por prueba: es lo que cambia el veredicto de cobertura.
  mocked: { range: null as DateRange | null },
}));

vi.mock("@/app/components/analitica/descargas/loadRelations", () => ({ loadExportRelations }));
vi.mock("@/app/lib/analitica/useDateRange", () => ({
  useDateRange: () => ({
    range: mocked.range,
    parse: { outcome: "parsed", range: mocked.range },
    setRange: vi.fn(),
  }),
}));

function resolveWith(result: AnalyticsResult<readonly ExportRelation[]>) {
  loadExportRelations.mockResolvedValue(result);
}

function downloadParams(): URLSearchParams {
  const link = screen.getByRole("link", { name: /Descargar/ });
  return new URL(link.getAttribute("href") ?? "", "http://localhost").searchParams;
}

async function renderReady() {
  resolveWith({ ok: true, data: EXPORT_RELATIONS });
  render(<DescargasView />);
  return screen.findByRole("link", { name: /Descargar/ });
}

describe("DescargasView", () => {
  beforeEach(() => {
    loadExportRelations.mockReset();
    mocked.range = FULL_RANGE;
  });

  it("dado un catálogo en vuelo, cuando se pinta, entonces dice qué está esperando", () => {
    // Given: la petición no resuelve nunca.
    loadExportRelations.mockReturnValue(new Promise(() => {}));

    // When
    render(<DescargasView />);

    // Then
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las tablas exportables");
  });

  it("dado un fallo de red, cuando se pinta, entonces lo explica y deja reintentar", async () => {
    // Given: un fallo que puede pasar solo.
    resolveWith({ ok: false, failure: { code: "NETWORK", message: "no se pudo contactar al servidor" } });

    // When
    render(<DescargasView />);
    const alert = await screen.findByRole("alert");

    // Then
    expect(alert).toHaveTextContent("No se pudieron cargar las tablas exportables");
    expect(alert).toHaveTextContent("no se pudo contactar al servidor");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(loadExportRelations).toHaveBeenCalledTimes(2));
  });

  it("dada una sesión vencida, cuando se pinta, entonces no ofrece reintentar", async () => {
    // Given: reintentar no arregla una cookie caducada.
    resolveWith({
      ok: false,
      failure: { code: "UNAUTHORIZED", message: "la sesión venció: recargá la página para volver a entrar" },
    });

    // When
    render(<DescargasView />);
    await screen.findByRole("alert");

    // Then
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("dado un catálogo sin tablas, cuando se pinta, entonces el vacío trae motivo", async () => {
    // Given: el servicio responde bien, pero no publica ninguna tabla.
    resolveWith({ ok: true, data: [] });

    // When
    render(<DescargasView />);

    // Then: una pantalla en blanco sin explicación se lee como avería.
    expect(await screen.findByText("No hay nada que descargar")).toBeInTheDocument();
    expect(
      screen.getByText("El servicio de análisis no publicó ninguna tabla exportable."),
    ).toBeInTheDocument();
  });

  it("dado el catálogo cargado, cuando no se toca nada, entonces la URL lleva solo las columnas por defecto", async () => {
    // Given / When
    await renderReady();

    // Then: las tres columnas de contabilidad del ETL quedan fuera.
    const params = downloadParams();
    expect(params.get("relacion")).toBe("electrico_crudo");
    expect(params.get("columnas")).toBe(
      "timestamp,potencia_pv1_w,potencia_pv2_w,voltaje_pv1_v,corriente_pv1_a,voltaje_vac",
    );
    expect(params.get("formato")).toBe("csv");
  });

  it("dado el rango completo, cuando se pinta, entonces estima cuántas filas va a traer", async () => {
    // Given: el rango cubre la tabla entera, así que la estimación es su total.
    await renderReady();

    // Then: el aviso de magnitud llega ANTES de pedir 45.270 filas. El separador
    // de miles de es-CR es un espacio fino, y Testing Library normaliza todo
    // espacio a uno normal antes de comparar: hay que normalizar lo esperado
    // igual, o la prueba fallaría por el separador y no por el número.
    const expected = formatApproximate(45_270).replace(/\s+/g, " ");
    expect(screen.getByText(expected, { exact: false })).toBeInTheDocument();
  });

  it("dado el rango del cascarón, cuando se pinta, entonces dice qué día NO entra", async () => {
    // Given: `hasta` es exclusivo en toda la aplicación, y quien baja un archivo
    // lo descubriría contando filas si no se lo dijeran acá.
    mocked.range = { from: "2026-05-01", toExclusive: "2026-06-02", granularity: "day" };
    await renderReady();

    // Then
    expect(screen.getByText(/«hasta» es exclusivo/)).toBeInTheDocument();
    expect(screen.getByText(/el 2026-06-02 no entra en el archivo/)).toBeInTheDocument();
  });

  it("dada una tabla sin eje temporal, cuando se elige, entonces no promete un recorte por fecha", async () => {
    // Given: el diccionario de variables se descarga entero.
    await renderReady();

    // When
    fireEvent.click(screen.getByRole("radio", { name: /Diccionario de variables/ }));

    // Then: prometer un recorte que no va a ocurrir es mentir sobre el archivo.
    expect(await screen.findByText(/no tiene columna de tiempo/)).toBeInTheDocument();
    expect(screen.queryByText(/«hasta» es exclusivo/)).not.toBeInTheDocument();
  });

  it("dada una columna destildada, cuando cambia la selección, entonces desaparece de la URL", async () => {
    // Given
    await renderReady();

    // When: se quita la potencia del arreglo vertical.
    fireEvent.click(screen.getByRole("checkbox", { name: /potencia_pv2_w/ }));

    // Then
    await waitFor(() => expect(downloadParams().get("columnas")).not.toContain("potencia_pv2_w"));
    expect(downloadParams().get("columnas")).toContain("potencia_pv1_w");
  });

  it("dada la casilla «Todas», cuando se pulsa, entonces también entra la contabilidad del ETL", async () => {
    // Given
    await renderReady();

    // When
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));

    // Then
    await waitFor(() => expect(downloadParams().get("columnas")).toContain("ingestado_en"));
  });

  it("dada la casilla «Ninguna», cuando se pulsa, entonces bloquea la descarga y dice por qué", async () => {
    // Given
    await renderReady();

    // When
    fireEvent.click(screen.getByRole("button", { name: "Ninguna" }));

    // Then: un archivo sin columnas no tiene nada dentro.
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Descargar/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Descargar/ })).toBeDisabled();
    expect(screen.getByText(/Elegí al menos una columna/)).toBeInTheDocument();
  });

  it("dada la variante de MATLAB, cuando se marca, entonces cambia el formato y apaga los metadatos", async () => {
    // Given: `.dat` elegido.
    await renderReady();
    fireEvent.click(screen.getByRole("radio", { name: /\.dat/ }));

    // When
    fireEvent.click(screen.getByRole("checkbox", { name: /Compatible con load\(\) de MATLAB/ }));

    // Then: es la combinación que el backend rechaza con un 400 tipado, así que
    // la interfaz no la puede producir.
    await waitFor(() => expect(downloadParams().get("formato")).toBe("dat_numerico"));
    expect(downloadParams().get("metadatos")).toBe("0");
    const metadata = screen.getByRole("checkbox", { name: /Incluir metadatos/ });
    expect(metadata).toBeDisabled();
    expect(metadata).not.toBeChecked();
    expect(screen.getByText(/cualquier línea que no sea un número rompe load\(\)/)).toBeInTheDocument();
  });

  it("dada la variante de MATLAB, cuando se marca, entonces muestra el orden exacto de las columnas", async () => {
    // Given: ese archivo pierde los nombres de columna para siempre.
    await renderReady();
    fireEvent.click(screen.getByRole("radio", { name: /\.dat/ }));

    // When
    fireEvent.click(screen.getByRole("checkbox", { name: /Compatible con load\(\) de MATLAB/ }));

    // Then: el único mapa que va a tener quien lo abra.
    const order = await screen.findByText("Orden exacto de las columnas del archivo");
    const positions = order.parentElement?.querySelectorAll("li") ?? [];
    expect([...positions].map((item) => item.textContent)).toEqual([
      "timestamp · datenum",
      "potencia_pv1_w",
      "potencia_pv2_w",
      "voltaje_pv1_v",
      "corriente_pv1_a",
      "voltaje_vac",
    ]);
  });

  it("dado un rango fuera de la cobertura de la tabla, cuando se elige, entonces avisa antes de descargar", async () => {
    // Given: la irradiancia calibrada solo existe desde mediados de 2025.
    mocked.range = { from: "2024-11-10", toExclusive: "2025-01-01", granularity: "day" };
    await renderReady();

    // When
    fireEvent.click(screen.getByRole("radio", { name: /Radiación \(calibrada\)/ }));

    // Then
    expect(await screen.findByText(/el archivo saldría vacío/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Descargar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Este rango no toca la cobertura/)).toBeInTheDocument();
  });
});
