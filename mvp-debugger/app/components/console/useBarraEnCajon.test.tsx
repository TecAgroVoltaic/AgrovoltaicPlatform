// Lo que protege esta prueba: que el umbral del cajón sea UNO SOLO.
//
// El defecto que arregla `useBarraEnCajon` nació de tener la condición escrita en
// dos lugares que no se hablaban (el CSS escondía las etiquetas, el componente
// seguía eligiendo texto por su cuenta). El umbral sigue estando dos veces por
// una limitación real: una media query no se puede leer desde JS. Lo que sí se
// puede es comparar los dos números en cada corrida, que es lo que pasa acá.
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ANCHO_MAXIMO_DE_CAJON_PX, useBarraEnCajon } from "@/app/components/console/useBarraEnCajon";

const RUTA_GLOBALS = path.join(process.cwd(), "app/globals.css");
const CLASE_DEL_CASCARON = ".app.consola";

const matchMediaOriginal = window.matchMedia;

/**
 * Sustituto de `matchMedia` que además deja disparar el cambio de umbral, que es
 * lo que pasa de verdad al girar un teléfono.
 */
function instalarMatchMedia(entra: boolean) {
  const oyentes: Array<() => void> = [];
  const consulta = {
    matches: entra,
    media: "",
    onchange: null,
    addEventListener: (_: string, oyente: () => void) => { oyentes.push(oyente); },
    removeEventListener: vi.fn(),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  const espia = vi.fn((consultaPedida: string) => {
    consulta.media = consultaPedida;
    return consulta;
  });
  Object.defineProperty(window, "matchMedia", { value: espia, configurable: true, writable: true });
  return {
    espia,
    quitarDeConsulta: consulta.removeEventListener,
    cruzarElUmbral: (ahoraEntra: boolean) => {
      consulta.matches = ahoraEntra;
      act(() => { oyentes.forEach((oyente) => oyente()); });
    },
  };
}

/** Cuerpo de `@media (max-width:Npx){...}`, con las llaves balanceadas. */
function bloqueDeMedia(css: string, anchoPx: number): string {
  const apertura = new RegExp(`@media \\(max-width:\\s*${anchoPx}px\\)\\s*\\{`).exec(css);
  if (!apertura) return "";
  let profundidad = 1;
  let i = apertura.index + apertura[0].length;
  const desde = i;
  while (i < css.length && profundidad > 0) {
    if (css[i] === "{") profundidad += 1;
    if (css[i] === "}") profundidad -= 1;
    i += 1;
  }
  return css.slice(desde, i - 1);
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { value: matchMediaOriginal, configurable: true, writable: true });
});

describe("useBarraEnCajon", () => {
  it("dice que sí cuando la ventana está en el escalón del cajón", () => {
    // Given una ventana angosta
    instalarMatchMedia(true);

    // When se monta el enganche
    const { result } = renderHook(() => useBarraEnCajon());

    // Then la barra se dibuja como cajón
    expect(result.current).toBe(true);
  });

  it("dice que no en una ventana ancha", () => {
    // Given una ventana de escritorio
    instalarMatchMedia(false);

    // When se monta el enganche
    const { result } = renderHook(() => useBarraEnCajon());

    // Then la barra sigue siendo la columna de siempre
    expect(result.current).toBe(false);
  });

  it("sigue el giro del teléfono sin recargar la página", () => {
    // Given una ventana angosta ya montada
    const { cruzarElUmbral } = instalarMatchMedia(true);
    const { result } = renderHook(() => useBarraEnCajon());
    expect(result.current).toBe(true);

    // When la ventana cruza el umbral (girar el teléfono, o partir la pantalla)
    cruzarElUmbral(false);

    // Then el enganche se entera: sin escuchar el cambio, la barra se quedaba en
    // la forma que tenía al arrancar y el cajón nunca se soltaba
    expect(result.current).toBe(false);
  });

  it("suelta la escucha al desmontarse", () => {
    // Given el enganche montado
    const { quitarDeConsulta } = instalarMatchMedia(true);
    const { unmount } = renderHook(() => useBarraEnCajon());

    // When el componente se va
    unmount();

    // Then no deja una escucha colgada de la ventana
    expect(quitarDeConsulta).toHaveBeenCalled();
  });

  it("pregunta por el mismo ancho que declara la constante", () => {
    // Given el enganche montado
    const { espia } = instalarMatchMedia(false);
    renderHook(() => useBarraEnCajon());

    // When se mira qué consulta pidió
    const consultaPedida = espia.mock.calls[0][0];

    // Then usa la constante y no un número suelto escrito al lado
    expect(consultaPedida).toBe(`(max-width: ${ANCHO_MAXIMO_DE_CAJON_PX}px)`);
  });

  it("el umbral de JS es el mismo que el de la hoja de estilos", () => {
    // Given la hoja donde el cascarón de /consola se vuelve bloque
    const css = readFileSync(RUTA_GLOBALS, "utf8");

    // When se busca la clase del cascarón dentro del escalón del cajón
    const escalon = bloqueDeMedia(css, ANCHO_MAXIMO_DE_CAJON_PX);

    // Then está ahí: si alguien mueve uno de los dos números, las dos mitades del
    // plegado vuelven a contradecirse y esta prueba es la que lo cuenta
    expect(escalon).toContain(CLASE_DEL_CASCARON);
  });
});
