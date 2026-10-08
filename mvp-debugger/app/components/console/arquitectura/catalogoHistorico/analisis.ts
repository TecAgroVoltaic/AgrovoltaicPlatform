// Fichas de la familia ANÁLISIS del Agente Histórico: qué pasó. Trabajan
// sobre las vistas corregidas, no sobre el crudo.
import type { Ficha } from "../catalogo";

export const HERRAMIENTAS_ANALISIS: Record<string, Ficha> = {
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
  rangos_con_datos: {
    resumen: "qué fechas tienen datos",
    hover: "Tramos contiguos con datos, los últimos N días con datos y el día con datos más cercano a una fecha.",
    hace: "Dice qué fechas tienen datos: tramos contiguos, los últimos N días con datos y el día más cercano a una fecha pedida.",
    ayuda: "Es la que deja al agente ir un paso adelante: ante «el 12 de agosto» (un día vacío) o «la última semana», en vez de disculparse **propone el día o el tramo con datos más cercano**. Lee la misma cobertura que el calendario de la consola y devuelve tramos, nunca la lista de ~330 días, así que preguntar no cuesta tokens.",
    limites: [
      "Un día cuenta si grabó al menos una lectura de la fuente: no dice si el día está completo. Eso lo mide `completitud_datos`.",
    ],
    archivo: "tools/rangos_con_datos.py",
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
  exportar_datos: {
    resumen: "prepara una descarga",
    hover: "Arma la descarga csv/dat/mat de una tabla y un rango, con las filas estimadas.",
    hace: "Prepara una descarga csv/dat/mat de una tabla y rango, estimando filas; el archivo lo sirve el mismo endpoint que Descargas.",
    ayuda: "La herramienta **no genera el archivo**: valida con las mismas funciones que `GET /datos/exportar` y devuelve la URL de ese endpoint. Así lo que baja el chat es byte a byte lo que baja la vista Descargas, y el modelo nunca ve el contenido.",
    archivo: "tools/exportar_datos.py",
  },
};
