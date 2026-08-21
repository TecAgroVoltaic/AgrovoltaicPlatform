// Catálogo de la vista «Los datos»: la PROSA y la GEOMETRÍA del recorrido ETL.
//
// Diferencia importante con `arquitectura/catalogo.ts`: aquella vista se dibuja
// con lo que el servicio publica en vivo, así que no puede mentir. Esta NO tiene
// esa red. El servicio del pronóstico solo lee `lecturas_ambientales_sc`; las
// tablas fotovoltaicas (`monitoreo_sc_electrico`, `radiacion_sc_15s`) no pasan
// por él, así que ningún endpoint puede reportar estas cifras.
//
// La consecuencia se asume de frente en vez de disimularse: los números son un
// CORTE FECHADO, la fecha está a la vista en la pantalla (ver `CORRIDA`), y quien
// los lea sabe que está viendo una foto y no un termómetro. Un número sin fecha
// habría envejecido en silencio, que es exactamente lo que esta consola no puede
// permitirse.
//
// Verificados con SELECT contra la base viva el 2026-08-20.
import type { Ficha } from "@/app/components/console/arquitectura/catalogo";

/** Cuándo se corrió el ETL y cuándo se verificaron estas cifras contra la base. */
export const CORRIDA = { ejecutado: "2026-08-10", verificado: "2026-08-20" };

// ── Geometría del lienzo ───────────────────────────────────────────────────
// Cinco columnas, una por etapa. El recorrido se lee de izquierda a derecha,
// que es como se lee un pipeline.
export const LIENZO_D = { w: 1140, margenInferior: 30 };
export const COL_D = { csv: 16, extract: 245, transform: 460, load: 675, tabla: 890 };
export const ANCHO_D = { csv: 200, etapa: 186, tabla: 234 };

export type GrupoDato = "fuente" | "etapa" | "tabla" | "vista";

export type NodoDato = {
  id: string;
  grupo: GrupoDato;
  x: number; y: number; w: number; h: number;
  titulo: string;
  sub: string;
  ficha: Ficha;
};

export const NODOS_DATOS: NodoDato[] = [
  // ── La fuente ────────────────────────────────────────────────────────────
  {
    id: "csv", grupo: "fuente", x: COL_D.csv, y: 76, w: ANCHO_D.csv, h: 74,
    titulo: "285 archivos CSV",
    sub: "13 esquemas · nov-2024 a jun-2026",
    ficha: {
      hover: "Los datos crudos tal como los deja el datalogger: 285 CSV con 13 esquemas distintos y siete clases de problemas.",
      hace: "Es la entrada: 19 meses de descargas del sitio agrovoltaico, un archivo por día. Nadie los normalizó nunca, así que llegan como los dejó cada versión del datalogger.",
      ayuda: "Nada de lo que sigue se entiende sin ver de dónde se parte. **No hay un estándar de datos**: la misma variable aparece como `vpv1`, `Voltaje PV1 [V]` y `voltaje_pv1_v` según el mes, y hay filas de dos sensores distintos intercaladas en el mismo archivo. Ese es el problema que el pipeline existe para resolver.",
      puntos: [
        "**13 esquemas distintos**: las columnas aparecen, desaparecen y cambian de nombre entre archivos.",
        "**Typos que sobreviven en el header**: `Energì` con acento grave en 72 archivos, `POTencia` en 2, `Corriente PV2[A]` sin espacio en 5.",
        "**Cadencia variable**: ~2 s en dic-2024, ~1 min en may-2025, ~5 min desde nov-2025.",
        "**Dos huecos largos**: 126 días (dic-2024 → may-2025) y 71 días (jun → sep-2025). No se rellenan con datos sintéticos.",
      ],
      archivo: "dataset/Monitoreo-AgroVoltaic-SC-NEW/",
    },
  },

  // ── Extract ──────────────────────────────────────────────────────────────
  {
    id: "extract", grupo: "etapa", x: COL_D.extract, y: 76, w: ANCHO_D.etapa, h: 74,
    titulo: "extract",
    sub: "colapsa ~70 nombres a uno",
    ficha: {
      hover: "Lee cada CSV tolerando filas rotas y normaliza los nombres de columna: ~70 variantes crudas colapsan a un nombre canónico por concepto.",
      hace: "Lee el CSV aunque tenga filas con distinto número de columnas, normaliza cada encabezado y tipa los valores a numérico con el timestamp parseado.",
      ayuda: "Es lo que hace que el pipeline **no haya que reescribirlo cada vez que cambia el datalogger**. `slugify()` quita acentos, unidades, mayúsculas y puntuación, así que las ~70 formas de escribir lo mismo colapsan solas: `Energìa [Wh]`, `energia_hoy_wh` y `Energía Hoy` terminan en el mismo lugar sin que nadie las enumere. Solo la leyenda de conceptos se declara a mano, una entrada por concepto y no por variante.",
      puntos: [
        "**Cero columnas quemadas.** La única fuente irreducible es `CONCEPT_MAP`; de ahí se derivan las columnas canónicas, las etiquetas, el método de resampleo y hasta el DDL SQL.",
        "Una **columna nueva** cuesta una línea. Una **ortografía nueva** del mismo concepto no cuesta nada: la reconoce `slugify`.",
        "Las filas rotas (de los 8 archivos con lecturas mezcladas de dos sensores) se saltan y se loguean, no revientan el parser.",
      ],
      archivo: "src/agrovoltaic/extract.py · normalize.py",
    },
  },

  // ── Transform ────────────────────────────────────────────────────────────
  {
    id: "transform", grupo: "etapa", x: COL_D.transform, y: 76, w: ANCHO_D.etapa, h: 74,
    titulo: "transform",
    sub: "parte en dos · 5 min y 15 s",
    ficha: {
      hover: "Separa cada archivo en dos flujos por fuente física y los lleva a su cadencia oficial. NO limpia nada: el crudo se conserva.",
      hace: "Separa cada archivo en dos flujos según de qué sensor viene cada columna (eléctrico y radiación) y los reagrupa a su cadencia oficial: 5 min el eléctrico, 15 s la radiación.",
      ayuda: "Resuelve el problema de que **un mismo archivo mezcla dos sensores que muestrean distinto**. Antes iban a una sola tabla ancha y la radiación quedaba diluida en la cadencia del inversor; ahora cada fuente vive en su tabla, a su ritmo, y se puede consultar sin arrastrar columnas vacías de la otra.\n\nLo que **no** hace es igual de importante: no anula ni recorta ningún valor. El crudo entra tal cual.",
      puntos: [
        "**Radiación a 15 s, no a 10.** ThingSpeak no admite intervalos menores; los muestreos por debajo de 10 s eran pruebas y se promedian.",
        "El resampleo distingue **tasas de acumuladores**: promedio para potencia e irradiancia, último valor para la energía acumulada. Promediar un acumulador daría un número sin significado físico.",
        "Cada fila guarda su trazabilidad: `n_muestras`, `intervalo_original_seg` y `fuente_archivo`.",
      ],
      archivo: "src/agrovoltaic/transform.py",
    },
  },

  // ── Load ─────────────────────────────────────────────────────────────────
  {
    id: "load", grupo: "etapa", x: COL_D.load, y: 76, w: ANCHO_D.etapa, h: 74,
    titulo: "load",
    sub: "UPSERT por timestamp",
    ficha: {
      hover: "Inserta con ON CONFLICT DO UPDATE sobre la PK timestamp, y salta los CSV cuyo md5 no cambió. Reprocesar nunca duplica.",
      hace: "Inserta cada flujo en su tabla con `ON CONFLICT DO UPDATE` sobre la clave primaria `timestamp`, y lleva un registro del md5 de cada archivo ya procesado.",
      ayuda: "Es lo que convierte esto en un **proceso permanente y no en un script de una sola vez**. Correrlo dos veces da el mismo resultado que correrlo una: agregar datos nuevos es soltar el CSV en la carpeta y volver a correr, sin borrar nada ni preocuparse por duplicar. Sin esta propiedad, cada actualización sería una intervención manual con riesgo de romper lo que ya estaba.",
      puntos: [
        "**Idempotente en dos niveles.** Por archivo: el md5 en `_ingest_log` salta los CSV sin cambios (hoy tiene las 285 entradas). Por fila: la PK `timestamp` más `ON CONFLICT DO UPDATE`.",
        "Un archivo malo **no frena el resto**: se loguea y el pipeline sigue.",
        "«Reprocesar todo» hace TRUNCATE y recarga limpia, para cuando cambia una regla y hay que rehacer la base entera.",
      ],
      archivo: "src/agrovoltaic/load.py · state.py",
    },
  },

  // ── Tablas crudas ────────────────────────────────────────────────────────
  {
    id: "crudo", grupo: "tabla", x: COL_D.tabla, y: 62, w: ANCHO_D.tabla, h: 100,
    titulo: "2 tablas crudas",
    sub: "36.469 eléctricas · 94.868 radiación",
    ficha: {
      hover: "El dato del sensor tal cual, sin una sola corrección. Es la regla rectora del modelo: lo que se guarda es lo que midió el aparato.",
      hace: "Guardan el valor del sensor **exactamente como llegó**, incluidos los valores imposibles: las temperaturas en 85 °C, el pico de 26,5 MW y la irradiancia negativa están ahí adentro.",
      ayuda: "Esta es **la decisión de diseño más importante de todo el modelo**, y es contraintuitiva: guardar la basura a propósito. La razón es que una corrección es una hipótesis, y las hipótesis cambian. Si el 85 °C se hubiera convertido en NULL al cargar, hoy no habría forma de saber cuántas veces falló el sensor ni de revisar el criterio cuando aparezca uno mejor. El dato original no se puede reconstruir; una vista sí se puede reescribir en una tarde.\n\nValidada con Leo Cardinale el 2026-08-10. Superó las decisiones previas de `85 → NULL`, `offset → 0` y «resamplear todo a 5 minutos».",
      puntos: [
        "`monitoreo_sc_electrico`: 1 fila = una ventana de 5 min del inversor y los DS18B20.",
        "`radiacion_sc_15s`: tabla aparte a 15 s, porque el piranómetro muestrea mucho más rápido y meterlo en la cadencia del inversor perdía información.",
        "Ambas con PK `timestamp` y metadata de trazabilidad por fila.",
        "**RLS habilitado sin políticas** en las 9 tablas públicas: solo los roles de servicio entran, la API REST pública queda bloqueada.",
      ],
      archivo: "sql/schema.sql",
    },
  },

  // ── Capa de vistas ───────────────────────────────────────────────────────
  {
    id: "vistas", grupo: "vista", x: COL_D.tabla, y: 196, w: ANCHO_D.tabla, h: 116,
    titulo: "4 vistas de análisis",
    sub: "corrección · calibración · PR",
    ficha: {
      hover: "Donde vive la corrección. Cada regla es una columna nueva calculada en SQL sobre el crudo, nunca una escritura sobre él.",
      hace: "Aplican en SQL, sobre el crudo y sin tocarlo, las tres capas de corrección: rangos físicos válidos, calibración de la irradiancia contra el cielo despejado, y el Performance Ratio por arreglo.",
      ayuda: "Es la otra mitad de la regla rectora: el crudo queda intacto **y aun así se consulta dato limpio**. Cambiar un umbral es reescribir una vista, no recargar 130.000 filas. Y como cada corrección es una columna con nombre propio, siempre se puede comparar el valor corregido contra el original en la misma consulta, que es lo que hace auditable el criterio.",
      puntos: [
        "`v_sc_electrico_corregido`: temperatura fuera de **10 a 80 °C** → NULL (reemplaza el −10 a 60 de AgroDash); potencia fuera de 0 a 5.000 W; y los rangos de voltaje, corriente y frecuencia.",
        "`v_sc_radiacion_corregida`: el offset nocturno −38,845 y los negativos → 0; y **toda la irradiancia anterior al 2025-07-01 → NULL**, porque el error de medición se corrigió a mediados de 2025.",
        "`v_sc_radiacion_calibrada`: W/m² más kt\\* contra el clear-sky de pvlib, con bandera de control de calidad.",
        "`v_sc_performance`: el Performance Ratio por arreglo, con modelo bifacial de dos planos.",
        "Todas con `security_invoker = on`, para que la vista no eluda los permisos de quien la consulta.",
      ],
      archivo: "sql/schema.sql · src/agrovoltaic/ddl.py",
    },
  },
];

// ── Antes y después, medido ────────────────────────────────────────────────
/** Cada fila: qué se mira, cuánto daba en crudo, cuánto tras la capa de vistas. */
export const ANTES_DESPUES: { que: string; crudo: string; corregido: string; nota: string }[] = [
  {
    que: "Pico de potencia del string PV1",
    crudo: "26.503.163 W",
    corregido: "1.603 W",
    nota: "26,5 MW en un arreglo de 1.420 Wp: **18.664 veces** lo instalado.",
  },
  {
    que: "Pico de potencia AC total",
    crudo: "118.634 W",
    corregido: "2.157 W",
    nota: "El sistema entero son 2.840 Wp. Todo lo que pase de ahí es ruido.",
  },
  {
    que: "Filas con temperatura en 85,0 °C",
    crudo: "12.174",
    corregido: "0",
    nota: "85,0 es el valor que devuelve un DS18B20 con falso contacto, no una lectura.",
  },
  {
    que: "Rango de temperatura del panel",
    crudo: "0,0 a 127,9 °C",
    corregido: "15,3 a 79,8 °C",
    nota: "Dentro del rango físico que fijó Leo Cardinale: 10 a 80 °C.",
  },
  {
    que: "Filas con irradiancia negativa",
    crudo: "14.888",
    corregido: "0",
    nota: "El mínimo crudo era **−15.538**. El offset nocturno −38,845 aparece exacto en 3.198 filas.",
  },
  {
    que: "Irradiancia anterior a jul-2025",
    crudo: "se conserva cruda",
    corregido: "37.825 filas marcadas no válidas",
    nota: "El error de medición se corrigió a mediados de 2025; antes de eso el dato no sirve.",
  },
];

/** Lo que se ganó al calibrar, que no tiene columna «antes» porque antes no existía. */
export const GANANCIAS: { que: string; valor: string; nota: string }[] = [
  {
    que: "Máximo de irradiancia calibrada",
    valor: "1.340 W/m²",
    nota: "Físicamente posible para el sitio. Antes de calibrar, el número no tenía unidad.",
  },
  {
    que: "Lecturas que pasan control de calidad",
    valor: "99,0 %",
    nota: "Sobre el período válido, contra el techo de cielo despejado de pvlib.",
  },
  {
    que: "kt\\* en el percentil 95",
    valor: "1,00",
    nota: "La fracción de claridad se queda pegada a 1 y no lo pasa: la calibración es correcta.",
  },
  {
    que: "Performance Ratio energético",
    valor: "PV1 = 0,621 · PV2 = 0,626",
    nota: "**Convergen**, y eso valida el modelo bifacial: comparten paneles, inversor y sitio.",
  },
];

// ── Las siete inconsistencias del crudo ────────────────────────────────────
export const INCONSISTENCIAS: { n: number; que: string; evidencia: string }[] = [
  { n: 1, que: "13 esquemas distintos", evidencia: "La misma variable como `vpv1`, `Voltaje PV1 [V]` o `voltaje_pv1_v` según el mes." },
  { n: 2, que: "Filas de dos sensores mezcladas", evidencia: "8 archivos donde la irradiancia cae en la columna «Voltaje PV1». Es el problema más grave y el único a medio resolver." },
  { n: 3, que: "Irradiancia sin calibrar", evidencia: "Offset −38,845 en 205 archivos; mínimos hasta −15.538; las columnas del SP722 casi siempre vacías." },
  { n: 4, que: "Temperaturas saturadas en 85 °C", evidencia: "En 137 archivos. Es el código de error del DS18B20 desconectado, no una medición." },
  { n: 5, que: "Cadencia de muestreo variable", evidencia: "~2 s en dic-2024, ~1 min en may-2025, ~5 min desde nov-2025." },
  { n: 6, que: "Huecos temporales largos", evidencia: "126 días (dic-2024 → may-2025) y 71 días (jun → sep-2025). No se rellenan con datos sintéticos." },
  { n: 7, que: "Duplicados y fragmentos", evidencia: "2 archivos idénticos por MD5 y varios fragmentos de 86 bytes con nombre `(N)`." },
];
