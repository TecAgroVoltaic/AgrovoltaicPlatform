
/** Las dos zonas, con el rótulo que explica por qué la línea está ahí. */
export const ZONAS = [
  {
    id: "cargar" as const,
    titulo: "Al cargar · una sola vez",
    nota: "Irreversible: por eso acá hay lo mínimo.",
  },
  {
    id: "consultar" as const,
    titulo: "Al consultar · cada vez",
    nota: "Reversible: acá vive toda la corrección.",
  },
];
