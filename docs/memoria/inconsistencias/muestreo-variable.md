---
name: muestreo-variable
description: El intervalo de muestreo cambia entre épocas (2 s en dic-2024 hasta 5 min en 2026). Medido en producción el 2026-08-28: solo oct-2025 está de verdad a 15 s, y `intervalo_original_seg` NO es la cadencia del dato guardado. Incluye el criterio implementado (moda de los saltos vecinos) y la corrección de la afirmación de los 1.018 huecos
categoria: inconsistencia
actualizado: 2026-08-28
---

# Intervalo de muestreo variable

El intervalo no es constante y varía drásticamente entre épocas. Lo que sigue es la cadencia
**de los CSV**; la cadencia de lo que quedó **guardado en la base** es otra cosa y se mide abajo:

| Período | Intervalo | Filas/día |
|---|---|---|
| Dic 2024 | ~2 s | ~9.500–18.700 |
| May-Jun 2025 | ~1 min | ~1.400–1.500 |
| Oct 2025 | ~6–10 s | ~6.500 |
| Nov 2025+ | ~5 min | ~155–260 |

**Evidencia en NEW (2026-06-01):** dic-2024 ~18.500 filas/día vs archivos nuevos ~155 filas/día.

Decisión previa (SUPERADA): resamplear **todo** a 5 min.

> **Respuesta oficial de Leo (2026-08-10, [[respuestas-leo-cardinale]] · P8):** los tiempos de
> muestreo están definidos en la metodología del equipo:
> - **Variables eléctricas (producción) → 5 min.**
> - **Radiación → 15 s** (originalmente 10 s; se subió a 15 s porque **ThingSpeak** no permite
>   muestreos <15 s). Va en una **base de datos / tabla aparte** para aprovecharla cuando haga falta.
> - Muestreos **<10 s** = etapas de prueba → conservar o promediar a 15 s (como deberían estar los
>   más recientes).
>
> ⚠️ Resamplear la radiación a 5 min **destruiría** la granularidad de 15 s que Leo quiere preservar.

## La cadencia REAL en la base (medido en producción, 2026-08-28)

Moda del intervalo entre filas consecutivas, por mes, en `radiacion_sc_15s` (consulta directa a
la Supabase de producción, no supuesto):

| Mes | Moda del salto real |
|---|---|
| 2024-11 | 302 s |
| 2024-12 | 2 s |
| 2025-05 | 62 s |
| 2025-06 | 31 s |
| 2025-09 | 62 s |
| **2025-10** | **15 s** |
| 2025-11 a 2026-02 | 315 s |
| 2026-03 a 2026-06 | 300 s |

**Octubre 2025 es el único mes que está de verdad a 15 s.** El nombre `radiacion_sc_15s` es el
objetivo de resampleo que fijó Leo, no una descripción de lo que la tabla contiene (esto ya lo
había visto el barrido de calidad del 24-ago, ver [[agente-historico-calidad]]).

## `intervalo_original_seg` NO es la cadencia del dato guardado

Afirmación que la memoria daba por buena y **es falsa**, verificada contra producción el
**2026-08-28**:

- **`monitoreo_sc_electrico` está remuestreado a 5 min UNIFORMES.** **35.101 de 36.468** saltos
  entre filas consecutivas son exactamente **300 s**, mientras `intervalo_original_seg` en esas
  mismas filas va de **2 a 330 s**. Esa columna guarda la cadencia del **CSV de origen**, no la
  del dato almacenado: usarla como peso de integración le pone 315 s a una fila que cubre 300.
- **`radiacion_sc_15s` sí es heterogénea de verdad**: los saltos reales son 15, 30, 45, 60, 75,
  300, 315 y 330 s según la época.

**Regla adoptada, y vale para las dos tablas:**

1. **Para integrar** (energía, irradiación, cualquier magnitud por tiempo): el peso de cada fila
   es el **salto real al siguiente registro**, acotado a un techo de **900 s**. Sin techo, el
   salto nocturno de **43.800 s** se integraría como doce horas de generación. El salto real no
   puede mentir sobre lo que la fila cubre; el metadato sí.
2. **Para medir completitud**: la cadencia de referencia es la **moda de los saltos reales del
   período**, no una constante ni `intervalo_original_seg`, y hay que **exponer en la salida cuál
   se usó**. Sin eso, dos períodos con completitud 0,9 pueden estar midiendo contra objetivos que
   difieren en dos órdenes de magnitud y nadie lo nota. Ese error ya se pagó: la completitud
   eléctrica de nov-2025 a jun-2026 daba **0,05** con cadencia nominal fija y da **0,84 a 1,02**
   con la moda medida ([[gaps-temporales]]).
3. `intervalo_original_seg` queda **solo como trazabilidad** del origen: con qué cadencia se tomó
   el CSV, y detección de `cambio_de_cadencia`.

## Cómo quedó implementado el criterio (2026-08-28) y qué se dijo mal por el camino

`calidad/pruebas/cadencia.py` **priorizaba `intervalo_original_seg`** sobre la cadencia
observada, o sea que la prueba de consistencia temporal medía contra el metadato. Se cambió por
una cascada:

1. **Moda de los saltos VECINOS de cada muestra** (ventana local de 11 saltos).
2. Si no alcanza, **moda del día**.
3. Si no alcanza, **moda de la serie**.
4. El metadato **solo como desempate**, cuando el dato no da para inferir. Ese caso existe: una
   serie de dos muestras tiene un único salto, y la moda de un solo salto es ese mismo salto, así
   que la moda no aporta información y hay que caer en algo.

La ventana local es lo que permite que una serie que cambió de cadencia a mitad de período no
quede medida contra un promedio que no existió nunca.

### Corrección de una afirmación previa: los 1.018 huecos de una fila

Durante la misma sesión del 2026-08-28 se afirmó que **el metadato ocultaba 1.018 huecos de una
fila**. **Es impreciso, y queda corregido acá** para que la memoria no cargue dos verdades.

Al probarlo: un hueco de exactamente **600 s** contra una referencia de **300 s** cae justo en
**2×**, y el doc pide intervalos **"mayores a dos veces"** la tasa de muestreo
([[pruebas-calidad-umbrales]], familia 3). O sea que **ninguno de los dos criterios los ve**, ni
el declarado ni el medido. Quien sí los detecta es `completitud.timestamps_faltantes`, que cuenta
**muestras faltantes** en vez de mirar el tamaño del salto. Son dos preguntas distintas, y esa es
la que corresponde a este caso.

### El beneficio real es el opuesto, y mucho mayor

Medido sobre la tabla principal:

| Criterio de referencia | Saltos marcados como intervalo excesivo |
|---|---|
| Cadencia **declarada** (`intervalo_original_seg`) | **8.756** |
| Cadencia **medida** (moda de los saltos) | **65** |

Los **8.691 de diferencia son pasos normales de 300 s marcados como hueco** porque el CSV de
origen iba a 62 s (2 × 62 = 124 s, y 300 > 124). Es **uno de cada cuatro pasos** de la tabla
principal reportado como un problema que no existe.

Y en sentido contrario **no se pierde nada**: cero saltos que el criterio declarado detecte y el
medido no. La cadencia medida no es un criterio más laxo, es el correcto.

Relacionado: [[decisiones]], [[respuestas-leo-cardinale]], [[gaps-temporales]],
[[pruebas-calidad-umbrales]], [[agente-historico-calidad]], [[verificacion-numeros]],
[[silencio-leido-como-salud]], [[capa-analitica]], [[store-hallazgos-calidad]],
[[emparejamiento-por-timestamp]].
