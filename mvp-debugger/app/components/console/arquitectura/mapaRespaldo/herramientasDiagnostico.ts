// Herramientas del Predictivo: diagnóstico de condiciones y contexto histórico. Parte de la copia capturada: ver `mapaRespaldo.ts`.
export const HERRAMIENTAS_DIAGNOSTICO = [
    {
      "nombre": "diagnosticar_condiciones",
      "descripcion": "Describe COMO VENIA el cielo en los minutos previos a un momento, y cuanto se mueve el techo de cielo despejado en el horizonte. Es tu evidencia para decidir con que configuracion pronosticar: llamala SIEMPRE antes de predecir un instante historico. Devuelve claridad reciente (mediana, dispersion, tendencia, saltos bruscos, regimen), el techo en el corte y en el objetivo, y la TEORIA de que hace cada perilla. NO devuelve el valor medido del instante objetivo: ese no lo vas a tener antes de predecir.",
      "input_schema": {
        "type": "object",
        "properties": {
          "variable": {
            "type": "string",
            "enum": [
              "irradiancia",
              "humedad_suelo"
            ]
          },
          "instante": {
            "type": "string",
            "description": "Momento a pronosticar, ISO ('2026-07-22T08:00')."
          },
          "horizonte_seg": {
            "type": "integer",
            "minimum": 60,
            "maximum": 21600,
            "description": "Con cuanta anticipacion se pronosticaria. Define el CORTE: solo se ven datos anteriores a instante - horizonte."
          },
          "ventana_min": {
            "type": "number",
            "minimum": 15,
            "maximum": 720,
            "description": "Cuanto pasado describir, en minutos. Por defecto 120."
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
        "medicion_oculta"
      ],
      "ejecutor": "predictivo"
    },
    {
      "nombre": "contexto_historico",
      "descripcion": "Que paso a ESTA MISMA HORA en los dias anteriores, y en que regimen viene el sitio. Sirve para ubicar lo de hoy: si esta hora suele dar 38 % del techo y hoy venis con 12 %, es un dia atipicamente cerrado, y eso cambia que configuracion conviene. Todas las ventanas caen en dias ANTERIORES al corte, asi que no hay forma de que veas el resultado. Usala junto con diagnosticar_condiciones cuando quieras una hipotesis mejor fundada que 'lo de recien se mantiene'.",
      "input_schema": {
        "type": "object",
        "properties": {
          "variable": {
            "type": "string",
            "enum": [
              "irradiancia",
              "humedad_suelo"
            ]
          },
          "instante": {
            "type": "string",
            "description": "Momento a pronosticar, ISO."
          },
          "horizonte_seg": {
            "type": "integer",
            "minimum": 60,
            "maximum": 21600,
            "description": "Define el corte, igual que en el diagnostico."
          },
          "dias": {
            "type": "integer",
            "minimum": 1,
            "maximum": 30,
            "description": "Cuantos dias anteriores mirar. Por defecto 7."
          },
          "ventana_min": {
            "type": "number",
            "minimum": 15,
            "maximum": 240,
            "description": "Ancho de la ventana centrada en esa hora. Por defecto 60."
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
        "medicion_oculta"
      ],
      "ejecutor": "predictivo"
    },
] as const;
