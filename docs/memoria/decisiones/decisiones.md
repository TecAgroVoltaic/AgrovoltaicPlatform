---
name: decisiones
description: Decisiones tomadas sobre limpieza (resampleo 5min, 85→NULL, offset→0, gaps, duplicados, schema destino); 2026-08-10 giro a "crudo en DB + corrección en análisis"; 2026-08-30 decisiones de cálculo (PR diario y mensual, energía del tablero en AC, voltaje AC en cero válido); 2026-09-01 regla operativa de post-carga
categoria: decision
actualizado: 2026-09-01
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

## Decisiones del Agente Predictivo (2026-07-27/28)

| Decisión | Detalle | Vínculo |
|---|---|---|
| **Arquitectura A (store propio)** | ETL AgroDash→Supabase; el forecaster lee el STORE, no la fuente. Desacopla y da historia | [[pipeline-tiempo-real]] |
| **Prioridad: solo predicciones** | De momento humedad + irradiancia; no el Agente Histórico aún | [[pipeline-tiempo-real]], [[capa-agentes]] |
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
| **Descartar datos tempranos inválidos** | Irradiancia **pre ~mediados-2025 no es válida** (error corregido a mediados 2025). **SP722** recién operativo desde mayo 2026 · ⚠️ **medido el 2026-08-28: no es "desde", son 18 días** (2026-05-11 a 2026-05-28, 360 lecturas) y después se detuvo, ver [[fuentes-fisicas]] | P12 |
| **Sin constante de calibración guardada** | "Celda calibrada" = nombre comercial, no hay ajuste aplicado → calibrar por clear-sky (pvlib) con [[geometria-sistema]] | P11 |

**Impacto en el pipeline (`src/agrovoltaic`):** el `transform.py` actual limpia in-place
(85→NULL, offset→0, resampleo total a 5 min). Para cumplir estos acuerdos hay que **rediseñar el
esquema** (crudo + tabla de radiación 15 s) y **re-correr el ETL** desde los CSV — no se puede
recuperar el crudo con un ALTER sobre la tabla ya transformada. Ver [[implementacion]] y
[[respuestas-leo-cardinale]].

## 2026-08-28 — algoritmos primero, agente después

Con el doc de evaluación de datos de Leonardo Cardinale (`Evaluación de datos.pdf`, 2026-08-28)
llegó una decisión de secuencia que **no cambia ninguna regla de tratamiento de datos** pero sí
el orden de trabajo: las métricas del PDF son lo que evaluará el Agente Histórico, y se
implementan **primero como algoritmos genéricos** (contrato de tool, rango de fechas como
parámetro de primera clase); el agente viene después, como acompañante de un experto humano.

Detalle y justificación en [[algoritmos-antes-que-agente]]. Catálogo en
[[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]] y [[graficos-evaluacion]].

## Decisiones validadas con Leo Cardinale (2026-08-30, segunda ronda)

Respuestas verbatim y detalle de implementación en [[respuestas-lcv-consultas-agosto]]. Estas
**no tocan el tratamiento de los datos** (la ronda del 2026-08-10 sigue entera): tratan **cómo se
calculan las métricas** sobre los datos ya tratados.

| Decisión | Detalle | Origen |
|---|---|---|
| **El Performance Ratio es diario y mensual, no de 5 minutos** | Energía del día = acumulado de `energia_pv1_wh` y `energia_pv2_wh` al final del día. Radiación del día = suma de la radiación de cada intervalo. Se dividen. **Supera** el debate de cómo emparejar potencia e irradiancia lectura a lectura | Consulta 1a |
| **El emparejamiento fino queda para el análisis punto a punto** | Vecino más cercano cada 5 min, donde sí hace falta (la nube de puntos potencia contra irradiancia). No para el PR | Consulta 1a |
| **Irradiancia por plano, una por arreglo** | Confirmado el principio: hay que transponer la horizontal al plano de cada arreglo. **La ecuación la define Hugo**, es lo único que queda abierto ([[bloqueantes]]) | Consulta 1b |
| **`voltaje_vac = 0` es dato válido** | Es el inversor sin exportar. Se **retira** el rango 100-280 V como prueba de validez física | Consulta 2 |
| **Prueba nueva de disponibilidad del equipo** | `voltaje_vac`, `frecuencia_hz` y `potencia_total_wac` en 0 entre las **7:00 y las 17:00**; refinamiento opcional con irradiancia **> 300 W/m²**. Es alerta operativa, no calidad del dato | Consulta 2 |
| **La energía del tablero es AC** | `energia_hoy_wh` o `energia_total_wh`, ambas AC y ambas **contadores que se reinician** (se leen sumando incrementos, no con `max()`). Siempre un poco menores que la suma de PV1 + PV2, por las pérdidas del inversor | Consulta 3 |

**Impacto en la capa de algoritmos:** cuatro cambios concretos, ninguno de arquitectura. Detalle
en [[capa-analitica]]. La integración de irradiancia además **no puede usar `5/60` fijo**: Leo lo
escribió suponiendo cadencia de 5 min y la nuestra va de 15 s a 330 s ([[muestreo-variable]]).

## 2026-08-31: la disponibilidad del equipo no es calidad del dato

Sale de medir la prueba que pidió R3 ([[inversor-sin-acoplar]]). Es la primera decisión de
arquitectura que abre un eje nuevo en la capa de calidad.

| Decisión | Detalle |
|---|---|
| **La regla es horaria, y la irradiancia gradúa la severidad** | Ventana fija **07:00 a 17:00**; alguna de `voltaje_vac`, `frecuencia_hz` o `potencia_total_wac` en 0. Severidad **grave** con GHI >= 300 W/m², **aviso** por debajo, y **aviso con motivo `sin_irradiancia`** cuando es NULL, de modo que **nunca se calle** |
| **La irradiancia NO es un filtro** | Usarla como filtro duro **pierde 8 días en silencio, 3 de ellos apagones de día entero** (2025-05-07, 2025-05-26, 2026-01-05), porque `NULL >= 300` es falso |
| **Ventana fija, no ventana solar** | Confirma la advertencia del propio Leo: la ventana solar marca **224 días contra 95**. El criterio es **operativo** (cuándo hay alguien para ir a revisar), no astronómico |
| **Módulo propio: `calidad/pruebas/disponibilidad.py`** | **NO** va en `validez_fisica.py`. Es una **quinta familia**, fuera de las cuatro del doc, porque mide **el equipo** y no el dato |
| **`inversor_sin_acoplar` NO entra en el veredicto de calidad del dato** | Ni en `contexto.TIPOS_QUE_INVALIDAN` ni como grave material en `contexto.reducir`. Viaja en un eje separado de disponibilidad dentro del mismo payload de `confianza()` |
| **Los tres `CASE` de la vista se eliminan, no se ensanchan** | Y hay que tocar **tres sitios a la vez**: `config.py:76`, `analitica/catalogo.py` y la vista ([[vista-corregida-no-corrige]]) |

**Implementado el mismo día** ([[implementacion-decisiones-lcv]]): módulo creado, y
`inversor_sin_acoplar` excluido del veredicto **en las tres cuentas de `contexto.py`**, no solo en
`TIPOS_QUE_INVALIDAN`.

**La razón de fondo, en una frase:** *un día con la planta parada es un día con dato bueno sobre un
sistema malo*, y el veredicto actual no puede decir esa frase. Hoy el código confunde las dos cosas
y **hunde la confianza de meses cuya energía es exacta**: el agente concluye "no confíes en la
energía de este mes" cuando la verdad es la contraria, que la energía es exacta y es baja porque la
planta estuvo parada. El número que el experto necesita es **"41 de 202 días con la planta
parada"**, no "12 días más en rojo".

## 2026-08-31: qué columnas entran a `_VIGILADAS`, y por qué el criterio es asimétrico

**Las cuatro columnas de energía entran. Las dos POA frontales no.**

El criterio no es "vigilar todo lo que se pueda", porque **los dos errores posibles no cuestan lo
mismo**:

| Error | Qué produce |
|---|---|
| Una clave **de más** (vigilar algo que no se sabe contar) | **silencio leído como salud**: cero hallazgos se lee como dato impecable |
| Una clave **de menos** | lo **canta `sin_vigilancia()`**: la salida dice que nadie miró |

Como el primero es mudo y el segundo habla, **ante la duda se deja fuera**. La POA queda afuera
porque sus hallazgos viajan con fuente `radiacion_sc_poa`, que `calidad/contexto.py` **no sabe
contar**: declararla vigilada convertiría **un aviso honesto en un aprobado falso**
([[silencio-leido-como-salud]]). Arreglar `contexto.py` es lo único que bloquea vigilarla
([[abiertos]]).

Detalle de la ronda en [[implementacion-decisiones-lcv]].

## 2026-09-01: después de una carga se corre el recorrido completo, no solo el barrido

**`historico todo` (sol → barrido → cielo → reporte), nunca solo `barrido`.** Cada paso escribe el
denominador del siguiente, y correr uno solo no falla: produce un resultado consistente con un
calendario que ya no existe. Se adoptó después de que el veredicto informara **274 días con datos
cuando la base ya tenía 331**, sin un solo aviso.

Detalle, cifras y qué habría que construir para no depender de acordarse: [[regla-post-carga]].

