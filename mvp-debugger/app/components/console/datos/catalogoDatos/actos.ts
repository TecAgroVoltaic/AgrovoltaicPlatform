// Los cinco actos del recorrido, con muestras reales del dato.
import type { Acto } from "./recorrido";

export const ACTOS: Acto[] = [
  {
    n: 1, id: "llega", zona: "cargar",
    titulo: "Llega el crudo",
    gesto: "285 archivos · 13 esquemas",
    muestra: {
      tipo: "archivos",
      filas: [
        ["dic-2024", "vpv1"],
        ["may-2025", "Voltaje PV1 [V]"],
        ["jun-2026", "voltaje_pv1_v"],
      ],
    },
    porque: "Nadie fijó un estándar: cada versión del datalogger escribió distinto.",
    ficha: {
      hover: "19 meses de descargas, un archivo por día, con 13 esquemas distintos y la misma variable escrita de tres formas.",
      hace: "19 meses de descargas del sitio, un archivo por día, como los dejó cada versión del datalogger.",
      ayuda: "Es el punto de partida: **no hay un estándar de datos**. Sin ver esto, los once tratamientos de abajo parecen burocracia.",
      puntos: [
        "**13 esquemas**: las columnas aparecen, desaparecen y cambian de nombre entre archivos.",
        "**Typos en el header**: `Energì` en 72 archivos, `POTencia` en 2, `Corriente PV2[A]` en 5.",
        "**Dos huecos largos**: 126 y 71 días sin dato.",
      ],
      archivo: "dataset/Monitoreo-AgroVoltaic-SC-NEW/",
    },
  },
  {
    n: 2, id: "unifica", zona: "cargar",
    titulo: "Se unifica el nombre",
    gesto: "~70 variantes → 1 por concepto",
    muestra: {
      tipo: "convergencia",
      desde: ["vpv1", "Voltaje PV1 [V]", "voltaje_pv1_v"],
      hasta: "voltaje_pv1_v",
    },
    porque: "Se colapsan solas quitando acentos, unidades y mayúsculas. Sin lista que mantener.",
    ficha: {
      hover: "slugify() quita acentos, unidades y mayúsculas, así que las ~70 formas de escribir lo mismo caen solas en un nombre canónico.",
      hace: "Lee el CSV aunque traiga filas rotas, normaliza cada encabezado y tipa los valores.",
      ayuda: "Es lo que evita reescribir el pipeline cada vez que cambia el datalogger: `Energìa [Wh]`, `energia_hoy_wh` y `Energía Hoy` caen solas en el mismo lugar, sin enumerarlas.",
      puntos: [
        "**Cero columnas quemadas.** De `CONCEPT_MAP` se derivan las columnas, las etiquetas, el resampleo y el DDL.",
        "Columna nueva = una línea. Ortografía nueva del mismo concepto = nada.",
      ],
      archivo: "src/agrovoltaic/extract.py · normalize.py",
    },
  },
  {
    n: 3, id: "guarda", zona: "cargar",
    titulo: "Se guarda tal cual",
    gesto: "2 tablas · eléctrico 5 min · radiación 15 s",
    muestra: {
      tipo: "valores", estado: "crudo",
      encabezado: "lo imposible entra igual",
      filas: [
        ["temp_inclinado", "85,0 °C"],
        ["potencia_pv1_w", "26.503.163 W"],
        ["irradiancia", "−15.538"],
      ],
    },
    porque: "Una corrección es una hipótesis, y las hipótesis cambian. El crudo no se reconstruye.",
    ficha: {
      hover: "El valor del sensor entra exactamente como llegó, valores imposibles incluidos. Es la decisión que ordena todo el modelo.",
      hace: "Guardan el valor **exactamente como llegó**, valores imposibles incluidos: el 85 °C, el pico de 26,5 MW y la irradiancia negativa están ahí adentro.",
      ayuda: "Guardar la basura a propósito es contraintuitivo, y es la decisión más importante del modelo. Si el 85 °C se hubiera vuelto NULL al cargar, hoy no habría cómo contar cuántas veces falló el sensor. El crudo no se reconstruye; una vista se reescribe en una tarde.",
      puntos: [
        "`monitoreo_sc_electrico` (5 min) y `radiacion_sc_15s` (15 s), cada una con PK `timestamp`.",
        "Antes de guardar se separa por sensor: el inversor y el piranómetro venían mezclados en el mismo archivo.",
        "**RLS sin políticas** en las 9 tablas: solo entran los roles de servicio.",
      ],
      archivo: "src/agrovoltaic/transform.py · load.py · sql/schema.sql",
    },
  },
  {
    n: 4, id: "corrige", zona: "consultar",
    titulo: "Se corrige al leer",
    gesto: "vistas SQL sobre el crudo",
    muestra: {
      tipo: "valores", estado: "corregido",
      encabezado: "las mismas tres filas",
      filas: [
        ["temp_inclinado", "NULL"],
        ["potencia_pv1_w", "NULL"],
        ["irradiancia", "0"],
      ],
    },
    porque: "Cambiar un umbral es reescribir una vista, no recargar 130.000 filas.",
    ficha: {
      hover: "Rangos físicos, el 85 °C y el offset se resuelven en SQL, al consultar, sin tocar el crudo.",
      hace: "Aplican en SQL, sobre el crudo y sin tocarlo, los tratamientos 4 a 8: temperatura fuera de 10 a 80 °C, potencia fuera de 0 a 5.000 W, el offset −38,845 y los negativos.",
      ayuda: "La otra mitad de la regla: el crudo queda intacto **y aun así se consulta dato limpio**. Y como cada corrección es una columna con nombre propio, el valor corregido se puede comparar contra el original en la misma consulta.",
      puntos: [
        "`v_sc_electrico_corregido`: temperatura, potencia, voltaje, corriente y frecuencia.",
        "`v_sc_radiacion_corregida`: offset y negativos a 0; la irradiancia anterior a jul-2025 se marca no válida.",
        "Con `security_invoker = on`: la vista no elude los permisos de quien consulta.",
      ],
      archivo: "sql/schema.sql · src/agrovoltaic/ddl.py",
    },
  },
  {
    n: 5, id: "calibra", zona: "consultar",
    titulo: "Se calibra y se evalúa",
    gesto: "W/m² · kt* · Performance Ratio",
    muestra: {
      tipo: "valores", estado: "corregido",
      encabezado: "recién acá significa algo",
      filas: [
        ["irradiancia", "734 W/m²"],
        ["kt* (claridad)", "0,61"],
        ["PR del arreglo", "0,621"],
      ],
    },
    porque: "No hay constante de fábrica: se calibra contra el cielo despejado modelado.",
    ficha: {
      hover: "La irradiancia pasa a W/m² contra el cielo despejado de pvlib, y de ahí salen kt* y el Performance Ratio por arreglo.",
      hace: "Convierten la irradiancia a W/m² contra el techo de cielo despejado (pvlib), derivan la fracción de claridad kt\\* y el Performance Ratio de cada arreglo.",
      ayuda: "Es lo que convierte un número sin unidad en una medición. Sin esto no había forma de saber si una lectura era plausible, ni de calcular rendimiento: la geometría del sistema estuvo bloqueada hasta que Leo la confirmó.",
      puntos: [
        "`v_sc_radiacion_calibrada`: W/m², kt\\* y bandera de calidad. **99,0 %** pasa QC, kt\\* p95 = 1,00.",
        "`v_sc_performance`: **PV1 = 0,621 · PV2 = 0,626**. Convergen, y eso valida el modelo bifacial.",
        "«Celda calibrada» es el nombre comercial del sensor, no quiere decir que el dato venga escalado (Leo P11).",
      ],
      archivo: "src/agrovoltaic/clearsky.py · performance.py",
    },
  },
];
