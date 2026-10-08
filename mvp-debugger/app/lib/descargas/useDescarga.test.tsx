// Lo que protege: los desenlaces de una descarga (listo, error con el motivo del
// servicio, cancelada) y que el progreso cuente bytes mientras llegan.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { hangingFetch } from "@/app/lib/asistente/fixtures";
import { useDescarga } from "@/app/lib/descargas/useDescarga";

const URL_EXPORT = "/api/historico/datos/exportar?tabla=t&formato=csv";

function fileResponse(chunks: readonly string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/csv", ...headers } });
}

describe("useDescarga", () => {
  it("baja el archivo, cuenta los bytes y usa el nombre que manda el servidor", async () => {
    // Given un servidor que manda el CSV en dos partes y su nombre
    const saveFile = vi.fn();
    const httpFetch = vi.fn(async () =>
      fileResponse(["a,b\n", "1,2\n"], { "content-disposition": 'attachment; filename="datos.csv"' }),
    );
    const { result } = renderHook(() => useDescarga({ httpFetch, saveFile }));
    // When se descarga
    await act(() => result.current.start(URL_EXPORT, "respaldo.csv"));
    // Then se entregó el archivo con el nombre del servidor y el total de bytes
    expect(httpFetch).toHaveBeenCalledWith(URL_EXPORT, expect.objectContaining({ cache: "no-store" }));
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "datos.csv");
    expect(result.current.state).toEqual({ status: "done", bytes: 8, fileName: "datos.csv" });
  });

  it("sin content-disposition usa el nombre sugerido", async () => {
    const saveFile = vi.fn();
    const { result } = renderHook(() => useDescarga({ httpFetch: async () => fileResponse(["x"]), saveFile }));
    await act(() => result.current.start(URL_EXPORT, "respaldo.csv"));
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "respaldo.csv");
  });

  it("un error del servicio queda en pantalla con su motivo y no entrega archivo", async () => {
    const saveFile = vi.fn();
    const httpFetch = async () =>
      new Response(JSON.stringify({ detail: "demasiado grande para .mat" }), { status: 422 });
    const { result } = renderHook(() => useDescarga({ httpFetch, saveFile }));
    await act(() => result.current.start(URL_EXPORT, "x.mat"));
    expect(result.current.state).toEqual({ status: "error", message: "demasiado grande para .mat" });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("cancelar termina en «cancelada», no en error", async () => {
    // Given una descarga que el servidor todavía no empezó a mandar
    const { result } = renderHook(() => useDescarga({ httpFetch: hangingFetch(), saveFile: vi.fn() }));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start(URL_EXPORT, "x.csv");
    });
    await waitFor(() => expect(result.current.state.status).toBe("downloading"));
    // When se cancela
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    // Then
    expect(result.current.state).toEqual({ status: "cancelled" });
  });
});
