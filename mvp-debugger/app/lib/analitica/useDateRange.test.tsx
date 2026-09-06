// Lo que esta prueba protege: que mover una fecha NO borre el resto del estado.
//
// El defecto que arregla es real y lo reportaron dos equipos: `setRange`
// reescribía la query entera, así que la variable elegida no sobrevivía al
// cambio de período y la pantalla no se podía compartir tal como se estaba
// mirando. La lógica de mezcla se prueba aparte (`urlRange.test.ts`); acá se
// prueba el CABLEADO, que es donde estaba el fallo.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDateRange } from "@/app/lib/analitica/useDateRange";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  query: new URLSearchParams(),
  path: "/series",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => navigation.path,
  useSearchParams: () => navigation.query,
}));

const NEW_RANGE = { from: "2026-05-01", toExclusive: "2026-06-02", granularity: "day" } as const;

function pushedQuery(): URLSearchParams {
  const [url] = navigation.push.mock.calls.at(-1) ?? [];
  return new URLSearchParams(String(url).split("?")[1] ?? "");
}

describe("useDateRange", () => {
  it("al mover el rango conserva la variable elegida y la ruta", () => {
    // Given una vista mirando el albedo en un período viejo
    navigation.push.mockClear();
    navigation.query = new URLSearchParams(
      "desde=2024-11-10&hasta=2025-01-01&granularidad=mes&variable=albedo",
    );
    const { result } = renderHook(() => useDateRange());

    // When se aplica otro rango
    act(() => result.current.setRange(NEW_RANGE));

    // Then se navega a la MISMA ruta, con el rango nuevo y la variable intacta:
    // el enlace que se copie sigue mostrando lo que se está mirando
    const pushedUrl = String(navigation.push.mock.calls[0][0]);
    expect(pushedUrl.startsWith(`${navigation.path}?`)).toBe(true);
    const query = pushedQuery();
    expect(query.get("variable")).toBe("albedo");
    expect(query.get("desde")).toBe(NEW_RANGE.from);
    expect(query.get("hasta")).toBe(NEW_RANGE.toExclusive);
    expect(query.get("granularidad")).toBe("dia");
  });

  it("no arrastra parámetros vacíos ni duplica los del rango", () => {
    // Given una query con un parámetro sin valor y el rango ya puesto
    navigation.push.mockClear();
    navigation.query = new URLSearchParams("desde=2024-11-10&hasta=2025-01-01&foco=");
    const { result } = renderHook(() => useDateRange());

    // When se mueve el rango
    act(() => result.current.setRange(NEW_RANGE));

    // Then el vacío se descarta y cada parámetro del rango aparece UNA vez
    const query = pushedQuery();
    expect(query.has("foco")).toBe(false);
    expect(query.getAll("desde")).toEqual([NEW_RANGE.from]);
  });

  it("lee de la URL el rango vigente, y avisa cuando venía roto", () => {
    // Given una URL compartida con una fecha imposible
    navigation.query = new URLSearchParams("desde=2026-02-30&hasta=2026-06-02");
    const { result } = renderHook(() => useDateRange());

    // When se consulta el rango
    // Then se usa el de por defecto y el problema queda dicho, no tragado
    expect(result.current.parse.outcome).toBe("fallback");
    expect(result.current.range).toEqual(result.current.parse.range);
  });
});
