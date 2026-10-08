// Herramientas de calidad: veredicto del período, hallazgos y cielo. Parte de la copia generada: ver `respaldoHistorico.ts`.
import type { HerramientaHist } from "../mapaHistorico";

export const HERRAMIENTAS_CALIDAD_PERIODO: HerramientaHist[] = [
    {
      "nombre": "graficar",
      "familia": "analisis",
      "descripcion": "Genera un GRAFICO de tendencia de una metrica del sistema PV para MOSTRARSELO al usuario. Usalo cuando el usuario quiera VER la evolucion en el tiempo (no solo un numero). Metricas: 'potencia' (W por arreglo), 'irradiancia' (GHI W/m2), 'kt' (indice de claridad), 'pr' (performance ratio por arreglo), 'temperatura' (C por arreglo). Devuelve los puntos reales de la base; nunca inventes una serie.",
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
            "description": "Que graficar."
          },
          "desde": {
            "type": "string",
            "description": "Inicio ISO (opcional; omitir = todo)."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO exclusivo (opcional)."
          },
          "bucket": {
            "type": "string",
            "enum": [
              "day",
              "week",
              "month"
            ],
            "description": "Granularidad temporal. Default 'day'."
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
      "nombre": "calidad_periodo",
      "familia": "calidad",
      "descripcion": "Veredicto de calidad de los datos en un periodo: cuantos dias son utilizables, cuantos estan degradados y cuantos no tienen datos, mas los problemas mas frecuentes. Usala ANTES de reportar cualquier agregado del historico, y siempre que pregunten si los datos sirven o que tan confiable es un periodo. Omiti desde/hasta para todo el historico.",
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
          },
          "fuente": {
            "type": "string",
            "enum": [
              "radiacion_sc_15s",
              "monitoreo_sc_electrico"
            ],
            "description": "Acota el veredicto a una fuente. Omitir = las dos, y el dia se juzga por la peor. Las dos NO estan igual de sanas: conviene acotar."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "hallazgos_calidad",
      "familia": "calidad",
      "descripcion": "Detalle de los problemas de calidad detectados: que tipo, en que variable, que dia y cuantas lecturas afecta. Usala cuando pregunten QUE esta mal (no solo si los datos sirven), por un sensor concreto o por un problema concreto. Tipos posibles: dia_incompleto, hueco, duplicado_timestamp, cambio_de_cadencia, columna_ausente, nulos, fuera_de_rango, saturado_85, constante_en_cero, sensor_plano, offset_nocturno, kt_imposible.",
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
          },
          "tipo": {
            "type": "string",
            "enum": [
              "dia_incompleto",
              "hueco",
              "duplicado_timestamp",
              "cambio_de_cadencia",
              "columna_ausente",
              "nulos",
              "fuera_de_rango",
              "saturado_85",
              "constante_en_cero",
              "sensor_plano",
              "offset_nocturno",
              "kt_imposible"
            ],
            "description": "Filtra por un tipo de problema."
          },
          "severidad": {
            "type": "string",
            "enum": [
              "grave",
              "aviso",
              "info"
            ],
            "description": "grave = el dato no sirve; aviso = usable con cuidado."
          },
          "variable": {
            "type": "string",
            "description": "Filtra por columna, p.ej. temp_vertical."
          },
          "limite": {
            "type": "integer",
            "minimum": 1,
            "maximum": 200,
            "default": 50
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
];
