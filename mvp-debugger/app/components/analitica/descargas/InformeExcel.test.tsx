// Lo que estos tests protegen: que pedir el informe nunca sea silencioso (se ve
// que está generando, se puede cancelar, el error del servicio llega en palabras)
// y que un informe que salió sin lectura lo diga en pantalla.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CABECERA_LECTURA, SIN_LECTURA } from "./BotonInforme";
import { InformeExcel, urlInforme } from "./InformeExcel";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function respuesta(cabeceras: Record<string, string> = {}) {
  return new Response("libro", {
    status: 200,
    headers: { "content-type": XLSX, "content-disposition": 'attachment; filename="informe.xlsx"', ...cabeceras },
  });
}

const fetchFalso = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchFalso);
  URL.createObjectURL = vi.fn(() => "blob:prueba");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => {
  fetchFalso.mockReset();
  vi.unstubAllGlobals();
});

const boton = () => screen.getByRole("button", { name: /Generar informe/ });

describe("urlInforme", () => {
  it("manda el rango y el foco, y pide sin lectura solo cuando se destilda", () => {
    expect(urlInforme("2026-08-01", "2026-08-31", " el inversor ", true))
      .toBe("/api/historico/informe?desde=2026-08-01&hasta=2026-08-31&foco=el+inversor");
    expect(urlInforme("2026-08-01", "2026-08-31", "el inversor", false))
      .toBe("/api/historico/informe?desde=2026-08-01&hasta=2026-08-31&lectura=false");
  });
});

describe("InformeExcel", () => {
  it("sin rango el botón queda deshabilitado y dice por qué", () => {
    render(<InformeExcel desde="" hasta="" />);
    expect(boton()).toBeDisabled();
    expect(screen.getByText(/Elegí un rango/)).toBeInTheDocument();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("al generar muestra el progreso y al terminar el nombre del archivo", async () => {
    let soltar: (r: Response) => void = () => {};
    fetchFalso.mockReturnValue(new Promise<Response>((ok) => { soltar = ok; }));
    render(<InformeExcel desde="2026-08-01" hasta="2026-08-31" />);

    fireEvent.click(boton());
    expect(await screen.findByText(/Generando…/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    soltar(respuesta());
    expect(await screen.findByText(/listo · informe\.xlsx/)).toBeInTheDocument();
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/historico/informe?desde=2026-08-01&hasta=2026-08-31");
  });

  it("muestra el motivo que da el servicio cuando falla", async () => {
    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ detail: "presupuesto diario agotado" }), { status: 429 }));
    render(<InformeExcel desde="2026-08-01" hasta="2026-08-31" />);

    fireEvent.click(boton());
    expect(await screen.findByText(/No se pudo generar: presupuesto diario agotado/)).toBeInTheDocument();
  });

  it("avisa cuando el informe salió sin la lectura que se pidió", async () => {
    fetchFalso.mockResolvedValue(respuesta({ [CABECERA_LECTURA]: SIN_LECTURA }));
    render(<InformeExcel desde="2026-08-01" hasta="2026-08-31" />);

    fireEvent.click(boton());
    expect(await screen.findByText(/Salió sin lectura/)).toBeInTheDocument();
  });

  it("cancelar vuelve al botón sin mostrar un error", async () => {
    fetchFalso.mockImplementation((_url: string, init: RequestInit) => new Promise((_ok, falla) => {
      init.signal?.addEventListener("abort", () => falla(Object.assign(new Error("abortado"), { name: "AbortError" })));
    }));
    render(<InformeExcel desde="2026-08-01" hasta="2026-08-31" />);

    fireEvent.click(boton());
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(boton()).toBeEnabled());
    expect(screen.queryByText(/No se pudo generar/)).not.toBeInTheDocument();
  });
});
