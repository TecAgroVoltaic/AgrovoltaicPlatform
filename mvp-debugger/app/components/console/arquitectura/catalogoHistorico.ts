// Prosa de la arquitectura del Agente Histórico. El mismo reparto que su gemelo
// del Predictivo (`catalogo.ts`): el servicio aporta lo verificable (nombres,
// parámetros, umbrales, familias), este archivo aporta lo que ningún esquema
// puede decir, que es POR QUÉ existe cada pieza.
//
// Si acá falta una ficha, la vista dibuja la herramienta igual con su contrato y
// la marca «sin documentar». Si sobra una, la vista lo avisa. Nunca calla la
// diferencia: el valor de esta pantalla es que no puede mostrar un agente que no
// sea el que está corriendo.
import type { Ficha } from "./catalogo";

export const HERRAMIENTAS_HISTORICO: Record<string, Ficha> = {
  // ── Familia ANÁLISIS: qué pasó ──────────────────────────────────────────
  energia_por_arreglo: {
    resumen: "energía generada por PV1 y PV2",
    hover: "Energía eléctrica generada por cada arreglo en un período, integrando la potencia corregida.",
    hace: "Integra la potencia corregida a lo largo del período: `sum(potencia_W) × (5 min / 60)` = Wh, por arreglo.",
    ayuda: "Integra en vez de leer el acumulador `energia_*_wh` del inversor, y esa es la decisión que la hace confiable: el acumulador **se resetea todos los días**, así que cualquier período que cruce un reset daría un número sin sentido. La integral no depende de eso.",
    archivo: "tools/energia.py",
  },
  performance_ratio: {
    resumen: "cuánto rinde cada arreglo contra su techo",
    hover: "Performance Ratio ponderado por energía: lo generado contra lo que la irradiancia recibida permitía generar.",
    hace: "PR = energía real / (P₀ × insolación POA / 1000), con P₀ = 1420 Wp por arreglo y la POA efectiva bifacial.",
    ayuda: "Es la única métrica que permite comparar PV1 con PV2 siendo **geometrías distintas** (20° inclinado contra 90° vertical): la energía bruta siempre favorece al inclinado porque recibe más sol, no porque funcione mejor. El PR divide por lo que cada uno recibió.",
    limites: [
      "Reporta `n` porque los pares potencia + POA con el timestamp exacto son **pocos**: no todos los instantes cruzan.",
      "El PR del vertical incluye ganancia bifacial **modelada** con un factor asumido, no medida. No es comparable con un PR de catálogo.",
    ],
    archivo: "tools/performance.py",
  },
  irradiancia_resumen: {
    resumen: "cuánto sol llegó, y qué fracción del techo",
    hover: "Irradiancia GHI e índice de cielo despejado kt*, solo sobre lecturas válidas y con QC aprobado.",
    hace: "Resume la GHI del período y su kt*. La insolación (Wh/m²) es la integral a 15 s: `sum(GHI) × (15 s / 3600)`.",
    ayuda: "Filtra por `valido AND qc_ok` sobre la vista calibrada, no sobre el crudo. El crudo de este sitio tiene el offset del piranómetro sin calibrar y valores imposibles: promediarlo daría un número plausible y falso.",
    archivo: "tools/irradiancia.py",
  },
  temperatura_por_arreglo: {
    resumen: "temperatura de cada arreglo",
    hover: "Temperatura de PV1 (inclinado) y PV2 (vertical), con los DS18B20 ya corregidos.",
    hace: "Devuelve la temperatura por arreglo: `temp_inclinado` = PV1, `temp_vertical` = PV2.",
    ayuda: "Los DS18B20 escupen **85 °C constantes cuando se desconectan**, y eso pasa en 117 días del histórico. La vista los pasa a NULL junto con todo lo que cae fuera de 10–80 °C, así que el promedio no queda arrastrado por un sensor muerto.",
    archivo: "tools/temperatura.py",
  },
  tendencia: {
    resumen: "cómo evolucionó una métrica, en números",
    hover: "Resumen de la evolución de una métrica (n, mín, máx, media por serie), sin devolver la serie punto a punto.",
    hace: "La versión de texto de `graficar`: mismos datos y mismo mapa de métricas, pero devuelve el resumen por serie en vez de los arreglos completos.",
    ayuda: "Existe para los agentes que **no tienen dónde pintar** (VisioneFlow, por ejemplo). Mandar 3.000 puntos a un agente de texto quema tokens para que el modelo termine diciendo «subió»; el resumen dice lo mismo y cuesta dos órdenes de magnitud menos.",
    archivo: "tools/tendencia.py",
  },
  cobertura_datos: {
    resumen: "qué datos hay y cuántos",
    hover: "Rango de fechas disponible y cuántas filas hay de cada fuente en el período.",
    hace: "Responde «de cuándo a cuándo hay datos» y «cuántas filas», por fuente.",
    ayuda: "Es la pregunta previa a cualquier otra. Sin ella el agente puede reportar el promedio de un período que tiene tres días de datos y presentarlo como el promedio del mes.",
    archivo: "tools/cobertura.py",
  },
  catalogo_variables: {
    resumen: "qué significa cada columna",
    hover: "Definiciones aprobadas por el equipo para cada variable de los datos.",
    hace: "Lee `diccionario_variables` y devuelve el catálogo completo. Sin parámetros.",
    ayuda: "Es la herramienta que impide la clase de invención más difícil de detectar: que el modelo **explique una columna de memoria**. Con 13 esquemas distintos y nombres como `temp_vertical`, adivinar qué mide cada una es exactamente lo que no debe pasar.",
    archivo: "tools/catalogo.py",
  },
  graficar: {
    resumen: "dibuja una métrica en el chat",
    hover: "Arma un gráfico de datos reales de la base para mostrarlo dentro del chat.",
    hace: "Devuelve la serie real más un marcador `_grafico` que el widget del chat pinta.",
    ayuda: "El gráfico **es la salida de una herramienta**, no una imagen que el modelo describa: no puede dibujar una tendencia que los datos no tengan. Además el lazo le pasa al modelo solo el resumen y no los arreglos, así que mostrar no cuesta tokens.",
    archivo: "tools/graficar.py",
  },

  // ── Familia CALIDAD: si el dato sirve ───────────────────────────────────
  calidad_periodo: {
    resumen: "¿me puedo fiar de este período?",
    hover: "Veredicto agregado: cuántos días son utilizables, cuántos están degradados y cuántos no tienen datos.",
    hace: "Devuelve el veredicto del período y los problemas más frecuentes que lo explican.",
    ayuda: "Es la primera pregunta que hay que hacerse antes de mirar cualquier número del histórico, y hasta que existió esta familia no había forma de hacerla. Comparte el criterio con la vista de calidad y con el bloque `confianza`: **una sola definición de «día utilizable»**, así el agente no puede contradecir al cuadrito que estás mirando.",
    archivo: "tools/calidad_periodo.py",
  },
  hallazgos_calidad: {
    resumen: "qué está roto, dónde y desde cuándo",
    hover: "Detalle de los problemas detectados: tipo, variable, día y cuántas lecturas afecta.",
    hace: "El detalle detrás del veredicto. Filtrable por tipo, severidad y variable.",
    ayuda: "Devuelve `que_es` junto a cada hallazgo en vez de solo el nombre interno. Un payload que dijera `saturado_85` a secas obliga al modelo a adivinar qué significa, y adivinar es justo lo que no queremos que haga.",
    archivo: "tools/hallazgos.py",
  },
  cielo_periodo: {
    resumen: "cómo estuvo el cielo",
    hover: "Índice de cielo despejado (kt), índice de variabilidad y reparto de días entre despejado, parcial, cubierto y variable.",
    hace: "Caracteriza el cielo del período: cuánta luz llegó (kt) y qué tan intermitente fue (índice de variabilidad).",
    ayuda: "Separa dos cosas que la irradiancia cruda mezcla. **kt** dice cuánta luz llegó, quitándole la parábola del sol, y por eso «0,9 a mediodía» y «0,9 a las siete» significan lo mismo. El **índice de variabilidad** dice cómo llegó: un día de kt 0,5 puede ser una capa uniforme toda la mañana o el sol entrando y saliendo cada dos minutos, y para un inversor no son lo mismo.",
    archivo: "tools/cielo_periodo.py",
  },
  diagnostico_dia: {
    resumen: "todo lo que se sabe de un día",
    hover: "Los hallazgos de un día concreto y, si no hay datos, de cuándo a cuándo va el hueco al que pertenece.",
    hace: "Para una fecha: cuántas lecturas grabó cada fuente contra cuántas debía, el veredicto, la lista completa de hallazgos, el cielo, los días vecinos y los bordes del hueco.",
    ayuda: "Es la que hace posible explicar un cuadrito del mapa de días sin inventar. El caso más frecuente de ese mapa es el día **vacío**: 295 de 569 días no tienen ni una fila, y ahí una consulta de hallazgos devuelve una lista vacía, que es justo el material con el que un modelo fabrica un motivo. Esta herramienta devuelve lo que sí es verificable de la ausencia (a qué hueco pertenece, cuál fue el último día grabado) y declara en su propia salida que el store registra la falta de dato, **no su causa**.",
    limites: [
      "No dice POR QUÉ faltó el dato, porque eso no está registrado en ninguna parte. Dice desde cuándo hasta cuándo falta, y ahí se detiene.",
    ],
    archivo: "tools/diagnostico_dia.py",
  },
};

/** Qué aporta cada familia, dicho para un lector y no para el modelo. */
export const FAMILIAS: Record<string, { titulo: string; nota: string }> = {
  analisis: {
    titulo: "Análisis",
    nota: "Qué pasó. Trabajan sobre las vistas corregidas, no sobre el crudo.",
  },
  calidad: {
    titulo: "Calidad",
    nota: "Si el dato sirve. No calculan: LEEN el store que dejó el barrido.",
  },
};

// ── Geometría del lienzo ────────────────────────────────────────────────────
// Mismas columnas y proporciones que el mapa del Predictivo, a propósito: son dos
// agentes del mismo sistema y cambiar el lenguaje visual entre uno y otro obliga a
// releer la pantalla desde cero. Lo que cambia es el RELATO, no el vocabulario.
//
// Lo único que se posiciona a mano es lo que no varía nunca. La pila de
// herramientas se calcula desde lo que publica el servicio (ver LienzoHistorico),
// así que si mañana hay trece, entra sola y el lienzo crece.
export const LIENZO_H = { w: 1140, margenInferior: 34 };
export const COL_H = { entrada: 16, puerta: 216, cerebro: 332, tool: 620, dato: 908 };
export const ANCHO_H = { entrada: 172, puerta: 88, cerebro: 240, tool: 248, dato: 216 };
// Alto y separación de la pila. El alto da para dos renglones MÁS la marca de
// `confianza`, que va en la fila del título y no debajo: apretados, el chip se
// comía el borde del nodo siguiente.
export const TOOL_H = { h: 58, gap: 14, y0: 76, entreGrupos: 62, encabezado: 22 };

export type NodoFijoH = {
  id: string; grupo: "entrada" | "puerta";
  x: number; y: number; w: number; h: number;
  titulo: string; sub: string; ficha: Ficha;
};

export const NODOS_FIJOS_H: NodoFijoH[] = [
  {
    id: "h-consola", grupo: "entrada", x: COL_H.entrada, y: 76, w: ANCHO_H.entrada, h: 60,
    titulo: "Consola", sub: "Calidad de datos · mapa de días",
    ficha: {
      hover: "Las vistas de calidad leen el store directamente por HTTP, sin pasar por el modelo.",
      hace: "«Calidad de datos» pide tres lecturas del store (`/calidad/resumen`, `/calidad/dias`, `/calidad/hallazgos`) y las dibuja. No hay LLM en ese camino y por eso no cuesta un centavo.",
      ayuda: "Que la vista NO pase por el agente es lo que la hace comparable con el reporte del CLI: los dos leen la misma tabla con el mismo criterio. Si la consola calculara el veredicto por su cuenta, podría discrepar del agente sobre si un día sirve, y eso no se nota hasta que alguien ya decidió algo con él.",
      archivo: "app/components/console/CalidadView.tsx",
    },
  },
  {
    id: "h-chat", grupo: "entrada", x: COL_H.entrada, y: 150, w: ANCHO_H.entrada, h: 60,
    titulo: "Chat flotante", sub: "hilo multiturno + contexto de la vista",
    ficha: {
      hover: "Hilo multiturno. Manda el historial de texto limpio más el contexto de la vista activa.",
      hace: "Conversación libre. El historial viaja como texto plano (barato y sin poder malformarse) y se recorta a los últimos mensajes.",
      puntos: [
        "El contexto de la vista se inyecta en el turno del usuario, **fuera** de la parte cacheada del prompt: cambiar de filtro no invalida la caché.",
        "Si una herramienta devuelve un gráfico, se pinta inline; ese payload no va al modelo.",
      ],
      archivo: "app/components/chat/ChatWidget.tsx",
    },
  },
  {
    id: "h-flow", grupo: "entrada", x: COL_H.entrada, y: 224, w: ANCHO_H.entrada, h: 60,
    titulo: "VisioneFlow", sub: "un httpRequestTool por herramienta",
    ficha: {
      hover: "El orquestador externo cablea cada herramienta como un nodo HTTP y pone su propio LLM.",
      hace: "VisioneFlow no usa el agente: usa sus **herramientas**. Cada una se cablea como una instancia del nodo genérico `httpRequestTool` contra `POST /tool/<nombre>`, y el modelo lo pone el canvas.",
      ayuda: "Es la prueba de que el reparto «cerebro vs manos» es real y no una figura retórica: los números salen igual con otro cerebro encima, porque el cálculo nunca estuvo en el modelo.",
      archivo: "src/historico/api.py",
    },
  },
  {
    id: "h-puerta", grupo: "puerta", x: COL_H.puerta, y: 150, w: ANCHO_H.puerta, h: 64,
    titulo: "x-api-key", sub: "salvo /health y /arquitectura",
    ficha: {
      hover: "Comparación en tiempo constante. Sin la clave configurada, la verificación se desactiva: la ausencia no falla, abre.",
      hace: "Exige el header `x-api-key` en todo lo que toca datos. La comparación es en tiempo constante (`secrets.compare_digest`).",
      limites: [
        "`/health`, `/tools` y `/arquitectura` quedan **abiertos a propósito**: describen al agente, no sus datos, y la consola dibuja el mapa sin credencial.",
        "Si la variable de entorno no está, la verificación **se desactiva** en vez de fallar. Un renombre sin respaldo no tumba el servicio: lo deja abierto.",
      ],
      archivo: "src/historico/api.py",
    },
  },
];

/** El modelo. Su contenido sale del mapa; acá solo vive el «por qué». */
export const CEREBRO_H = {
  x: COL_H.cerebro, y: 60, w: ANCHO_H.cerebro, h: 250,
  ficha: {
    hover: "El lazo tool-use manual. El modelo elige qué herramienta llamar; el lazo la ejecuta y le devuelve el JSON crudo; el modelo redacta.",
    hace: "Orquesta y nada más. **No sabe SQL ni física**: manda la pregunta al modelo con el juego de herramientas, ejecuta la que pida, le devuelve la salida cruda y repite hasta que cierra el turno.",
    ayuda: "Es genérico sobre el registro de herramientas: no hay lógica de ninguna de ellas acá. Agregar una es crear su archivo e importarlo, sin tocar el lazo.",
    puntos: [
      "Patrón manual y no el *tool-runner* beta: control del ciclo y sin filtrar el razonamiento interno.",
      "Cada turno devuelve la **traza**: pasos del modelo, cada herramienta con entrada y salida cruda, tokens, milisegundos y US$.",
      "El modelo es liviano a propósito. Solo orquesta; subir de gama es una variable de entorno.",
    ],
    archivo: "src/historico/agent/agent.py",
  } as Ficha,
};

/** A dónde va a leer cada familia. Es la mitad del relato de este agente. */
export const DESTINO: Record<string, { titulo: string; sub: string; filas: string[]; ficha: Ficha }> = {
  analisis: {
    titulo: "Vistas corregidas",
    sub: "el crudo sigue crudo; la corrección vive en vistas",
    filas: ["v_sc_electrico_corregido", "v_sc_radiacion_calibrada", "v_sc_performance"],
    ficha: {
      hover: "Las herramientas de análisis nunca leen la tabla cruda: leen las vistas donde ya se aplicaron las correcciones.",
      hace: "Vistas de PostgreSQL sobre las tablas base. Ahí es donde los 85 °C pasan a NULL, la irradiancia negativa queda en cero y la potencia se recorta a un rango físico.",
      ayuda: "Es la regla rectora del proyecto, validada con Leo Cardinale: **se guarda el crudo y se corrige en una capa de análisis**. Corregir al insertar destruye la evidencia y hace irrepetible cualquier revisión del criterio; corregir en una vista deja las dos versiones disponibles y permite cambiar de opinión sin re-cargar 285 CSV.",
      archivo: "docs/memoria/decisiones/respuestas-leo-cardinale.md",
    },
  },
  calidad: {
    titulo: "Store de hallazgos",
    sub: "un renglón por (día, fuente, variable, tipo)",
    filas: ["hallazgos_calidad", "cielo_diario", "ventana_solar"],
    ficha: {
      hover: "Las herramientas de calidad no detectan nada: leen lo que el barrido ya dejó escrito.",
      hace: "Tres tablas. `hallazgos_calidad` con PK `(fecha, fuente, variable, tipo)`, así que re-correr el barrido actualiza en vez de duplicar; `cielo_diario` con la caracterización del cielo; `ventana_solar` con el amanecer y el atardecer de cada día.",
      ayuda: "`ventana_solar` es una tabla y no un cálculo al vuelo por un motivo que decide todo lo demás: el logger **solo graba de día**, así que «el día está completo» no se mide contra 24 h sino contra las horas de sol de ese día. Y sin una tabla con TODOS los días del calendario, los días sin ninguna fila serían invisibles, que es justo el hallazgo más grande del histórico.",
      archivo: "sql/001_calidad_y_cielo.sql",
    },
  },
};

/** El barrido: la pieza que hace que el agente no tenga que detectar nada. */
export const BARRIDO = {
  titulo: "Barrido por lotes",
  sub: "determinista · sin LLM · escribe el store",
  ficha: {
    hover: "Recorre el histórico día por día y tipifica lo que encuentra. Corre por cron, fuera de cualquier pregunta.",
    hace: "Recorre día por día las dos fuentes, aplica los umbrales y escribe un renglón por cada `(día, fuente, variable, tipo)` que encuentra. Es el único que usa el pool de escritura.",
    ayuda: "Que corra **antes** y no dentro de una pregunta es lo que hace reproducible el veredicto. Si la detección viviera en una herramienta, cada pregunta la repetiría (caro) y dos personas podrían obtener veredictos distintos del mismo día (peor). Acá el resultado está escrito: la misma pregunta da la misma respuesta.",
    archivo: "src/historico/calidad/barrido.py",
  } as Ficha,
};
