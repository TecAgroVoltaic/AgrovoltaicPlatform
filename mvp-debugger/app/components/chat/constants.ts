// Textos fijos del chat flotante: frases de espera y arranques por agente.

/** Clave de `localStorage` donde se guardan los hilos de todos los agentes. */
export const CHAT_STORAGE_KEY = "agrov-chat";
/** Cada cuánto cambia la frase de espera. */
export const PHRASE_ROTATION_MS = 1600;

export const FRASES = [
  "Analizando tu pregunta…",
  "Consultando la base de datos…",
  "Revisando los datos reales…",
  "Buscando en la web…",
  "Armando la respuesta…",
];
// Arranques de conversación por agente. Las claves son los IDs REALES de los
// agentes: estuvieron mal (`analizador`/`pronostico`, de un renombre a medias) y
// como el acceso es por índice, no fallaba nada: simplemente no salía ni un
// ejemplo, y el hilo se guardaba bajo una clave que nadie leía.
//
// Hay uno de cada clase a propósito: sobre los datos, y sobre el AGENTE. El
// segundo no es relleno, es lo que hace evidente que se le puede auditar
// preguntándole, que es de lo que va esta consola.
export const EJEMPLOS: Record<string, string[]> = {
  historico: [
    "¿Cuál arreglo rinde mejor?",
    "¿Por qué no hay datos en febrero de 2025?",
    "¿Qué herramientas tenés y qué umbrales usás?",
  ],
  predictivo: [
    "¿Cuánta irradiancia en dos horas?",
    "Pronosticá la humedad de suelo en 1 hora",
    "¿Cómo estás construido?",
  ],
};
