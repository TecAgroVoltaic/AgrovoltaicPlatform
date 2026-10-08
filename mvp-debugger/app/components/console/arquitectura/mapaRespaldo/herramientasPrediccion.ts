// Herramienta del Predictivo que predice con la medición oculta. Parte de la copia capturada: ver `mapaRespaldo.ts`.
export const HERRAMIENTAS_PREDICCION = [
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
] as const;
