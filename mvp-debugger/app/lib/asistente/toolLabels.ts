// Qué se le dice a la persona mientras corre cada tool. Las claves son los
// `name` reales de `agente-historico/src/historico/tools/*.py`; una tool nueva
// sin entrada acá no rompe nada, cae al genérico «Ejecutando {nombre}».
const TOOL_PROGRESS_LABEL: Readonly<Record<string, string>> = {
  graficar: "Armando el gráfico",
  exportar_datos: "Preparando la descarga",
  serie_variable: "Consultando la serie",
  irradiancia_resumen: "Consultando la irradiancia",
  irradiacion_mensual: "Consultando la irradiación mensual",
  energia_por_arreglo: "Consultando la energía por arreglo",
  performance_ratio: "Consultando el performance ratio",
  temperatura_por_arreglo: "Consultando la temperatura",
  comparativa_arreglos: "Comparando los arreglos",
  correlacion_variables: "Consultando la correlación",
  distribucion_mensual: "Consultando la distribución mensual",
  crestas_distribucion: "Consultando las distribuciones",
  carpeta_dia_hora: "Consultando el mapa día-hora",
  cielo_periodo: "Consultando el estado del cielo",
  tendencia: "Consultando la tendencia",
  resumen_dashboard: "Consultando el resumen del tablero",
  diagnostico_dia: "Diagnosticando el día",
  calidad_periodo: "Revisando la calidad de los datos",
  pruebas_calidad: "Corriendo las pruebas de calidad",
  hallazgos_calidad: "Buscando hallazgos de calidad",
  completitud_datos: "Revisando la completitud",
  cobertura_datos: "Revisando la cobertura de datos",
  catalogo_variables: "Consultando el catálogo de variables",
  arquitectura_agente: "Revisando su propia arquitectura",
  web_search: "Buscando en la web",
};

export function toolProgressLabel(toolName: string): string {
  return Object.hasOwn(TOOL_PROGRESS_LABEL, toolName)
    ? TOOL_PROGRESS_LABEL[toolName]
    : `Ejecutando ${toolName}`;
}
