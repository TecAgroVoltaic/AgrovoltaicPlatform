// Herramientas de análisis: energía, PR, irradiancia y temperatura. Parte de la copia generada: ver `respaldoHistorico.ts`.
import type { HerramientaHist } from "../mapaHistorico";

export const HERRAMIENTAS_ANALISIS_ENERGIA: HerramientaHist[] = [
    {
      "nombre": "energia_por_arreglo",
      "familia": "analisis",
      "descripcion": "Energia electrica generada (Wh) en un periodo: por arreglo (PV1 inclinado, PV2 vertical) y total AC del inversor. Omiti desde/hasta para todo el historico.",
      "input_schema": {
        "type": "object",
        "properties": {
          "desde": {
            "type": "string",
            "description": "Inicio ISO ('2026-01-01'), hora local CR. Omitir = desde el inicio."
          },
          "hasta": {
            "type": "string",
            "description": "Fin ISO EXCLUSIVO. Omitir = hasta el final del historico."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "performance_ratio",
      "familia": "analisis",
      "descripcion": "Performance Ratio (adimensional, ~0-1) por arreglo en un periodo: PV1 inclinado y PV2 vertical, ponderado por energia. Incluye la cobertura (n). Omiti desde/hasta para todo el historico.",
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
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "irradiancia_resumen",
      "familia": "analisis",
      "descripcion": "Resumen de irradiancia solar en un periodo: GHI media/maxima (W/m2), indice de cielo despejado kt* (0-1, cuanto sol real vs cielo despejado) e insolacion total (Wh/m2). Solo datos validos con control de calidad. Omiti desde/hasta para todo el historico valido.",
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
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "temperatura_por_arreglo",
      "familia": "analisis",
      "descripcion": "Temperatura (C) de cada arreglo en un periodo: PV1 inclinado y PV2 vertical (media y maxima). Util para el efecto de temperatura en el rendimiento. Omiti desde/hasta para todo el historico.",
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
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
];
