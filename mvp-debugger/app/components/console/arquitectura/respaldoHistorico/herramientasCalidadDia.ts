// Herramientas de calidad: diagnóstico de un día y la arquitectura. Parte de la copia generada: ver `respaldoHistorico.ts`.
import type { HerramientaHist } from "../mapaHistorico";

export const HERRAMIENTAS_CALIDAD_DIA: HerramientaHist[] = [
    {
      "nombre": "cielo_periodo",
      "familia": "calidad",
      "descripcion": "Como estuvo el cielo en un periodo: indice de cielo despejado (kt) medio, indice de variabilidad, reparto de dias entre despejado/parcial/cubierto/variable, y que fraccion de la irradiancia de cielo despejado se alcanzo. Usala para preguntas sobre nubes, dias soleados, o por que la generacion fue baja. Omiti desde/hasta para todo el historico.",
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
          "detalle_diario": {
            "type": "boolean",
            "default": false,
            "description": "Devolver ademas un renglon por dia (max 400)."
          }
        },
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    },
    {
      "nombre": "diagnostico_dia",
      "familia": "calidad",
      "descripcion": "Todo lo que se sabe de UN dia concreto del historico: cuantas lecturas grabo cada fuente contra cuantas deberia haber grabado, el veredicto de calidad, la lista COMPLETA de hallazgos de ese dia con su significado, como estuvo el cielo, los dias vecinos y -si falta dato- de cuando a cuando va el hueco al que pertenece el dia y cual fue el ultimo dia con datos antes de el. Usala SIEMPRE que pregunten por un dia puntual: 'que paso el 2025-05-20', 'por que no hay datos ese dia', 'que problema tiene esa fecha'. Es la unica fuente para explicar un dia: lo que esta tool no dice, no se sabe.",
      "input_schema": {
        "type": "object",
        "properties": {
          "fecha": {
            "type": "string",
            "description": "El dia en ISO (YYYY-MM-DD), hora local de Costa Rica."
          }
        },
        "required": [
          "fecha"
        ],
        "additionalProperties": false
      },
      "incrusta_confianza": true,
      "ejecutor": "historico"
    },
    {
      "nombre": "arquitectura_agente",
      "familia": "calidad",
      "descripcion": "Como esta construido ESTE agente: que herramientas tiene y para que sirve cada una, las dos familias en que se dividen, los umbrales que deciden si un dato sirve (con que decide cada numero), los tipos de hallazgo que detecta, como corre la deteccion y que garantias da. Usala cuando pregunten por el agente en si: sus capacidades, sus limites, sus criterios, como funciona o por que decide lo que decide. NO la uses para datos del sistema fotovoltaico.",
      "input_schema": {
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "incrusta_confianza": false,
      "ejecutor": "historico"
    }
];
