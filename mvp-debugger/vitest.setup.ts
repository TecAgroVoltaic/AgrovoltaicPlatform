import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// La limpieza va A MANO porque `vitest.config.mts` corre con `globals: false`.
//
// Testing Library se desmonta sola registrando un `afterEach` en el objeto
// global, y ese registro solo ocurre si los globals existen. Con `globals: false`
// no hay dónde engancharse, la limpieza NO corre y cada `render` deja su arbol
// colgado del `document`: el siguiente test encuentra dos coincidencias donde
// esperaba una, y el `getBy*` falla por contaminacion del anterior en vez de por
// lo que estaba midiendo. Ya rompio pruebas de dos equipos a la vez.
//
// Se arregla aca y no con un `afterEach` por archivo de test: la limpieza es una
// propiedad del entorno, y dejarla en manos de que cada autor se acuerde es la
// forma de que vuelva a pasar.
afterEach(cleanup);

// jsdom no implementa estas dos, y no son opcionales para lo que se prueba acá:
// el tema de los gráficos consulta `matchMedia` para seguir el modo oscuro y la
// preferencia de movimiento reducido, y el envoltorio de ECharts observa el
// tamaño del contenedor. Sin los sustitutos, los componentes fallan por el
// entorno y no por su comportamiento, que es lo que se quiere medir.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub });
}

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
