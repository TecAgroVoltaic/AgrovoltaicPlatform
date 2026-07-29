# EDA - Monitoreo AgroVoltaic SC

**Fecha del analisis:** 2026-05-22  
**Carpeta:** `Monitoreo-AgroVoltaic-SC/`  
**Total archivos:** 277 CSVs  
**Total filas (incluyendo headers):** ~185,896  
**Tamano total:** ~23.2 MB  
**Rango de fechas:** 2024-11-10 a 2026-05-21 (~19 meses, 267 dias unicos cubiertos)

---

## 1. Estructura General de los Archivos

### 1.1 Nomenclatura de archivos

Hay **dos convenciones de nombre:**

| Patron | Archivos | Rango |
|---|---|---|
| `YYYY-MM-DD.csv` (sin prefijo) | 4 | Nov 2024 |
| `Monitoreo_YYYY-MM-DD.csv` | 273 | Dic 2024 - May 2026 |

**Archivos duplicados con sufijo `(N)`:** Se encontraron 6 grupos de archivos con parentesis:
- `Monitoreo_2024-12-23(1).csv` — **duplicado exacto** (mismo MD5)
- `Monitoreo_2024-12-24(1)` a `(5)` — **NO son duplicados** (6 archivos distintos, todos de 86-87 bytes con solo 1-2 filas de datos)
- `Monitoreo_2025-05-04(1).csv` — **NO es duplicado** (368 bytes vs 24,786 bytes)
- `Monitoreo_2025-06-12(1).csv` — **NO es duplicado** (703 bytes vs 136,169 bytes)
- `Monitoreo_2025-09-05(1).csv` — **NO es duplicado** (contenido distinto)
- `Monitoreo_2025-10-01(1).csv` — **duplicado exacto** (mismo MD5)

> **Pregunta critica:** Los archivos `(N)` que NO son duplicados exactos pero tienen el mismo schema, son fragmentos de un dia? Son de otro sensor? Parecen ser descargas parciales o intentos repetidos de exportacion. Los archivos extremadamente pequenos (86-87 bytes, solo header + 1 fila) sugieren descargas fallidas o pruebas.

### 1.2 Intervalo de muestreo

El intervalo de muestreo **no es constante** y varia drasticamente entre epocas:

| Periodo | Intervalo tipico | Filas/dia tipicas |
|---|---|---|
| Dic 2024 (archivos grandes ~2MB) | **~2 segundos** | ~9,500-18,700 |
| May-Jun 2025 | **~1 minuto** | ~1,400-1,500 |
| Oct 2025 (archivos grandes ~1MB) | **~6-10 segundos** | ~6,500 |
| Nov 2025 - Feb 2026 | **~5 minutos** | ~260 |
| Mar 2026 - May 2026 | **~5 minutos** | ~155 |

> **Pregunta critica:** El cambio tan drastico en frecuencia de muestreo (de 2 seg a 5 min) sugiere cambios en la configuracion del sistema de monitoreo. Esto tiene implicaciones para cualquier analisis temporal: no se pueden comparar promedios diarios directamente sin considerar que un dia con muestreo de 2 seg tiene 50x mas puntos que uno con 5 min. Al estandarizar, hay que decidir: resamplear todo a un intervalo comun? O almacenar con el intervalo original y agregar metadata del intervalo?

Feature engineer, pero manteniendo una escala que sea faborable para ambos tipos de datos

---

## 2. Schemas Detectados

Se encontraron **13 schemas distintos** a lo largo del tiempo. Agrupados por similitud:

### Grupo A: Nombres cortos (era temprana)

#### Schema 11 — Archivos: 4 (Nov 2024)
```
vpv1, ipv1, pv1_watt, vpv2, ipv2, pv2_watt, pac_total, freq, vac1, iac1,
energia_hoy, energia_total, temp_inversor, codigo_error, irradiancia, temp1, temp2, timestamp
```
**18 columnas.** Datos de inversor + 1 sensor de irradiancia + 2 temperaturas.

#### Schema 10 — Archivos: 2 (Dic 2024-12-23)
```
+ Energìa PV1, Energìa PV2  (columnas nuevas)
```
**20 columnas.** Se agregan energias PV1/PV2. Notar: "Energìa" con acento grave (ì), no agudo (í).

#### Schema 9 — Archivos: 16 (Dic 2024 - May 2025)
```
vpv1, ipv1, pv1_watt, pac_total, freq, vac1, iac1, energia_hoy, energia_total,
temp_inversor, Energìa PV1, Energìa PV2, codigo_error, irradiancia, temp1, temp2, timestamp
```
**17 columnas.** Se PERDIERON las columnas `vpv2, ipv2, pv2_watt`. Por que? Se desconecto la cadena PV2? Se cambio a un inversor con un solo string? Los datos de `pac_total` siguen reflejando potencia que parece incluir PV2 en algunos registros.

#### Schema 13 — Archivos: 35 (May 2025 - Oct 2025)
```
vpv1, ipv1, pv1_watt, vpv2, ipv2, pv2_watt, pac_total, freq, vac1, iac1,
energia_hoy, energia_total, temp_inversor, Energìa PV1, Energìa PV2, codigo_error,
irradiancia, temp1, temp2, timestamp
```
**20 columnas.** Regresan vpv2/ipv2/pv2_watt. Se estabiliza con Energìa PV1/PV2.

#### Schema 12 — Archivos: 14 (Sep-Oct 2025)
```
Igual que Schema 13 pero: irradiancia → irradiancia_incidente
```
**20 columnas.** Renombre del sensor de irradiancia. Se empieza a distinguir que es irradiancia "incidente" (antes solo habia una).

#### Schema 1 — Archivos: 9 (Dic 2024)
```
irradiancia, temp1, temp2, timestamp
```
**4 columnas solamente.** Solo datos de sensores meteorologicos. No hay datos de inversor. Esto incluye los archivos grandes de dic 2024 (2024-12-27/28/29 con 18,000+ filas cada uno) y los archivos diminutos de 2024-12-24.

> **Pregunta critica:** Los archivos solo-sensores de Dic 2024 representan un periodo donde el inversor no estaba conectado al sistema de monitoreo? O se exportaron por separado? Los archivos de 2024-12-24 con 1-2 filas parecen pruebas del sistema.

### Grupo B: Nombres descriptivos con unidades (era intermedia/reciente)

#### Schema 5 — Archivos: 2 (Oct 2025-10-25/26)
```
Voltaje PV1 [V], Corriente PV1 [A], Potencia PV1 [W], Voltaje PV2 [V],
Corriente PV2[A], POTencia PV2 [W], Potencia total [Wac], Frecuencia,
Voltaje [Vac], Corriente [Aac], Energia hoy [Wh], Energia total [Wh],
Temperatura inversor [°C], Energìa PV1 [Wh], Energìa PV2 [Wh], codigo_error,
irradiancia_incidente, irradiancia_reflejada, albedo, temp_vertical, temp_inclinado, timestamp
```
**22 columnas.** Gran cambio: nombres largos con unidades. Se agregan **irradiancia_reflejada** y **albedo**. Las temperaturas se renombran: `temp1` → `temp_vertical`, `temp2` → `temp_inclinado`. **Errores tipograficos:** "POTencia" (mayuscula erronea), "Corriente PV2[A]" (falta espacio antes de [A]).

#### Schema 4 — Archivos: 3 (Oct 2025-10-28/29/30)
```
Igual que Schema 5 pero: POTencia → Potencia (corregido)
```
**22 columnas.** Se corrigio el typo "POTencia" pero sigue "Corriente PV2[A]" sin espacio.

#### Schema 6 — Archivos: 110 (Nov 2025 - Mar 2026) ← **El mas comun**
```
Voltaje PV1 [V], Voltaje PV2 [V], Corriente PV1 [A], Corriente PV2[A],
Potencia PV1 [W], Potencia PV2 [W], Energia hoy [Wh], Voltaje [Vac],
Corriente [Aac], temp_vertical, temp_inclinado, irradiancia_incidente,
irradiancia_reflejada, albedo, timestamp, Corriente PV2 [A],
Potencia total [VA], Energía PV1 [Wh], Energia PV2 [Wh]
```
**19 columnas.** Se PERDIERON: Frecuencia, Energia total, Temperatura inversor. El orden cambio completamente respecto a Schema 4/5. **Aparecen columnas despues de timestamp que estan casi siempre vacias** (Corriente PV2 [A], Potencia total, Energia PV1/PV2). Notar: "Corriente PV2[A]" (sin espacio, col 4) vs "Corriente PV2 [A]" (con espacio, col 16) — dos columnas para lo mismo?

#### Schema 7 — Archivos: 7 (dispersos Nov 2025 - Feb 2026)
```
Igual que Schema 6 pero: irradiancia/albedo se mueven DESPUES de timestamp
```
**19 columnas.** Mismo contenido que Schema 6 pero el orden de columnas cambia: `timestamp` se mueve antes que `irradiancia`. Esto rompe la estructura.

#### Schema 8 — Archivos: 2 (Dec 2025-12-17 y 12-19)
```
voltaje_pv1_v, voltaje_pv2_v, corriente_pv1_a, corriente_pv2_a, potencia_pv1_w,
potencia_pv2_w, energia_hoy_wh, voltaje_vac, corriente_aac, temp_vertical,
temp_inclinado, irradiancia_incidente, irradiancia_reflejada, albedo, timestamp,
corriente_pv2_a_1, potencia_total_va, energia_pv1_wh, energia_pv2_wh
```
**19 columnas.** Los mismos datos que Schema 6 pero con **nombres snake_case normalizados**. Solo aparece 2 dias y luego desaparece. Alguien intento estandarizar nombres y no se mantuvo?

### Grupo C: Schemas estables recientes

#### Schema 2 — Archivos: 56 (Mar 2026 - May 2026)
```
timestamp, Voltaje PV1 [V], Corriente PV1 [A], Potencia PV1 [W],
Voltaje PV2 [V], Corriente PV2 [A], Potencia PV2 [W], Potencia total [Wac],
Frecuencia, Voltaje [Vac], Corriente [Aac], Energia hoy [Wh],
Energia total [Wh], Temperatura inversor [C], Energia PV1 [Wh],
Energia PV2 [Wh], codigo_error, temp_vertical, temp_inclinado,
irradiancia_incidente, irradiancia_reflejada, albedo
```
**22 columnas.** El timestamp se mueve al INICIO. Regresan: Frecuencia, Energia total, Temperatura inversor. Se corrige "Corriente PV2 [A]" (con espacio). Se eliminan las columnas vacias post-timestamp de Schema 6. Este es el schema mas limpio.

#### Schema 3 — Archivos: 13 (May 2026)
```
Schema 2 + Irradiancia_incidente_SP722 [W/m2], Irradiancia_reflejada_SP722 [W/m2],
Detector_incidente_SP722 [mV], Detector_reflejado_SP722 [mV], Albedo_SP722
```
**27 columnas.** Se agrega un segundo piranometro (modelo SP722) con 5 columnas nuevas. Esto sugiere que se instalo un sensor adicional de referencia.

---

## 3. Problemas Criticos de Calidad de Datos

### 3.1 Filas de diferentes fuentes intercaladas (GRAVE)

En multiples archivos, **las filas de sensores meteorologicos y del inversor estan mezcladas** en el mismo CSV con distintas cantidades de columnas:

| Archivo ejemplo | Filas header | Filas tipo A | Filas tipo B |
|---|---|---|---|
| `Monitoreo_2024-12-25.csv` | 1 (17 cols) | 8,657 (17 cols, inversor) | 886 (4 cols, solo sensor) |
| `Monitoreo_2026-01-15.csv` | 1 (19 cols) | 139 (19 cols, inversor) | 124 (18 cols, solo sensor) |

En el archivo de Dic 2025, las filas de 4 columnas (irradiancia, temp1, temp2, timestamp) aparecen **despues** de las del inversor, sugiriendo que los datos del sensor se almacenaron despues con un timestamp distinto.

En los archivos de Nov 2025 - Feb 2026 (Schema 6), las filas de sensor tienen **3-4 valores** (irradiancia_incidente, irradiancia_reflejada, albedo, timestamp) metidos en las primeras columnas del CSV. Esto hace que:
- Columna `Voltaje PV1 [V]` contenga en realidad `irradiancia_incidente`
- Columna `Voltaje PV2 [V]` contenga `irradiancia_reflejada`  
- Columna `Corriente PV1 [A]` contenga `albedo`
- Columna `Corriente PV2[A]` contenga `timestamp`

> **Esto corrompe los datos si se leen sin separar los tipos de fila.**

En los archivos de Mar 2026+ (Schema 2 y 3) este problema desaparece: todas las filas tienen 22 o 27 columnas consistentes. El intervalo de los sensores y el inversor se alinean a 5 minutos.

### 3.2 Irradiancia con valores negativos e irreales

Los valores de irradiancia son **fisicamente imposibles en muchos registros:**

| Periodo | Valor min | Valor max | Observacion |
|---|---|---|---|
| Nov 2024 | 155.38 | 6,836.72 | 6,836 W/m2 no es real (el sol da ~1,000 max) |
| Dic 2024 | -5,826.75 | 9,050.89 | Valores negativos y ordenes de magnitud fuera de rango |
| Jun 2025 | -38.85 | 1,126.51 | -38.85 es un valor constante que aparece repetidamente |
| Oct 2025 (reflejada) | 871.76 | 15,236.89 | irradiancia reflejada > 15,000? Imposible |

El valor **-38.845008416418494** aparece constantemente como valor "nocturno" o "sin lectura" de irradiancia. Esto parece ser un **offset de calibracion no corregido** del piranometro, NO un valor real de irradiancia. Es un valor crudo del sensor sin convertir correctamente a W/m2.

> **Pregunta critica:** Los valores de irradiancia antes de Oct 2025 parecen ser **lecturas crudas del sensor** (posiblemente en mV o alguna escala no calibrada). A partir del Schema 2 (Mar 2026) cuando aparecen los campos "Detector_incidente_SP722 [mV]" se empieza a distinguir entre la lectura cruda y la irradiancia calibrada. Esto significa que los datos de irradiancia de antes de 2026 probablemente necesitan una **conversion/calibracion** antes de ser utiles.

### 3.3 Temperaturas saturadas en 85.0

En multiples periodos, los sensores de temperatura reportan **85.0** constantemente:

- `Monitoreo_2025-09-25.csv`: 1,400 de 1,401 filas con `temp2 = 85.0`
- `Monitoreo_2026-01-15.csv`: `temp_vertical = 85.0` y `temp_inclinado = 85.0`
- `Monitoreo_2025-12-17.csv`: `temp_inclinado = 85.0` constante

**85.0 es el valor de error por defecto de los sensores DS18B20** (sensores de temperatura digitales). Esto indica que los sensores estaban desconectados, danados, o con un problema de comunicacion durante esos periodos.

> **Pregunta critica:** Cuantos dias tienen temperaturas validas vs saturadas en 85? Esto determinara cuantos datos de temperatura son realmente usables.

### 3.4 Columnas vacias despues de timestamp (Schema 6)

En el Schema 6 (110 archivos, el mas comun), las 4 columnas despues de `timestamp` estan **sistematicamente vacias:**
- `Corriente PV2 [A]` (segunda instancia)
- `Potencia total [VA]`
- `Energía PV1 [Wh]`
- `Energia PV2 [Wh]`

Esto sugiere que estas columnas se agregaron al header esperando datos que nunca llegaron, o que vienen de una fuente que no estaba conectada.

### 3.5 Columnas perdidas y recuperadas

| Columna | Nov 2024 | Dic 2024-May 2025 | May-Oct 2025 | Oct 2025 | Nov 2025-Feb 2026 | Mar 2026+ |
|---|---|---|---|---|---|---|
| vpv2/ipv2/pv2_watt | Si | **NO** | Si | Si | Si | Si |
| Frecuencia | Si | Si | Si | Si | **NO** | Si |
| Energia total | Si | Si | Si | Si | **NO** | Si |
| Temp inversor | Si | Si | Si | Si | **NO** | Si |
| codigo_error | Si | Si | Si | Si | **NO** | Si |
| irradiancia_reflejada | No | No | No | **Si** | Si | Si |
| albedo | No | No | No | **Si** | Si | Si |
| SP722 (5 cols) | No | No | No | No | No | **Solo May 2026** |

> **Pregunta critica:** La desaparicion de vpv2/ipv2/pv2_watt en Dic 2024-May 2025 sugiere un cambio fisico en la instalacion. Sin embargo, `pac_total` sigue reportando valores altos, lo que podria indicar que PV2 seguia generando pero no se registraba su voltaje/corriente individualmente. O bien que `pac_total` en ese periodo solo incluye PV1.

---

## 4. Brechas Temporales

Hay **gaps significativos** sin datos:

| Desde | Hasta | Dias sin datos |
|---|---|---|
| 2024-11-12 | 2024-11-21 | 9 |
| 2024-11-21 | 2024-12-23 | 32 |
| **2024-12-29** | **2025-05-04** | **126 (4+ meses)** |
| 2025-06-26 | 2025-09-05 | 71 (2+ meses) |
| 2025-09-05 | 2025-09-22 | 17 |

Los dos gaps mas grandes (126 y 71 dias) representan periodos donde no hay **ningun** dato. Esto limita seriamente cualquier analisis de tendencias estacionales.

---

## 5. Inconsistencias en Nombres de Columnas

Las mismas variables fisicas tienen **multiples nombres** a lo largo del tiempo:

| Variable | Nombres usados |
|---|---|
| Voltaje PV1 | `vpv1`, `Voltaje PV1 [V]`, `voltaje_pv1_v` |
| Corriente PV2 | `ipv2`, `Corriente PV2[A]` (sin espacio), `Corriente PV2 [A]` (con espacio), `corriente_pv2_a` |
| Potencia PV2 | `pv2_watt`, `POTencia PV2 [W]` (typo), `Potencia PV2 [W]`, `potencia_pv2_w` |
| Potencia total | `pac_total`, `Potencia total [Wac]`, `Potencia total [VA]`, `potencia_total_va` |
| Energia hoy | `energia_hoy`, `Energia hoy [Wh]`, `energia_hoy_wh` |
| Energia PV1 | `Energìa PV1` (acento grave), `Energìa PV1 [Wh]` (grave), `Energía PV1 [Wh]` (agudo), `Energia PV1 [Wh]` (sin acento), `energia_pv1_wh` |
| Temperatura | `temp1`/`temp2`, `temp_vertical`/`temp_inclinado` |
| Irradiancia | `irradiancia`, `irradiancia_incidente`, `Irradiancia_incidente_SP722 [W/m2]` |
| Temp inversor | `temp_inversor`, `Temperatura inversor [°C]`, `Temperatura inversor [C]` |

> **Detalle: el acento en "Energia"** cambia entre grave (ì), agudo (í), y sin acento. Esto sugiere diferentes encodings o personas editando la configuracion.

---

## 6. Resumen de Fuentes de Datos

Basado en el analisis, los datos provienen de **al menos 3 fuentes:**

1. **Inversor solar** — Voltajes, corrientes, potencias (PV1, PV2, total), frecuencia, voltaje/corriente AC, energia acumulada, temperatura del inversor, codigo de error
2. **Piranometro(s) / sensor de irradiancia** — irradiancia incidente, irradiancia reflejada, albedo. Inicialmente 1 sensor, a partir de May 2026 se agrega un SP722
3. **Sensores de temperatura** — temp1/temp2 (temp_vertical/temp_inclinado). Probablemente sensores DS18B20 midiendo temperatura del panel en dos orientaciones

Estas fuentes muestrean a **intervalos distintos** y en algunos periodos se intercalan incorrectamente en un mismo CSV.

---

## 7. Propuesta de Schema Estandar para Supabase

Basado en el analisis, el schema estandar deberia cubrir el **superset** de todas las variables medidas:

```
timestamp                    TIMESTAMPTZ  -- Siempre al inicio, con timezone
-- Inversor
voltaje_pv1_v               FLOAT
corriente_pv1_a             FLOAT
potencia_pv1_w              FLOAT
voltaje_pv2_v               FLOAT
corriente_pv2_a             FLOAT
potencia_pv2_w              FLOAT
potencia_total_wac          FLOAT
frecuencia_hz               FLOAT
voltaje_vac                 FLOAT
corriente_aac               FLOAT
energia_hoy_wh              FLOAT
energia_total_wh            FLOAT
temperatura_inversor_c      FLOAT
energia_pv1_wh              FLOAT
energia_pv2_wh              FLOAT
codigo_error                INTEGER
-- Sensores de irradiancia
irradiancia_incidente       FLOAT        -- NULL para filas sin dato
irradiancia_reflejada       FLOAT        -- NULL si no disponible
albedo                      FLOAT        -- NULL si no disponible
-- SP722 (solo datos recientes)
irradiancia_incidente_sp722 FLOAT
irradiancia_reflejada_sp722 FLOAT
detector_incidente_sp722_mv FLOAT
detector_reflejado_sp722_mv FLOAT
albedo_sp722                FLOAT
-- Temperaturas ambientales
temp_vertical               FLOAT        -- NULL o filtrar 85.0
temp_inclinado              FLOAT        -- NULL o filtrar 85.0
-- Metadata
fuente_archivo              TEXT         -- Nombre del CSV original
schema_original             TEXT         -- Identificador del schema (1-13)
```

### Decisiones pendientes antes de implementar:

1. **Las filas de solo-sensor (4 cols) van en la misma tabla o en tabla separada?** Mezclarlas generaria muchos NULLs en las columnas del inversor. Separarlas complica los JOINs temporales.

2. **Que hacer con la irradiancia pre-2026?** Los valores parecen ser lecturas crudas (mV?) no calibradas. Se insertan tal cual con un flag? Se aplica una conversion? Se descartan?

3. **Que hacer con temp = 85.0?** Se insertan como NULL? Se insertan con un flag `sensor_error = true`?

4. **Que hacer con las columnas vacias post-timestamp del Schema 6?** No parecen contener datos utiles. Se ignoran.

5. **Resolucion temporal:** Se inserta cada fila tal como esta (2 seg, 1 min, 5 min segun la epoca) y se agrega un campo de metadata? O se resamplea todo a 5 minutos?

6. **Filas duplicadas del mismo timestamp?** En los archivos con muestreo de 2 segundos, puede haber timestamps duplicados de diferentes fuentes. Como se resuelven?

---

## 8. Mapa de Schemas por Periodo

```
Nov 2024          [Schema 11] 18 cols, nombres cortos, 4 archivos
Dic 2024          [Schema 10] 20 cols, +Energia PV1/PV2, 2 archivos
                  [Schema 1]  4 cols, solo sensores, 9 archivos
                  [Schema 9]  17 cols, sin PV2, 1 archivo
Ene-Abr 2025      --- SIN DATOS (126 dias) ---
May 2025          [Schema 9]  17 cols, sin PV2, 15 archivos
May-Jun 2025      [Schema 13] 20 cols, PV2 regresa, 35 archivos
Jul-Ago 2025      --- SIN DATOS (71 dias) ---
Sep 2025          [Schema 12] 20 cols, irradiancia_incidente, 14 archivos
Oct 2025          [Schema 13] 20 cols (retrocede a irradiancia), 8 archivos
                  [Schema 5]  22 cols, nombres largos + typo, 2 archivos
                  [Schema 4]  22 cols, typo corregido, 3 archivos
Nov 2025-Mar 2026 [Schema 6]  19 cols, reordenado, 110 archivos
                  [Schema 7]  19 cols, orden distinto, 7 archivos
                  [Schema 8]  19 cols, snake_case, 2 archivos
Mar-May 2026      [Schema 2]  22 cols, estable, 56 archivos
May 2026          [Schema 3]  27 cols, +SP722, 13 archivos
```

---

## 9. Conclusiones y Preguntas Abiertas

### Lo que sabemos:
- Los datos vienen de un sistema agrovoltaico con un inversor de dos cadenas (PV1 y PV2), al menos un piranometro, y sensores de temperatura
- El sistema de monitoreo ha evolucionado significativamente: los nombres, las columnas, el intervalo de muestreo y los sensores han cambiado multiples veces
- Los datos mas recientes (Mar 2026+) son los mas limpios y consistentes
- Hay ~23 MB de datos en total, con ~186K filas

### Lo que NO sabemos y deberiamos confirmar:
1. **Que sensor de irradiancia se uso antes de Oct 2025?** Los valores parecen no estar calibrados. Sin saber el modelo y factor de conversion, esos datos podrian no ser usables
2. **Por que desaparecen PV2 en Dic 2024 - May 2025?** Cambio fisico? Bug del software?
3. **Los "archivos duplicados" con distinto contenido — son de sensores distintos?** Por ejemplo, `Monitoreo_2025-05-04.csv` (24KB) vs `Monitoreo_2025-05-04(1).csv` (368 bytes)
4. **Que timezone usan los timestamps?** No hay indicador de zona horaria. Es hora local? UTC?
5. **Los 85.0 en temperatura — desde cuando empezo a fallar el sensor y se reemplazo?**
6. **El cambio de "Potencia total [Wac]" a "Potencia total [VA]" — es intencional?** Wac y VA no son lo mismo (Wac = potencia activa, VA = potencia aparente)
