// Las intenciones que el Asistente ofrece de entrada: los chips del compositor
// (rellenan una plantilla para editar) y las tarjetas del estado vacío (mandan
// un ejemplo tal cual). Son las cuatro cosas que el agente sabe hacer con las
// tools que tiene: consultar cifras, graficar, exportar y diagnosticar un día.

/** Marca que la persona tiene que reemplazar: el compositor la deja seleccionada. */
export const TEMPLATE_PLACEHOLDER = "AAAA-MM-DD";

export type ComposerIntent = { readonly id: string; readonly label: string; readonly template: string };

export const COMPOSER_INTENTS: readonly ComposerIntent[] = [
  { id: "chart", label: "Graficar", template: "Graficá la potencia de PV1 y PV2 en el rango elegido" },
  { id: "download", label: "Descargar", template: "Dame en csv la irradiancia del rango elegido" },
  {
    id: "compare",
    label: "Comparar PV1 y PV2",
    template: "Compará la energía y el rendimiento de PV1 (inclinado) y PV2 (vertical) en el rango elegido",
  },
  {
    id: "diagnose",
    label: "Diagnosticar un día",
    template: `¿Qué pasó el ${TEMPLATE_PLACEHOLDER}? Revisá la calidad del dato, el inversor y el cielo`,
  },
];

export type IntentKind = "query" | "chart" | "download" | "diagnose";

export type ExampleIntent = {
  readonly kind: IntentKind;
  readonly title: string;
  readonly example: string;
  /** Qué abarca, en una línea: lo que el agente devuelve con esa intención. */
  readonly scope: string;
};

export const EXAMPLE_INTENTS: readonly ExampleIntent[] = [
  {
    kind: "query",
    title: "Consultar",
    example: "¿Cómo estuvo la irradiancia el 12 de agosto?",
    scope: "cifras, cobertura, huecos",
  },
  {
    kind: "chart",
    title: "Graficar",
    example: "Graficá la potencia de agosto por arreglo",
    scope: "series, barras, cajas, carpeta, dispersión, crestas",
  },
  {
    kind: "download",
    title: "Descargar",
    example: "Dame la temperatura de la última semana en csv",
    scope: "csv, dat, mat · mismas tablas que Descargas",
  },
  {
    kind: "diagnose",
    title: "Diagnosticar",
    example: "¿Por qué el 26 de agosto la planta no generó?",
    scope: "calidad del dato, inversor, cielo",
  },
];
