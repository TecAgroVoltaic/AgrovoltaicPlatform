---
name: decisiones
description: Decisiones tomadas sobre limpieza (resampleo 5min, 85→NULL, offset→0, gaps, duplicados, schema destino)
categoria: decision
---

# Decisiones tomadas

> **⚠️ Actualización 2026-08-10 — Leo Cardinale validó el tratamiento** (doc rev LCV,
> [[respuestas-leo-cardinale]]). Varias decisiones de abajo quedan **SUPERADAS**: la línea
> rectora ahora es **guardar el crudo en la base y corregir en una capa de análisis** (no
> transformar in-place). Ver la sección [Decisiones validadas con Leo](#decisiones-validadas-con-leo-cardinale-2026-08-10) al final.

| Decisión | Detalle | Vínculo |
|---|---|---|
| ~~**Resampleo a 5 min (todo)**~~ **SUPERADA** | Solo variables eléctricas a 5 min; **radiación a 15 s en tabla aparte** (P8) | [[muestreo-variable]], [[respuestas-leo-cardinale]] |
| ~~**Temp 85.0 → NULL**~~ **SUPERADA** | Leo: **dejar crudo**, limpiar en análisis (nueva variable). Causa: pegamento/falso contacto del sensor | [[temperatura-85]], [[respuestas-leo-cardinale]] |
| ~~**Irradiancia −38.845 → 0**~~ **SUPERADA** | Leo: **dejar crudo**, corregir en análisis (nueva variable). El offset es normal (calibración/ruido) | [[irradiancia-sin-calibrar]], [[respuestas-leo-cardinale]] |
| **Calibración de irradiancia** | **Desbloqueada:** sin constante guardada → camino **clear-sky (pvlib)** con lat/lon + tilt/azimut ([[geometria-sistema]]). Descartar irradiancia pre-mediados-2025 | [[bloqueantes]], [[geometria-sistema]] |
| **Gaps largos: sin datos sintéticos** | 126 y 71 días → usar NASA POWER como referencia paralela | [[gaps-temporales]] |
| **Duplicados** | Exactos (mismo MD5) se eliminan; fragmentos `(N)` requieren decisión del usuario | [[duplicados]] |
| **Schema destino** | Superset de todas las variables; timestamp TIMESTAMPTZ al inicio; metadata de archivo/schema origen | [[schemas-multiples]] |

## Decisiones de implementación (2026-06-02)

| Decisión | Detalle | Vínculo |
|---|---|---|
| **Cero columnas quemadas** | Única fuente = `normalize.CONCEPT_MAP` (leyenda mínima slug→canónico). Schema canónico, tags, resampleo y DDL SQL se DERIVAN | [[implementacion]], [[schemas-multiples]] |
| **`slugify` normaliza variantes** | Acentos/unidades/mayúsculas colapsan solas → no se enumeran las ~70 variantes crudas | [[typos-headers]] |
| **DDL SQL generado** | `ddl.py` infiere tipos desde el schema canónico; `sql/001_schema.sql` es artefacto | [[implementacion]] |
| **Sin índice `timestamp::date`** | Postgres lo rechaza (no IMMUTABLE); la PK en timestamp ya da btree | [[implementacion]] |
| **Conexión Postgres directa** | psycopg + Session pooler (`postgres.<ref>`), NO el API REST. UPSERT masivo | [[implementacion]] |
| **CLI interactivo, un entrypoint** | `python3 main.py` → menú numerado, sin flags; dry-run exporta CSV (abrible) | [[implementacion]] |
| **Filas ragged se saltan** | `read_raw_csv` tolerante; separación fina (Paso 2) queda pendiente | [[filas-mezcladas]] |

Herramientas usadas: `pandas`, `psycopg`, `python-dotenv`, `pyarrow`; `pvlib`/
`pvanalytics` reservadas para la calibración (pendiente). Destino: **Supabase (PostgreSQL)**.

## Decisiones del agente de pronóstico (2026-07-27/28)

| Decisión | Detalle | Vínculo |
|---|---|---|
| **Arquitectura A (store propio)** | ETL AgroDash→Supabase; el forecaster lee el STORE, no la fuente. Desacopla y da historia | [[pipeline-tiempo-real]] |
| **Prioridad: solo predicciones** | De momento humedad + irradiancia; no el Comparador aún | [[pipeline-tiempo-real]], [[capa-agentes]] |
| **Humedad = suelo de San Carlos** | `Caja Hum_Suelo SC` (cruda, ADC); no aire/Zentra | [[pipeline-tiempo-real]] |
| **"Solo histórico", no avisar al equipo** | Fuente SC congelada (23-jul); se construye idempotente y se pone en vivo al restaurarse | [[agrodash]] |
| **Forecaster de humedad = persistencia de mediana** | Suelo cambia lento y es autocorrelado; sin cielo despejado (eso es solar) | [[pipeline-tiempo-real]] |

## Decisiones validadas con Leo Cardinale (2026-08-10)

Respuestas oficiales verbatim en [[respuestas-leo-cardinale]]. Estas **reemplazan** las decisiones
tachadas arriba.

| Decisión | Detalle | Origen |
|---|---|---|
| **Crudo en la base, corrección en capa de análisis** | Regla rectora. La DB conserva el valor **crudo**; cada corrección genera una **variable/columna corregida nueva** (temp 85, offset −38.845, fuera de rango). El crudo puede servir a futuro | P2, P5, P9/P10 |
| **Muestreo: eléctricas 5 min · radiación 15 s (aparte)** | Variables eléctricas → 5 min. Radiación → **15 s** (era 10 s; ThingSpeak no permite <15 s) en **base/tabla aparte**. Muestreos <10 s = pruebas → conservar o promediar a 15 s | P8 |
| **Límites de validez = posproceso, no in-place** | Rangos propuestos OK como punto de partida; se aplican sobre el crudo en posproceso, no anulando en la DB | P9/P10 |
| **Temperatura válida: 10–80 °C** | Reemplaza el −10…60 °C tomado de AgroDash | P9 |
| **Filas mezcladas: recuperar lo posible** | Como ya hizo Joshua: recuperar lo que se pueda, aceptar huecos donde no | P6/P7 |
| **Nombres de columnas: aprobados** | Avalados; abreviar los muy largos y documentarlos en una tabla de definiciones | P1 |
| **Descartar datos tempranos inválidos** | Irradiancia **pre ~mediados-2025 no es válida** (error corregido a mediados 2025). **SP722** recién operativo desde **mayo 2026** | P12 |
| **Sin constante de calibración guardada** | "Celda calibrada" = nombre comercial, no hay ajuste aplicado → calibrar por clear-sky (pvlib) con [[geometria-sistema]] | P11 |

**Impacto en el pipeline (`src/agrovoltaic`):** el `transform.py` actual limpia in-place
(85→NULL, offset→0, resampleo total a 5 min). Para cumplir estos acuerdos hay que **rediseñar el
esquema** (crudo + tabla de radiación 15 s) y **re-correr el ETL** desde los CSV — no se puede
recuperar el crudo con un ALTER sobre la tabla ya transformada. Ver [[implementacion]] y
[[respuestas-leo-cardinale]].
