import type { Ficha } from "./ficha";

// ── Herramientas (clave = el `nombre` que publica el servicio) ─────────────
export const HERRAMIENTAS: Record<string, Ficha> = {
  forecast: {
    resumen: "pronostica a futuro desde el último dato",
    hover: "Pronostica irradiancia o humedad de suelo a un horizonte de hasta 6 horas, anclado en el último dato disponible.",
    hace: "Pronostica hacia adelante desde el último dato que hay en la base, hasta 6 horas. Despacha por variable al forecaster que corresponde y devuelve el número, su banda y el contexto con el que se armó.",
    ayuda: "Es la única pieza que produce un número **hacia el futuro**; todas las demás miran hacia atrás. Y devuelve el contexto junto con el valor, así que el agente puede explicar de dónde salió en vez de recitarlo: si no viniera el kt\\* reciente y el techo, la justificación sería inventada.",
    devuelve: [
      "`valor_esperado`: el número, redondeado a un decimal",
      "`banda {bajo, alto, nivel:±1σ}`: incertidumbre por variabilidad reciente de nubes",
      "`contexto`: kt* reciente, muestras usadas, techo de cielo despejado, si es de noche",
      "`ancla`: desde qué instante se pronosticó, con el rango de datos disponible",
      "`medido`: solo si el instante ya pasó. Se consulta **después** de pronosticar y jamás alimenta el cálculo",
    ],
    limites: [
      "Con menos de **3 lecturas útiles** en la ventana devuelve `null` y lo dice. Un número armado con casi nada es peor que un «no sé».",
      "De noche (techo ≤ 20 W/m²) devuelve 0 en vez de dividir por cero.",
      "El horizonte máximo no es arbitrario: más allá de 6 h, persistir la nubosidad deja de tener sentido físico.",
    ],
    pruebas: [
      "`tests/test_forecast_tool.py`: 17 pruebas",
      "`tests/test_horizon.py`: 6 pruebas sobre la traducción de la frase a segundos",
    ],
    archivo: "src/predictivo/tools/forecast_tool.py",
  },

  backtest: {
    resumen: "reconstruye el pasado y lo compara con lo medido",
    hover: "Reconstruye cómo se habría predicho una fecha pasada y lo compara con lo que midió el sensor. Es la única herramienta que revela el resultado.",
    hace: "Reconstruye qué se habría predicho en cada instante de una fecha pasada, usando **solo** lo anterior a ese instante, y lo contrasta con lo que midió el sensor.",
    ayuda: "Es el banco de pruebas del método: sin ella, «el pronóstico anda bien» sería una opinión. Da el *skill*, que compara contra repetir la última lectura, y ese es el único número que distingue un método útil de uno que acierta porque el cielo estuvo quieto. Es también la herramienta que se le **quita** al agente para que pueda predecir sin ver la medición.",
    devuelve: [
      "`punto_consultado`: real, reconstruido, error, techo y kt* de la hora pedida",
      "`metricas {mae, bias, error_rel_pct, skill_pct}`: el *skill* compara contra la persistencia ingenua",
      "`serie`: la tabla completa real vs reconstruido",
      "`_grafico`: payload para el widget; **se le quita al modelo** antes de mandárselo, para no pagar esos tokens",
    ],
    limites: [
      "**Queda fuera del modo «medición oculta».** Es la única herramienta que trae el valor medido: con ella a mano el agente podría «predecir» sabiendo la respuesta.",
      "Si te pasás del rango disponible, devuelve el rango exacto para que el modelo lo cite en vez de adivinarlo.",
      "El techo de cielo despejado se promedia en resolución nativa antes de agrupar. Evaluado en el borde del bucket daba 0 para el bucket diario, con un *skill* negativo sin sentido.",
    ],
    pruebas: [
      "`tests/test_backtest_mensajes.py`: 18 pruebas",
      "`test_el_modo_medicion_oculta_no_expone_backtest`: verifica que no esté en ese juego",
    ],
    archivo: "src/predictivo/tools/backtest_tool.py",
  },

  diagnosticar_condiciones: {
    resumen: "cómo venía el cielo antes del corte",
    hover: "Describe cómo venía el cielo en los minutos previos al corte y cuánto se mueve el techo en el horizonte. Es la evidencia con la que el agente elige su configuración.",
    hace: "Corta los datos en `instante − horizonte` y describe cómo venía el cielo hasta ahí: qué tan claro, qué tan disperso, subiendo o bajando, con o sin saltos bruscos.",
    ayuda: "Es lo que convierte la predicción en un razonamiento en vez de un botón. Sin este paso el agente elegiría la configuración a ciegas o la dejaría por defecto siempre; con él puede argumentar «venía cerrándose, le creo menos a lo reciente». Trae además la **teoría** de cada perilla, así la elección se defiende con un mecanismo y no con una corazonada.",
    devuelve: [
      "`claridad`: mediana, mínimo, máximo, desviación, tendencia, saltos bruscos y régimen",
      "`techo {en_el_corte, en_el_objetivo, cambio_pct}`: astronómico, no medido",
      "`franja_del_dia`, `n_lecturas`, `datos_visibles_hasta`",
      "`teoria`: qué hace cada perilla y cuándo conviene moverla",
    ],
    limites: [
      "**No devuelve el valor medido del instante objetivo.** Ese no existe antes de predecir.",
      "El porcentaje se llama `pct_del_techo` y no `kt*` a propósito: un porcentaje no se puede leer al revés. El agente ya reportó una vez un 5 % como «muy despejado».",
      "Con muy pocas lecturas útiles avisa, en lugar de inventar una estadística.",
    ],
    pruebas: ["`test_el_diagnostico_corta_los_datos_antes_del_horizonte`"],
    archivo: "src/predictivo/tools/diagnostico_tool.py",
  },

  contexto_historico: {
    resumen: "qué es normal a esta hora en los días previos",
    hover: "Qué pasó a esta misma hora en los días anteriores, y en qué régimen viene el sitio. Ubica lo de hoy contra lo normal.",
    hace: "Dice qué pasó a esta misma hora en los días anteriores, y en qué régimen viene el sitio día a día.",
    ayuda: "Sin esto, un 12 % del techo no significa nada: no hay contra qué compararlo. Con esto se sabe si es un día atípicamente cerrado (lo típico a esa hora son 21 %) o simplemente la tarde de siempre. Es la misma información que arregló el sesgo diurno del método: el sitio tiene mañanas claras y tardes que se cierran, y persistir la mañana hacia la tarde erraba **+52 % a las 16 h**.",
    devuelve: [
      "`misma_hora_dias_previos[]`: fecha, % del techo y nº de lecturas por día",
      "`tipico {pct_tipico, pct_min, pct_max, dispersion, n_dias_con_dato}`",
      "`regimen_diario[]`: cómo viene el sitio día a día",
      "`comparacion`: promedio de los días anteriores, para detectar nubosidad sostenida",
    ],
    limites: [
      "Todas las ventanas caen en **días anteriores al corte**: por construcción no hay forma de ver el resultado.",
      "La cobertura no es continua. Los días sin dato se reportan como tales, no se rellenan.",
    ],
    pruebas: ["`test_el_contexto_historico_no_toca_el_dia_objetivo`"],
    archivo: "src/predictivo/tools/diagnostico_tool.py",
  },

  riesgo_de_nubes: {
    resumen: "cuánto confiar en el número, y de qué lado puede fallar",
    hover: "En qué régimen viene el cielo y con qué frecuencia cambia fuerte a esa hora, separado por dirección. No predice si va a haber nubes.",
    hace: "Mide en qué régimen viene el cielo (calmo, medio o turbulento, con umbrales sacados del propio sitio) y con qué frecuencia cambia fuerte a esa hora, separando si se tapa o si se abre.",
    ayuda: "Sin esto la confianza declarada sería una impresión. Con esto la banda se estrecha cuando el cielo está quieto y se abre cuando está movido: a 1 h la dispersión entre regímenes pasó de **19 a 8 puntos**, con una banda **más angosta** (307 → 289 W/m²). Y sirve para decir de qué lado puede fallar, porque el error es asimétrico: si se tapa el número queda **+181** alto; si se abre, **−233** bajo.",
    devuelve: [
      "`estado_actual {turbulencia, regimen, n}`: calmo / medio / turbulento, con umbrales derivados del propio sitio",
      "`frecuencia_historica_a_esta_hora {pct_se_tapa, pct_se_abre, direccion_dominante}`",
      "`asimetria_del_error`: si se tapa el número queda alto (+180 W/m² a 1 h); si se abre, bajo (−230)",
      "`como_leerlo` y `como_declarar_confianza`: cómo convertirlo en un juicio",
      "`datos_visibles_hasta`: el corte, siempre anterior al instante",
    ],
    limites: [
      "**Es frecuencia histórica, no previsión.** Dice cada cuánto pasa a esa hora, no si va a pasar hoy. La salida lo declara para que no se lea al revés.",
      "La ventana del régimen se ancla en el **corte**, no en el instante objetivo. Medirla alrededor del objetivo sería mirar datos posteriores al corte.",
      "Sirve sobre todo hasta 1 o 2 h. A 3 h o más el estado actual ya casi no informa y solo queda la hora del día; la salida lo avisa.",
      "Sin historia suficiente devuelve `null`, no una etiqueta inventada: decir «turbulento» sin referencia contra qué compararlo no significa nada.",
    ],
    pruebas: [
      "`test_la_ventana_se_ancla_en_el_corte_no_en_el_objetivo`: prueba por perturbación",
      "`test_riesgo_de_nubes_no_devuelve_el_valor_medido`: mismo contrato que `predecir`, sin la medición",
      "`test_la_banda_es_mas_angosta_con_el_cielo_quieto`",
    ],
    archivo: "src/predictivo/tools/riesgo_tool.py",
  },

  predecir: {
    resumen: "se compromete con un número · hipótesis obligatoria",
    hover: "Pronostica un instante histórico con la configuración que el agente elija, sin ver el resultado. La hipótesis es obligatoria.",
    hace: "El momento en que el agente se compromete con un número. Corre el mismo método que el backtest pero **devolviendo solo la predicción**: ni el valor medido ni el error.",
    ayuda: "Es lo que hace demostrable que el agente predice y no describe. Al no devolver `medido` ni `error`, la justificación no puede ser una racionalización armada después de ver el resultado. Y como `hipotesis` es **obligatoria en el esquema**, el motivo se escribe *antes* de conocer el número: si fuera opcional, el modelo pediría el valor y después inventaría la razón.",
    devuelve: [
      "`valor_esperado` y `banda {bajo, alto, ±1σ}`",
      "`hipotesis`: devuelta tal cual, para que quede en la traza",
      "`configuracion` y `es_la_configuracion_por_defecto`",
      "`contexto`: muestras en la ventana, % del techo persistido, techo en el objetivo, si es de noche",
      "`datos_visibles_hasta`: hasta dónde se miró",
    ],
    limites: [
      "**No devuelve `medido` ni `error`.** Una prueba recorre la respuesta en todos sus niveles verificando que esas claves no aparezcan.",
      "Las perillas existen para elegir **razonando sobre las condiciones previas**, no para ajustar contra el resultado. Eso último no sería predecir.",
      "En humedad de suelo solo aplica `lookback_min`: no hay kt* que topar. Si le pasan las otras, avisa.",
      "Sin argumento, el prompt le pide usar la configuración por defecto y decirlo. Mover perillas sin motivo es ruido, no criterio.",
    ],
    pruebas: ["`test_predecir_no_devuelve_el_valor_medido`: chequeo recursivo de claves prohibidas"],
    archivo: "src/predictivo/tools/predecir_tool.py",
  },
};

