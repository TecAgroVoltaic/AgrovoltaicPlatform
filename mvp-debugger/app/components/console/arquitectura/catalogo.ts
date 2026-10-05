// Catálogo de la vista de arquitectura: la PROSA y la GEOMETRÍA.
//
// Reparto deliberado con el servicio:
//   * `/arquitectura` aporta lo verificable: nombres, parámetros, tipos,
//     rangos, obligatoriedad, en qué modo vive cada herramienta, los límites y
//     la cobertura de datos. Eso se deriva del código, así que no puede mentir.
//   * este archivo aporta lo que ningún esquema puede decir: POR QUÉ existe cada
//     pieza, qué límite es una decisión y no un detalle, y qué prueba la blinda.
//
// La consecuencia práctica: si alguien agrega una herramienta y no la documenta
// acá, la vista la dibuja igual (con su esquema y una marca «sin documentar»).
// Y si acá queda una ficha de algo que el servicio ya no expone, la vista lo
// avisa en vez de seguir mostrándola. Nunca puede aparecer una ficción callada.
//
// La prosa se escribe en markdown y se pinta con `renderMd` (lib/markdown.ts):
// escapa el HTML antes de formatear, así que no hay marcado suelto en el DOM.

/** Lo que un humano necesita saber y el esquema no dice. */
export type Ficha = {
  /** Rótulo corto del nodo en el lienzo. Sin él se usa la descripción del servicio. */
  resumen?: string;
  /** Una línea, texto plano: va al `data-tip` que consume ChartTooltip. */
  hover: string;
  /** Markdown. QUÉ hace, en una o dos frases. Sin justificar: eso va en `ayuda`. */
  hace: string;
  /**
   * Markdown. EN QUÉ AYUDA: qué sería peor sin esta pieza, con un número medido
   * cuando exista. Es la pregunta que el esquema no contesta y la que de verdad
   * justifica que la pieza exista; separarla de `hace` evita el párrafo denso que
   * mezclaba mecanismo con motivo y no respondía bien ninguno de los dos.
   */
  ayuda?: string;
  devuelve?: string[];
  limites?: string[];
  puntos?: string[];
  pruebas?: string[];
  archivo?: string;
};

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

// ── Geometría del lienzo ───────────────────────────────────────────────────
export const LIENZO = { w: 1140, margenInferior: 34 };
export const COL = { entrada: 16, puerta: 200, cerebro: 316, tool: 596, dato: 890 };
export const ANCHO = { entrada: 168, puerta: 96, cerebro: 232, tool: 246, dato: 234 };
/** Alto, separación y arranque de la pila de herramientas. */
export const TOOL = { h: 64, gap: 14, y0: 76, entreGrupos: 82, encabezado: 20 };

export type Grupo = "entrada" | "puerta" | "cerebro" | "servidor" | "dato";

export type NodoFijo = {
  id: string;
  grupo: Grupo;
  x: number; y: number; w: number; h: number;
  titulo: string;
  sub: string;
  ficha: Ficha;
};

// Todo lo que no es una herramienta: entra por posición fija porque su lugar en
// el relato no cambia (la pila de herramientas sí se calcula, ver Lienzo).
export const NODOS_FIJOS: NodoFijo[] = [
  {
    id: "e-consola", grupo: "entrada", x: COL.entrada, y: 70, w: ANCHO.entrada, h: 62,
    titulo: "Consola", sub: "Predicción vs Real · dos modos",
    ficha: {
      hover: "Manda una pregunta puntual sobre el momento que estás viendo, en el modo que elijas. Un solo turno, sin hilo.",
      hace: "La vista elige fecha, momento y anticipación, y dibuja lo medido contra el techo de cielo despejado. El botón manda la **pregunta** al agente, nunca los números. Pasárselos lo convertiría en un redactor de datos que no verificó.",
      puntos: [
        "Un turno por lectura: no reusa ni ensucia el hilo del chat flotante.",
        "La tarjeta compara después lo que recibió el agente contra lo que dibuja el gráfico; si no coincide, lo marca.",
      ],
      archivo: "app/components/console/LecturaAgente.tsx",
    },
  },
  {
    id: "e-chat", grupo: "entrada", x: COL.entrada, y: 150, w: ANCHO.entrada, h: 62,
    titulo: "Chat flotante", sub: "hilo multiturno con contexto",
    ficha: {
      hover: "Hilo multiturno. Manda el historial de texto limpio más el contexto de la vista activa.",
      hace: "Conversación libre con el agente. El historial viaja como texto plano (barato y sin malformar) y se recorta a los últimos mensajes.",
      puntos: [
        "El contexto de la vista se inyecta en el turno del usuario, no en el prompt de sistema.",
        "Si una herramienta devuelve un gráfico, se pinta inline; ese payload no va al modelo.",
      ],
      archivo: "app/components/chat/ChatWidget.tsx",
    },
  },
  {
    id: "e-flow", grupo: "entrada", x: COL.entrada, y: 230, w: ANCHO.entrada, h: 62,
    titulo: "VisioneFlow", sub: "nodo httpRequest → /chat",
    ficha: {
      hover: "El mismo endpoint cableado como nodo HTTP en VisioneFlow. Mismo agente, otra superficie.",
      hace: "Un flujo de tres nodos (disparador, `httpRequest` a `/forecast/chat`, salida) consume exactamente el mismo agente. No hay una segunda implementación.",
      puntos: [
        "La API key se pega en el nodo, como credencial del flujo.",
        "Sirve para demostrar que el agente no depende de la consola.",
      ],
      archivo: "agente-predictivo/flujo-chat-visioneflow.json",
    },
  },
  {
    id: "puerta", grupo: "puerta", x: COL.puerta, y: 150, w: ANCHO.puerta, h: 70,
    titulo: "Proxy Next", sub: "x-api-key · frenos",
    ficha: {
      hover: "El browser nunca habla con Python. La ruta del servidor inyecta la x-api-key; el servicio aplica el freno de ritmo y el presupuesto del día.",
      hace: "Todo pasa por rutas del lado servidor que reenvían al sidecar Python con la clave. Las claves viven solo en el servidor: el browser jamás las ve.",
      puntos: [
        "`x-api-key` obligatoria en producción, sobre HTTPS.",
        "Freno de ritmo por identidad, con token bucket. La identidad es la API key si viene; si no, la IP.",
        "Presupuesto diario duro: al pasarse responde 429 en vez de seguir gastando.",
        "Antes existía el medidor de gasto pero no el freno. Un bucle o un error de integración podían disparar la factura.",
      ],
      archivo: "app/api/predictivo/[...path]/route.ts",
    },
  },
  {
    id: "web_search", grupo: "servidor", x: COL.cerebro, y: 344, w: ANCHO.cerebro, h: 64,
    titulo: "web_search", sub: "la ejecuta Anthropic · nunca para pronosticar",
    ficha: {
      hover: "La ejecuta Anthropic del lado servidor, no nuestro código. Para conocimiento externo, nunca para conseguir un dato del sitio.",
      hace: "Es la única herramienta que sale de la casa, y la única que no corre en nuestro proceso. Sirve para conocimiento general (qué es el índice de cielo despejado, qué dice la literatura sobre un método), no para conseguir un número de San Carlos.",
      limites: [
        "Queda fuera del modo «medición oculta»: ahí no hay nada externo que consultar, y sí una tentación de buscar el dato.",
        "Los pasos de búsqueda quedan en la traza como `tipo: web`.",
      ],
      archivo: "src/predictivo/agent/agent.py · WEB_SEARCH",
    },
  },
  {
    id: "agrodash", grupo: "dato", x: COL.dato, y: 474, w: ANCHO.dato, h: 64,
    titulo: "AgroDash · réplica", sub: "PostgreSQL de Cartago (RO) → ETL → store",
    ficha: {
      hover: "La base PostgreSQL de la región Cartago, restaurada como réplica. El ETL copia de ahí lo que el pronóstico necesita.",
      hace: "Los sensores ambientales de ambos sitios viven en AgroDash; los de San Carlos son las cajas con sufijo `SC`. El ETL lee de ahí y escribe en el store propio: separar «de dónde traigo» de «dónde guardo» evita mezclarlos.",
      puntos: [
        "Canal de irradiancia fijado por identificador, para que la elección sea reproducible y no dependa del orden de las filas.",
        "Cambiar de sitio (San Carlos a Cartago) es cuestión de variables de entorno, no de código.",
      ],
      archivo: "src/predictivo/etl.py",
    },
  },
];

/** El cerebro: nodo grande con su propio interior, por eso va aparte. */
export const CEREBRO = {
  id: "agente",
  x: COL.cerebro, y: 60, w: ANCHO.cerebro, h: 250,
  ficha: {
    hover: "El lazo tool-use manual. El modelo decide qué herramienta llamar; el lazo la ejecuta y le devuelve el resultado; el modelo redacta.",
    hace: "Orquesta y nada más. **No sabe de física**: manda la pregunta al modelo con un juego de herramientas, ejecuta la que pida, le devuelve la salida cruda y repite hasta que el modelo cierra el turno. Es el patrón manual (no el *tool-runner* beta) para tener control del ciclo y no filtrar el razonamiento interno.",
    puntos: [
      "Cada turno devuelve la **traza**: los pasos del modelo, cada ejecución de herramienta con su entrada y su salida cruda, tokens, milisegundos y costo en USD.",
      "El prompt de sistema y el último esquema van con `cache_control: ephemeral`: no se pagan enteros en cada turno.",
      "El modelo elegido es liviano a propósito. El LLM solo orquesta; subir de gama es una variable de entorno.",
    ],
    archivo: "src/predictivo/agent/agent.py",
  } as Ficha,
};

/** La capa determinista: un panel con filas propias. */
export const CAPA = {
  x: COL.dato, y: 60, w: ANCHO.dato, h: 392,
  /** Puerto de entrada de las aristas que vienen de las herramientas. */
  puerto: { x: COL.dato, y: 256 },
  filas: [
    {
      id: "fisica", titulo: "physics.clear_sky_ghi",
      sub: "pvlib · Ineichen + Linke. Astronomía pura: no mira datos medidos",
      ficha: {
        hover: "El techo de cielo despejado, con pvlib. Es astronomía: no mira ningún dato medido.",
        hace: "Calcula cuánta irradiancia habría a esa hora exacta, en esa coordenada, con el cielo perfectamente limpio. De ahí sale el techo del gráfico y el denominador del índice kt*.",
        puntos: [
          "**No viola la barrera anti-fuga.** Evaluar el cielo despejado en un instante futuro es geometría solar, no un dato medido, y por eso el método puede usar «el sol del futuro» sin hacer trampa.",
          "Es justamente lo que la persistencia ingenua no sabe: si el objetivo cae más cerca del mediodía, el pronóstico sube aunque las nubes no cambien.",
        ],
        pruebas: ["`tests/test_physics.py`: 4 pruebas"],
        archivo: "src/predictivo/physics.py",
      } as Ficha,
    },
    {
      id: "forecasters", titulo: "forecasters/",
      sub: "persiste kt*, lo reexpande con el sol del futuro, banda ±1σ",
      ficha: {
        hover: "Persistencia inteligente de kt*, persistencia ingenua (el rival tonto) y humedad de suelo. Acá se produce el número.",
        hace: "**Persistencia inteligente**, en tres pasos: (1) calcular el índice de cielo despejado kt* de los últimos minutos (qué fracción del máximo posible dejaron pasar las nubes); (2) resumirlo con la mediana, asumiendo que las nubes persisten; (3) multiplicarlo por el techo del instante objetivo.",
        puntos: [
          "El supuesto es que **la nubosidad cambia más lento que el sol**. Cuando se rompe, el pronóstico falla, y eso es lo que el agente tiene que anticipar y declarar.",
          "`naive_persistence` repite la última lectura e ignora que el sol se mueve. Existe como rival: el `skill_pct` mide cuánto mejor es el método que ese piso.",
          "`humidity_persistence`: el suelo cambia lento, se persiste la mediana reciente. No hay análogo de cielo despejado.",
          "La banda es ±1σ de kt* sobre la ventana, reexpandida al techo del objetivo.",
        ],
        archivo: "src/predictivo/forecasters/",
      } as Ficha,
    },
    {
      id: "store", titulo: "store · Supabase",
      sub: "lecturas_ambientales_sc · solo lectura, cacheada en memoria",
      ficha: {
        hover: "La tabla lecturas_ambientales_sc, cacheada en memoria. Todo acceso pasa por get_recent_data, que corta en timestamp < ahora.",
        hace: "La serie de la que sale todo. Se carga una vez y se cachea; las herramientas no golpean la base en cada llamada.",
        puntos: [
          "`get_recent_data(now, lookback)` devuelve el intervalo `[now − lookback, now)`. El paréntesis final es la barrera: el forecaster jamás ve un dato con timestamp ≥ now.",
          "`valor_medido(t)` existe aparte y se consulta **después** de pronosticar. Nunca alimenta el cálculo: es lo que hace honesto al backtest.",
          "Conexión de solo lectura. El agente no escribe en ninguna base.",
        ],
        // La cobertura real NO se escribe acá: la inyecta el Lienzo desde
        // `mapa.datos`. Unas fechas a mano en un catálogo envejecen sin que
        // nadie se entere, que es justo la deriva que esta vista evita.
        limites: [
          "La ingesta está congelada: la última fecha de arriba es la última lectura que entró. `/salud/ingesta` responde 503 por dato viejo, que es el comportamiento correcto y no una falla del agente.",
          "La serie no es continua. Las herramientas reportan los huecos en vez de rellenarlos.",
        ],
        archivo: "src/predictivo/data.py",
      } as Ficha,
    },
  ],
};

export const BARRERA = {
  titulo: "Barrera anti-fuga",
  texto: "Toda lectura pasa por `get_recent_data`, que devuelve estrictamente `timestamp < ahora`.",
};
