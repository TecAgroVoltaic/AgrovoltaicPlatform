// Copia del mapa del agente, para cuando el servicio no responde.
//
// POR QUE EXISTE: la vista de arquitectura no muestra datos medidos, muestra la
// FORMA del agente (sus modos, sus herramientas, sus limites). Eso cambia cuando
// cambia el codigo, no cada cinco minutos, asi que no hay razon para que la
// pantalla se caiga cuando el servidor esta apagado de noche o el fin de semana.
//
// COMO SE USA: la vista pide el mapa vivo igual que antes. Si el servicio
// responde, gana el vivo. Si no, cae aca y ademas lo dice, para que nadie
// confunda una copia con la realidad.
//
// COMO SE REGENERA (cuando cambien modos, tools o limites):
//   curl -s -H "x-api-key: $CLAVE" \
//     https://agro.visione-edge.com/predictivo/arquitectura | python3 -m json.tool
//
// Capturado: 2026-08-25
export const MAPA_RESPALDO = {
  "agente": {
    "nombre": "agente-predictivo",
    "modelo": "claude-haiku-4-5",
    "sitio": {
      "nombre": "San Carlos",
      "lat": 10.33,
      "lon": -84.42,
      "alt": 600.0,
      "tz": "America/Costa_Rica"
    },
    "lazo": "tool-use manual"
  },
  "modos": {
    "medicion_visible": {
      "herramientas": [
        "forecast",
        "backtest",
        "riesgo_de_nubes"
      ],
      "web_search": true,
      "objetivo": "El agente VE lo que midio el sensor. Sirve para juzgar el metodo despues del hecho: su trabajo es interpretar el resultado, no adivinarlo."
    },
    "medicion_oculta": {
      "herramientas": [
        "diagnosticar_condiciones",
        "contexto_historico",
        "riesgo_de_nubes",
        "predecir"
      ],
      "web_search": false,
      "objetivo": "El agente NO ve lo que midio el sensor. Pronostica de verdad. El juego de herramientas deja fuera la unica que lo revela, asi que la garantia no depende de que el modelo obedezca el prompt."
    }
  },
  "herramientas": [
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
    {
      "nombre": "predecir",
      "descripcion": "Pronostica un instante HISTORICO con la configuracion que vos elijas, sin ver el resultado. Usala DESPUES de diagnosticar: primero mira las condiciones previas, forma una hipotesis fisica, y recien ahi predeci con la configuracion que esa hipotesis justifica. Devuelve el valor esperado y su banda; NO devuelve lo que midio el sensor ni el error, porque eso se conoce despues. Tenes que pasar `hipotesis`: el argumento por el que elegiste esa configuracion.",
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
            "description": "Con cuanta anticipacion se predice."
          },
          "hipotesis": {
            "type": "string",
            "description": "Por que elegiste esta configuracion, apoyado en el diagnostico. Ej: 'el cielo viene cerrado y estable (11 % del techo, sin saltos), asi que amplio la ventana a 120 min para no dejarme llevar por una lectura suelta'. Si no tenes un argumento, usa la configuracion por defecto y decilo."
          },
          "lookback_min": {
            "type": "number",
            "minimum": 15,
            "maximum": 720,
            "description": "Minutos hacia atras para estimar el estado a persistir. Por defecto 60. Corta = reacciona rapido pero con pocas muestras; larga = estable pero lenta ante un cambio real."
          },
          "estadistico": {
            "type": "string",
            "enum": [
              "ewma",
              "mediana",
              "media",
              "ultimo"
            ],
            "description": "Como se resume la ventana. Por defecto 'ewma' (pondera por antiguedad: lo mas reciente pesa mas). 'mediana' ignora una lectura atipica; 'ultimo' es lo mas reactivo."
          },
          "peso": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Cuanto se le cree a lo reciente, de 0 a 1. Sin pasarlo se DERIVA de cuanto se parece el cielo a si mismo a este horizonte (medido: 0,65 a 30 min, 0,52 a 1 h, 0,31 a 3 h, 0,13 a 6 h), y eso es casi siempre lo correcto. Subilo solo si tenes un argumento para que HOY lo reciente valga mas de lo habitual (cielo parejo, sin frentes a la vista); bajalo si el cielo viene errático y conviene apoyarse en lo tipico. Con 1 se persiste tal cual; con 0 se predice lo tipico de esa hora."
          },
          "kt_max": {
            "type": "number",
            "minimum": 0.5,
            "maximum": 3,
            "description": "Tope al indice de cielo despejado, contra el realce por nubes. MEDIDO: mover este tope entre 1,2 y 2,0 cambia el error menos de 0,5 W/m2. Existe por completitud; no armes una hipotesis alrededor de el."
          }
        },
        "required": [
          "variable",
          "instante",
          "horizonte_seg",
          "hipotesis"
        ],
        "additionalProperties": false
      },
      "modos": [
        "medicion_oculta"
      ],
      "ejecutor": "predictivo"
    }
  ],
  "web_search": {
    "nombre": "web_search",
    "tipo": "web_search_20250305",
    "max_uses": 3,
    "ejecutor": "anthropic",
    "modos": [
      "medicion_visible"
    ]
  },
  "limites": {
    "horizonte_seg": {
      "min": 60,
      "max": 21600
    },
    "llm_por_min": 12,
    "datos_por_min": 120,
    "presupuesto_diario_usd": 5.0,
    "umbral_cielo_despejado": 20.0,
    "historial_mensajes": 16,
    "max_tokens": 2048
  },
  "datos": {
    "irradiancia": {
      "desde": "2025-11-28T14:35:23-06:00",
      "hasta": "2026-07-23T02:31:22-06:00",
      "n": 31946,
      "unidad": "W/m2"
    },
    "humedad_suelo": {
      "desde": "2026-05-01T00:00:32-06:00",
      "hasta": "2026-07-23T02:32:06-06:00",
      "n": 138786,
      "unidad": "crudo"
    }
  }
} as const;
