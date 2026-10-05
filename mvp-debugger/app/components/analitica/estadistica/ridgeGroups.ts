// Qué compara la Fig. 7 y contra qué umbral.
//
// Son las tres temperaturas y no otra cosa por dos razones: el código de
// referencia del PDF se llama `temp_tail_ridge_plot.py`, y las crestas solo
// significan algo entre variables de la MISMA unidad (el backend rechaza mezclar
// W con grados). El umbral de 60 °C es el que usa el documento para preguntar
// cada cuánto un módulo se pasa de temperatura: la etiqueta de cada cresta trae
// esa probabilidad de cola.
export const RIDGE_GROUP_KEYS: readonly string[] = [
  "temp_inclinado",
  "temp_vertical",
  "temperatura_inversor_c",
];

export const RIDGE_THRESHOLD = 60;
