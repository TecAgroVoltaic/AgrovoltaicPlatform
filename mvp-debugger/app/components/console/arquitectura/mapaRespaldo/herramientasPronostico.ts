// Herramientas del Predictivo: forecast, backtest y riesgo de nubes. Parte de la copia capturada: ver `mapaRespaldo.ts`.
export const HERRAMIENTAS_PRONOSTICO = [
    {
      "nombre": "forecast",
      "descripcion": "Pronostica una VARIABLE ambiental a un horizonte dado. Variables: 'irradiancia' (radiacion solar GHI, W/m2) y 'humedad_suelo' (humedad de suelo, lectura CRUDA sin calibrar). Llama SIEMPRE a esta herramienta para pronosticar; nunca inventes numeros. Devuelve el valor esperado, una banda de incertidumbre (bajo-alto) y contexto. Pasa tambien la frase original del horizonte en 'horizonte_texto' para validar la conversion.",
      "input_schema": {
        "type": "object",
        "properties": {
          "variable": {
            "type": "string",
            "enum": [
              "irradiancia",
              "humedad_suelo"
            ],
            "description": "Que pronosticar: 'irradiancia' (W/m2) o 'humedad_suelo' (lectura cruda del sensor de suelo)."
          },
          "horizon_seconds": {
            "type": "integer",
            "minimum": 60,
            "maximum": 21600,
            "description": "Horizonte del pronostico en SEGUNDOS. Traduci el horizonte de la pregunta: media hora=1800, una hora=3600, hora y media=5400, 2 horas=7200, 3 horas=10800. Maximo 6 horas (21600)."
          },
          "horizonte_texto": {
            "type": "string",
            "description": "La frase ORIGINAL del horizonte tal como la dijo el usuario (p. ej. 'dos horas', 'media hora', 'hora y media'). Se usa para validar la conversion a segundos de forma determinista."
          }
        },
        "required": [
          "variable",
          "horizon_seconds"
        ],
        "additionalProperties": false
      },
      "modos": [
        "medicion_visible"
      ],
      "ejecutor": "predictivo"
    },
    {
      "nombre": "backtest",
      "descripcion": "Evalua el metodo del pronostico sobre datos que YA PASARON: reconstruye como se habria predicho una fecha o periodo historico y lo compara con lo que REALMENTE midio el sensor. Usalo cuando el usuario pregunte por una fecha PASADA (p.ej. 'cuanta irradiancia hizo el 21 de julio') o quiera PROBAR/EVALUAR el modelo contra el historico. Variables: 'irradiancia' y 'humedad_suelo'. Devuelve el valor real medido + la reconstruccion + metricas de error. NO es una prediccion en vivo, es una evaluacion. Rango disponible: irradiancia desde el 2025-11-28 y humedad_suelo desde el 2026-05-01, ambas hasta el 2026-07-23 (la ingesta esta congelada desde esa fecha). Si te pasas del rango, la herramienta te devuelve el rango exacto: citalo, no lo adivines.",
      "input_schema": {
        "type": "object",
        "properties": {
          "variable": {
            "type": "string",
            "enum": [
              "irradiancia",
              "humedad_suelo"
            ],
            "description": "Que evaluar: 'irradiancia' (GHI W/m2) o 'humedad_suelo'."
          },
          "desde": {
            "type": "string",
            "description": "Fecha ISO de inicio del periodo a evaluar, p.ej. '2026-07-21'. Año 2026."
          },
          "hasta": {
            "type": "string",
            "description": "Fecha ISO de fin EXCLUSIVO. Para un solo dia, omitir (se toma el dia siguiente)."
          },
          "bucket": {
            "type": "string",
            "enum": [
              "15min",
              "30min",
              "h",
              "D"
            ],
            "description": "Cadencia de la evaluacion. Default 'h' (por hora), ideal para un dia."
          },
          "hora": {
            "type": "string",
            "description": "Hora concreta del dia a mirar, formato 'HH:MM' (p.ej. '12:00'). Si el usuario pregunta por un momento puntual, PASALA: el resultado trae el valor real y el reconstruido de esa hora exacta. Sin esto solo tenes metricas del periodo y NO podes hablar de valores puntuales."
          }
        },
        "required": [
          "variable",
          "desde"
        ],
        "additionalProperties": false
      },
      "modos": [
        "medicion_visible"
      ],
      "ejecutor": "predictivo"
    },
    {
      "nombre": "riesgo_de_nubes",
      "descripcion": "Dice que tan confiable es un pronostico para un momento dado: en que regimen viene el cielo (calmo / medio / turbulento) y con que frecuencia historica el cielo cambia fuerte A ESA HORA, separado por direccion (se tapa o se abre). NO predice si va a haber nubes: eso no se puede anticipar y no lo intenta. Usala para declarar tu confianza con evidencia y para explicar de que lado podria fallar el numero, no para cambiar el numero. Es especialmente util en horizontes cortos (hasta 1-2 h), donde el estado actual del cielo todavia informa.",
      "input_schema": {
        "type": "object",
        "properties": {
          "variable": {
            "type": "string",
            "enum": [
              "irradiancia"
            ],
            "description": "Solo 'irradiancia': la humedad de suelo no tiene nubes ni cielo despejado con que medir un regimen."
          },
          "instante": {
            "type": "string",
            "description": "Momento sobre el que se quiere el riesgo, ISO ('2026-07-22T14:00')."
          },
          "horizonte_seg": {
            "type": "integer",
            "minimum": 60,
            "maximum": 21600,
            "description": "Con cuanta anticipacion se pronostica. Define sobre que lapso se mide la probabilidad de cambio."
          }
        },
        "required": [
          "variable",
          "instante",
          "horizonte_seg"
        ],
        "additionalProperties": false
      },
      "modos": [
        "medicion_visible",
        "medicion_oculta"
      ],
      "ejecutor": "predictivo"
    },
] as const;
