// Herramientas de análisis: tendencia, cobertura, catálogo y gráficos. Parte de la copia generada: ver `respaldoHistorico.ts`.
import type { HerramientaHist } from "../mapaHistorico";

export const HERRAMIENTAS_ANALISIS_SERIES: HerramientaHist[] = [
    {
      "nombre": "tendencia",
      "familia": "analisis",
      "descripcion": "Resumen de la EVOLUCION en el tiempo de una metrica del sistema PV, por arreglo, SIN la serie completa (ideal para responder en texto). Metricas: 'potencia' (W por arreglo), 'irradiancia' (GHI W/m2), 'kt' (indice de claridad 0-1), 'pr' (performance ratio por arreglo), 'temperatura' (C por arreglo). Devuelve n, minimo, maximo y media por serie en el periodo. Usala cuando pregunten como evoluciono / la tendencia / el comportamiento de algo a lo largo del tiempo. Son agregados de datos reales; nunca inventes.",
      "input_schema": {
        "type": "object",
        "properties": {
          "metrica": {
            "type": "string",
            "enum": [
              "potencia",
              "irradiancia",
              "kt",
              "pr",
              "temperatura"
            ],
            "description": "Que metrica resumir."
          },
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR (opcional; omitir = todo el historico)."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO (opcional)."
          },
          "bucket": {
            "type": "string",
            "enum": [
              "day",
              "week",
              "month"
            ],
            "description": "Granularidad temporal del agregado. Default 'day'."
          }
        },
        "required": [
          "metrica"
        ],
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "cobertura_datos",
      "familia": "analisis",
      "descripcion": "Cobertura de datos: rango de fechas disponible y cuantas filas hay (electrico 5 min y radiacion 15 s) en el periodo. Sirve para saber si hay suficientes datos. Omiti desde/hasta para contar todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO, hora local CR. Omitir = todo."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = todo."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "catalogo_variables",
      "familia": "analisis",
      "descripcion": "Diccionario de las variables medidas (nombre, descripcion, a que tabla pertenece: electrico o radiacion). Usalo si preguntan que significa una columna/variable o que se mide.",
      "input_schema": {
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
];
