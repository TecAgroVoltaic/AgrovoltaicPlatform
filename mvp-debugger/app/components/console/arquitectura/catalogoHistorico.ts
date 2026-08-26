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
