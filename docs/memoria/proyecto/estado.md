---
name: estado
description: Pipeline ETL corrido OK; MVP endurecido (auth, topes, CI, salud) y verificado en producción el 2026-08-18; riesgos abiertos: cuota del store al 79 % y superficie expuesta. 2026-08-28: la capa de algoritmos se construyó y está terminada, el barrido de calidad corrió en producción, y el Performance Ratio quedó en revisión por un sesgo de emparejamiento. 2026-08-30: Leo respondió las tres consultas y desbloqueó dos de las tres. 2026-09-01: llegaron 57 CSVs nuevos que desmienten tres hechos que le reportamos al equipo (el sistema nunca dejó de reportar), el frontend quedó terminado con sus cinco vistas, y apareció una alarma abierta: el último día que tenemos la planta no generó nada
categoria: proyecto
actualizado: 2026-09-01
---

# Estado actual

**Actualizado 2026-06-02.** El pipeline está implementado y corrió con éxito.

| Fase | Estado |
|---|---|
| EDA exhaustivo | ✅ Hecho (`../../referencia/EDA-Monitoreo-AgroVoltaic.md`) |
| Pipeline de limpieza (diseño) | ✅ Definido (`../../referencia/TODO-Pipeline-Limpieza.md`) |
| Código de limpieza | ✅ Implementado (`src/agrovoltaic/`), ver [[implementacion]] |
| Carga a Supabase | ✅ Corrió: 285 CSV → 36.630 filas en `monitoreo_agrovoltaic` · **2026-09-01: +57 CSVs**, la tabla eléctrica queda en **45.270 filas / 331 días** → [[dataset-actual]] |
| Copia local de AgroDash (Cartago) | ✅ Dump de `control` descargado 2026-06-30 → `sql/dump/agrodash_control_2026-06-30.dump` (609 MB) — ver [[agrodash]] |
| Restaurar dump AgroDash (entorno de pruebas) | ✅ Corriendo en `izack-rig` (Docker `agrodash-pg`, Tailscale `100.100.130.47:5432`, DB `agrodash_control`, 21.3M filas) — ver [[agrodash]] |
| Explorar AgroDash para el Agente Histórico | ⬜ Pendiente (ya consultable, ver [[capa-agentes]]) |
| Separación fina de filas mezcladas (Paso 2) | ⬜ Pendiente (hoy se saltan las ragged) |
| Calibración de irradiancia / Performance Ratio | ⬜ Bloqueado por [[bloqueantes]] |
| EDA notebook + tests | ⬜ Vacíos |
| Dashboard / predicción / IA | ⬜ Futuro |

## 2026-08-14 — las 6 tareas de confiabilidad del MVP, cerradas

| Tarea | Qué se hizo |
|---|---|
| Ingesta automatizada + frescura | El ETL fallaba en silencio hace 9 días (Cartago caído): corregido, fuente movida a una réplica del dump **en la EC2**, units versionados y `GET /salud/ingesta` |
| Auth en el mvp-debugger | `middleware.ts` con sesión firmada (Web Crypto, runtime Edge). **Falla cerrada** sin `DEBUGGER_PASSWORD` |
| Tope de gasto y rate-limit | Token bucket por identidad + tope diario leído de `gasto_diario` en el store |
| Tests de humo + CI | 3 jobs en GitHub Actions; analizador pasó de 0 a 24 tests |
| Observabilidad | Vistas `v_salud_ingesta`/`v_agente_errores` + panel "Salud del sistema" en la consola |
| Estados de error en la web | Las vistas ya no quedan en "cargando…" para siempre ante una respuesta inesperada |

Detalle en [[pipeline-tiempo-real]] y [[agrodash-local]]. 12 PRs.

## 2026-08-18 — verificación en producción y dos riesgos operativos

Todo lo del 14-ago **comprobado en vivo** contra la EC2 y el store (no solo contra los commits):
réplica arriba con 21.314.662 filas, ETL corriendo cada 15 min con `exit 0`, `forecast.env`
apuntando a `127.0.0.1:5433` y los objetos nuevos del store presentes. Detalle y tabla completa
en [[agrodash-local]]; resumen ejecutivo en `../../analisis/cambios-2026-08-18.html`.

Dos riesgos que **no existían documentados** y ahora sí:

- **Cuota del store al 79 %** (395/500 MB del Free tier), con `lecturas_ambientales_sc`
  llevándose el 89 %. El próximo backfill grande deja el proyecto en solo-lectura →
  [[cuota-store-supabase]].
- **Superficie expuesta de la EC2**: los agentes bindean `0.0.0.0:8000/8010` y hoy solo los frena
  el security group (verificado: no responden desde internet); `/forecast/salud/ingesta` es
  público sin key → [[superficie-expuesta]].

## 2026-08-28 — fase nueva: los algoritmos de evaluación de datos

Llegó el doc `Evaluación de datos.pdf` de Leonardo Cardinale (el equipo lo llama "el doc de
Hugo") y **redefine qué hace el Agente Histórico**: todo lo que el documento enumera son las
métricas que ese agente debe evaluar.

Decisión de Izack: **primero los algoritmos, el agente después**
([[algoritmos-antes-que-agente]]). Se implementan algoritmos genéricos, con contrato de tool
(entrada y salida tipadas, sin acoplarse a la UI) y **rango de fechas como parámetro de primera
clase**, que calculen todas las métricas del PDF sobre los datos que ya están en Supabase. El
agente viene cuando el catálogo esté completo, y su rol es **acompañar a un experto humano**,
no automatizar.

| Frente nuevo | Estado |
|---|---|
| Catálogo de métricas (9 KPIs + 7 ejes energéticos) | ⬜ Especificado, sin implementar → [[catalogo-metricas-evaluacion]] |
| Pruebas de calidad (4 familias, umbrales exactos) | 🟨 Parcial: familias 1 y 2 cubiertas en parte por [[agente-historico-calidad]] → [[pruebas-calidad-umbrales]] |
| Gráficos (dashboard, timeseries, box/ridge/OLS/carpeta) | ⬜ Especificados, sin implementar → [[graficos-evaluacion]] |
| Fuentes abióticas nuevas (Fliwer, nodos ESP32) | ⬜ Definidas en el doc, **fuera del pipeline**; falta ubicar los archivos → [[pendientes-evaluacion-datos]] |
| POA en el plano del arreglo | ✅ **Existe modelada** (`radiacion_sc_poa`, 56.450 filas desde 2025-09-05). La memoria decía "no la tenemos": falso, verificado el 2026-08-28 → [[catalogo-metricas-evaluacion]] |
| Sensores bifaciales traseros, viento, precipitación | ⛔ No los tenemos → [[pendientes-evaluacion-datos]] |

### Corrección de hechos del 2026-08-28 (consulta directa a producción, no supuesto)

Al construir la capa de algoritmos se midió contra la base y **seis afirmaciones de la memoria
resultaron falsas**:

| Se creía | Se midió |
|---|---|
| "un segundo sensor SP722 **desde** may-2026" | Corrió **18 días** (2026-05-11 a 2026-05-28), **360 lecturas**, y paró **3 días antes** que el resto → [[fuentes-fisicas]] |
| Albedo disponible en toda la ventana | La **reflejada** arranca el **2025-10-25**: el albedo tiene **7 meses**, no 19 → [[fuentes-fisicas]] |
| `intervalo_original_seg` da la cadencia del dato | Es la cadencia del **CSV de origen**. El eléctrico está a **5 min uniformes** (35.101 de 36.468 saltos = 300 s) → [[muestreo-variable]] |
| `radiacion_sc_15s` está a 15 s | Solo **octubre 2025**; el resto va de 2 s a 315 s → [[muestreo-variable]] |
| "No tenemos POA" | Está modelada desde la v0.4 del ETL → [[catalogo-metricas-evaluacion]] |
| El barrido de calidad cubre el histórico | Vigila **14 de 26 variables**; en las otras, "cero hallazgos" = nadie las miró → [[pruebas-calidad-umbrales]] |

Y tres **fallos silenciosos** que afirmaban que el dato estaba bien cuando no lo estaba (321 + 837
hallazgos invisibles, la validez física aprobándose a sí misma, y la materialidad siempre cierta
con `n_dia = 0`): patrón y reglas en [[silencio-leido-como-salud]].

Números del corpus, corregidos: energía total **1.522,78 kWh** (inclinado 921,05 · vertical
601,72) integrando potencia corregida · rendimiento específico del inclinado **864 kWh/kWp/año**
(por días con datos; 416 por calendario) · completitud eléctrica **0,444 contra calendario** y
**0,926 sobre los días con registro** · **295 días sin datos en 26 tramos** · corpus **detenido**
desde el 2026-06-01 (**88 días** de antigüedad).

## 2026-08-28, más tarde el mismo día: la capa de algoritmos se construyó

La tabla de frentes de arriba es de la mañana y **quedó superada**. Estado real al cierre:

| Frente | Estado al cierre del 2026-08-28 |
|---|---|
| Capa de algoritmos | ✅ **Terminada**: 13 módulos de analítica, 11 de pruebas de calidad, **325 tests** sin base de datos, **23 tools**, **10 endpoints** GET → [[capa-analitica]] |
| Pruebas de calidad (4 familias) | ✅ **Las cuatro implementadas** → [[pruebas-calidad-umbrales]] |
| Barrido de calidad en producción | ✅ **Corrido e idempotente**: `hallazgos_calidad` pasó de 3.158 a **23.533 filas**, 23 tipos, 6 fuentes. ⚠️ Dejó un problema de producto: **ningún día queda en verde** → [[store-hallazgos-calidad]] |
| Frontend de análisis | 🟨 **Fundaciones sí, vistas no**: rutas, 6 primitivas de gráfico, contrato de tipos y rango en la URL están; **falta componer las pantallas** → [[consola-analitica]] |
| Performance Ratio y comparación V vs I | ⛔ **En revisión**: el emparejamiento por timestamp exacto sesgaba el resultado e **invertía la conclusión**. Migración escrita, **no aplicada** → [[emparejamiento-por-timestamp]] |
| Agente Histórico (el lazo LLM) | ⬜ Sigue pendiente, y ahora con dos costuras concretas (`QUE_ES` con 12 tipos viejos, `prompts.py` sin las tools nuevas) → [[abiertos]] |

**Lo más importante de la jornada:** el Performance Ratio se estaba midiendo sobre **4.369 de
28.996 lecturas (15 %)**, con el **69 % de la muestra concentrada en octubre 2025 y mayo 2026**,
que son los meses en que las cadencias de los dos registradores coincidían. Con el emparejamiento
corregido **gana el arreglo inclinado (0,664) y no el vertical (0,633)**, que es lo contrario de
lo que decía el número publicado. Eso arrastra la pendiente de la nube de puntos de la Fig. 8 y,
sobre todo, la validación empírica de `φ ≈ 0,80`: era **circular** (se probaba φ con la
convergencia que el propio φ producía) y además **el vertical depende de ese factor casi
proporcionalmente y el inclinado casi no** (su cara trasera modelada aporta **+109 %** contra
+15 %, o sea que casi la mitad de su irradiancia efectiva es modelo y no medición). **φ ≈ 0,80
queda sin validar, no refutado**, y hace falta una validación independiente
([[geometria-sistema]]).

**Próximo paso (escrito el 2026-08-28):** que Leo y Hugo respondan las tres consultas enviadas
(emparejamiento del PR, `voltaje_vac = 0`, energía continua o alterna) para poder aplicar la
migración 002; **construir las vistas del frontend**, que es lo que falta del encargo original;
resolver las duplicaciones de detectores; enganchar el agente a su catálogo nuevo. Y lo anterior
sigue en pie: la cuota antes de cualquier backfill, el notebook EDA y el Paso 2 (filas mezcladas).

## 2026-08-30: Leo respondió las tres consultas

Devolvió `consultas-sobre-la-data.pdf` anotado (`consultas-sobre-la-data-Rev-LCV.pdf`, raíz del
repo). Citas verbatim en `docs/referencia/respuestas-lcv-consultas.md`; decisiones y qué cambia en
la implementación, en [[respuestas-lcv-consultas-agosto]].

| Consulta | Resultado |
|---|---|
| Emparejamiento del Performance Ratio | **Cerrada, cambiando la pregunta.** El PR pasa a ser **diario y mensual**, con los acumuladores `energia_pv1_wh` / `energia_pv2_wh` contra la radiación integrada del día. El emparejamiento fino queda para los análisis punto a punto |
| Irradiancia en el plano del arreglo | **Principio confirmado, ecuación ABIERTA.** Sí hay que usar una irradiancia por plano, vía modelo de transposición; **cuál ecuación la define Hugo**. Es la única pregunta abierta |
| `voltaje_vac = 0` | **Cerrada: es dato válido.** El rango 100-280 V se retira; entra una prueba de **disponibilidad del equipo** (las tres variables AC en 0 entre 7:00 y 17:00, refinable por irradiancia > 300 W/m²) |
| Energía del tablero | **Cerrada: es AC**, de `energia_hoy_wh` o `energia_total_wh`, ambos contadores que se reinician. El 1.522,78 kWh publicado es **DC**, o sea otra magnitud |
| Los tres hechos reportados | SP722 y piranómetro de reflejada: **explicados** (mediciones adicionales incorporadas después). El corte del **2026-06-01**: *"Vamos a revisar esto"*, queda en manos de Leo |

**Qué cambia el estado del proyecto.** El PR sale de "en revisión bloqueada por terceros" y pasa a
"hay que recalcularlo con la definición nueva", que es trabajo nuestro. La migración 002 deja de
esperar a nadie: Leo no la aprobó ni la rechazó, movió el PR fuera de su alcance, y sigue siendo
pertinente solo para los cruces punto a punto ([[emparejamiento-por-timestamp]]). El barrido de
calidad hay que **re-correrlo** con el rango de voltaje retirado, aunque eso solo no alcanza para
que aparezcan días en verde ([[store-hallazgos-calidad]]).

**Próximo paso, escrito el 2026-08-30:** recalcular el PR diario y mensual con la definición de
Leo (con la integración pesada por el salto real, no por `5/60` fijo); volver a medir los cuatro
acumuladores de energía **sobre la vista corregida**, porque los 39 MWh que descartaron el contador
se midieron sobre la tabla contaminada; re-correr el barrido; y seguir con **las vistas del
frontend**, que sigue siendo lo que falta del encargo original. Pendiente de terceros: la ecuación
de transposición de Hugo ([[bloqueantes]]).

## 2026-08-31: se midió la energía AC y aparecieron tres cosas que nadie buscaba

La segunda tarea de ese "próximo paso" está **hecha** ([[energia-ac-tablero]]; medición completa en
`../../referencia/medicion-energia-ac.md`), y cambió más de lo que se iba a buscar.

| Hallazgo | Consecuencia |
|---|---|
| **El contador del inversor sí sirve.** Los 39 MWh salían de **una sola fila** (`2025-10-07 07:45`); sin ella el máximo es **2.710,7 kWh** | Lo descartamos por leer la tabla contaminada, y ese descarte llegó al documento que se le envió al equipo |
| **El hueco de cuatro meses del tablero AC no existe.** `energia_hoy_wh` tiene **13.923 lecturas en 118 días** entre nov-2025 y feb-2026 | La consulta 3 preguntaba qué mostrar ahí: no hay que decidir nada, el dato estaba en otra columna |
| **Las columnas de energía están en kWh, no en Wh**, pese al sufijo `_wh` | Quien lea el nombre se equivoca por un factor de mil → [[unidades-energia-kwh]] |
| **`v_sc_electrico_corregido` tiene dos bugs**: las columnas de energía pasan sin `CASE`, y el `CASE` de `voltaje_vac` borra los ceros que Leo declaró válidos | Hoy nada que lea la vista corregida puede ver un inversor caído a mediodía → [[vista-corregida-no-corrige]] |
| **La predicción de R7 se cumple:** razón AC/DC contador contra contador, 129 días, **mediana 0,958** | La integración DC, en cambio, **subestima un 14 %** por pesar cada fila a 5 min |
| **1.622,85 kWh se generaron en días que no tenemos** (de 2.528,40 kWh totales) | El contador de vida es el único instrumento que ve los huecos → [[gaps-temporales]] |

**Límite duro que esto le pone al PR diario:** `energia_pv1_wh` y `energia_pv2_wh` solo cubren
**144 días**, ninguno entre nov-2025 y feb-2026. La receta de Leo se apoya en esas dos columnas, así
que el PR diario **no se puede calcular en ese tramo** aunque la energía AC sí exista ahí.

### Y el mismo día se calculó el PR con el método de Leo: gana el inclinado

Cierra la pregunta principal del proyecto ([[performance-ratio-diario]]; medición completa en
`../../referencia/medicion-pr-diario.md`). Sobre **197 días válidos de los 228 con dato**:

| Insumo | PR1 inclinado | PR2 vertical | Gana |
|---|---|---|---|
| GHI horizontal | **0,733** | **0,517** | PV1, los diez meses |
| POA bifacial | **0,648** | **0,612** | PV1, ocho de diez (los dos que pierde, por 0,004) |

Es la **tercera metodología independiente** que da ganador al inclinado, y cae casi encima del
emparejamiento por bin (0,664 / 0,633). El único método que decía lo contrario sigue siendo el join
por timestamp exacto. **PV1 gana en las cinco particiones probadas.**

Tres avisos que van pegados al número y no hay que separar de él:

- **La fórmula `Irradiancia*5/60` no se puede corregir con una constante**, porque su error
  **cambia de signo**: +860 % en oct-2025 y −6,7 % en feb-2026. Inventa una estacionalidad falsa de
  un orden de magnitud, dictada por cuándo cambió la cadencia del registrador.
- **43 de los 197 días útiles (22 %) tienen el inversor caído con sol pleno**, que es el caso de la
  R3 de Leo. El PR pasa de 0,648 a **0,830** al excluirlos, sin cambiar el ganador: hay que
  reportar las dos cifras juntas, porque 0,648 hace pensar en paneles malos cuando fue el inversor.
- **Nov-2025 a feb-2026 es un régimen anómalo sin explicar**: +27 % de potencia a igual irradiancia,
  con evidencia convergente (tensiones sobre 250 V, potencias sobre el nominal, `kt` mínimo en
  febrero). No se resuelve desde la base, va al equipo ([[bloqueantes]]).

**Y el hallazgo de fondo, que es el mismo de [[geometria-sistema]] visto en el PR anual:** el PR
del vertical **se duplica** según qué POA se use (0,612 con bifacial, 1,217 con frontal, que es
imposible) mientras el del inclinado se mueve un 14 %. La brecha de +5,9 % **depende de que Hugo
confirme la transposición**; el +41,6 % contra horizontal no depende de ningún modelo, pero
tampoco es eficiencia de conversión: es **energía por kWp**.

### Y la tercera medición del día cerró la consulta 2: el inversor caído

[[inversor-sin-acoplar]]; medición completa en `../../referencia/medicion-inversor-caido.md`.

- **La premisa de Leo es falsa y su conclusión correcta**, y hay que decirle las dos cosas: la tabla
  eléctrica tiene **7 filas fuera de 05-17 h**, o sea que no hay noche que medir, pero el 0 V
  coincide con DC = 0 en **7.872 de 7.872** casos y el 97 % tiene el string energizado, o sea el
  inversor sin acoplar a plena luz.
- **Regla adoptada:** ventana fija 07-17 con la irradiancia como **graduador de severidad, no como
  filtro**. Usarla de filtro **pierde 8 días en silencio, 3 de ellos apagones de día entero**.
  Rendimiento: **6.330 lecturas en 95 días** contra 7.954 en 238 de la vieja ([[decisiones]]).
- **Decisión de arquitectura:** módulo propio `calidad/pruebas/disponibilidad.py`, y el tipo
  `inversor_sin_acoplar` **fuera del veredicto de calidad del dato**. Hoy el código confunde las dos
  cosas y **hunde la confianza de meses cuya energía es exacta** ([[capa-analitica]]).
- **Las dos mediciones independientes convergen al 100 %:** 41 de 202 días con la planta parada bajo
  sol por la vía de la energía, y las dos reglas capturan **41 de 41** por la vía del voltaje.

**Y una corrección a un número que dimos por bueno.** El documento que se le envió al equipo decía
que el rango 100-280 era *el motivo principal* de que ningún día quede en verde. Los conteos eran
correctos (7.955 lecturas, 238 días), **la atribución causal no**: quitar el rango deja el veredicto
**igual**, 206 grave · 68 aviso · 0 ok. Los bloqueantes reales, en orden: la **columna AC ausente**
(129 días, triple contada), el **DS18B20 muerto** (111) y **`ruido_excesivo` en severidad `aviso`**,
que hace el verde imposible por construcción (bajándolo a `info` pasan **15 días a verde**). Hoy
llega a verde **un solo día, el 2026-04-09**, y solo en el eje eléctrico
([[store-hallazgos-calidad]]).

## 2026-08-31, al cierre: todo lo que decidió Leo está implementado

Las tres respuestas pasaron de medición a código el mismo día
([[implementacion-decisiones-lcv]]). **La suite fue de 353 a 462 tests en verde.**

| Frente | Estado |
|---|---|
| **R1**, PR diario y mensual | ✅ `analitica/rendimiento.py`, y **reproduce exactamente** los números medidos |
| **R7**, energía AC del tablero | ✅ `analitica/energia.py`, con **dos totales de nombre propio** (`registrada` 1.644,02 kWh · `planta` 2.528,40 kWh) |
| **R3**, inversor sin acoplar | ✅ `calidad/pruebas/disponibilidad.py`, quinta familia, fuera del veredicto en **las tres cuentas** de `contexto.py` |
| Firma de contaminación | ✅ `analitica/contaminacion.py`: era **un criterio en tres sitios distintos**, ahora es un dato compartido |
| Migración de la vista | 🟨 `sql/003` **escrita y validada, NO aplicada** |
| **Escrituras a producción** | ⛔ **NINGUNA todavía.** Aplicar `sql/003` y re-correr el barrido son las dos únicas, y **las decide Izack** |

**Tres correcciones a cosas que se daban por buenas:**

- **`comparativa.py` calculaba su propio Performance Ratio a 5 minutos**, o sea que convivían dos
  definiciones del mismo indicador. Ahora llama a `rendimiento.py`: sus números van de 0,664 / 0,633
  a **0,648 / 0,612** y **el ganador no cambia**. Lo que sí vive a 5 min quedó con nombre propio,
  `emparejamiento_5min`, **sin ninguna clave `pr`**.
- **`QUE_ES` pasó de 12 a 30 entradas**, derivadas del registro y con tests que fallan si sobra o
  falta un tipo. Cierra un pendiente del 2026-08-28.
- **El rango físico vivía en CINCO sitios, no en tres.** Los dos que faltaban están en el **otro
  proyecto** (`src/agrovoltaic/ddl.py`, con su propio config, y `sql/schema.sql`, que es generado),
  así que **regenerar el esquema desde el menú del ETL reintroducía los dos defectos completos** →
  [[rango-fisico-en-cinco-sitios]].

**Y un bug nuevo, el cuarto de la misma familia:** `tools/calidad_periodo.py` llamaba `confianza`
**de forma posicional** y la fuente caía en `variables`. Sin acotar reportaba **274 días
utilizables cuando eran 45**, y con lo eléctrico **190 días cambiaban de veredicto**. Siempre hacia
el mismo lado, declarar sano lo que no lo es ([[silencio-leido-como-salud]]).

**Próximo paso, al cierre del 2026-08-31:** aplicar `sql/003` y re-correr el barrido (las dos
escrituras, decide Izack); enseñarle a `contexto.py` a contar `radiacion_sc_poa`, que es lo único
que bloquea vigilar la POA; hacer obligatorio el parámetro `variables` de `confianza`; decidir qué
se hace con el sufijo `_wh`, con el 2026-03-09 y con la severidad de `ruido_excesivo`
([[abiertos]]); y **las vistas del frontend**, que siguen siendo lo que falta del encargo original.
Pendiente de terceros: la ecuación de transposición de Hugo ([[bloqueantes]]).

## 2026-09-01: llegaron datos nuevos, y desmienten tres hechos que ya reportamos

Izack descargó `Last-Data.zip`: **57 CSVs del 2026-06-02 al 2026-08-31**, ya ingestados. Todo lo de
esta sección está **verificado contra producción**, no supuesto ([[dataset-actual]]).

| | Antes | Después |
|---|---|---|
| Días con dato eléctrico | 274 | **331** |
| Filas eléctricas | 36.469 | **45.270** |
| Último dato | 2026-06-01 | **2026-08-31** |

### Las tres correcciones, y las tres van al documento del equipo

| Se reportó | Se midió |
|---|---|
| "El sistema dejó de reportar el 2026-06-01: 88 días sin datos" | **Nunca dejó de reportar.** Hay dato hasta el 2026-08-31 y **55 de los 57 días nuevos generan**, con pico de **2.115 W** sobre 2.840 Wp. Lo desactualizado era **nuestra descarga** |
| "El SP722 corrió 18 días, 360 lecturas: es todo el dato que hay para calibrar" | Volvió el **2026-06-03** y no paró: **8.984 lecturas** del 2026-05-11 al 2026-08-31. **El descarte por ventana insuficiente se reabre** → [[fuentes-fisicas]] |
| "Los 13 esquemas" (no estaba en el documento, pero el equipo tiene que saberlo) | **Se terminaron.** Los 57 archivos comparten **una sola cabecera de 27 columnas** y **ninguna fila mezclada**. Sigue siendo cierto para el histórico → [[schemas-multiples]] |

**Es lo más urgente de la jornada:** le dimos al equipo tres hechos equivocados y sobre uno de ellos
Leo respondió *"vamos a revisar esto"*, o sea que hay alguien por ir a campo a buscar un corte que
no existió → [[correccion-al-equipo]].

### La alarma: el último día que tenemos, la planta no generó nada

El **código de error 302** aparece en **661 registros de agosto**, y los dos peores días del
histórico son los dos últimos:

| | 2026-08-26 | 2026-08-31 |
|---|---|---|
| Generación en todo el día | **cero** | **cero** |
| Filas en error (de 155) | 144 | 147 |
| Irradiancia máxima | 1.077 W/m² | 1.041 W/m² |
| Tensión de string | 168 V | 172 V |
| Corriente | **cero** | **cero** |

Es exactamente el caso `inversor_sin_acoplar` que pidió Leo, **salvo que ya no es historia**:
arreglos energizados, sol de sobra, y nadie tomando la corriente. La cuenta de disponibilidad quedó
en **118 días con la planta parada, 86 de ellos con sol pleno**, sobre 331 con datos →
[[inversor-sin-acoplar]].

Y la irradiancia sin calibrar **se sigue manifestando en el dato nuevo**: **102 días con kt
imposible** y picos de **1.464 W/m²**, que no son físicamente posibles en San Carlos →
[[irradiancia-sin-calibrar]].

### Un modo de falla nuevo, y es el quinto de la misma familia

Se corrió **solo el barrido** después de la carga, y **el veredicto siguió informando 274 días con
datos cuando la base ya tenía 331**: su calendario sale de la tabla de apoyo `ventana_solar`, que
terminaba el 2026-06-01, así que el barrido escribió los hallazgos nuevos y **el veredicto no los
podía ver porque para él esos días no existían**. Sin error ni advertencia, con un número plausible
y viejo. **Quinto caso del patrón y quinto que falla hacia el lado tranquilizador**
([[silencio-leido-como-salud]]).

**Regla operativa adoptada:** después de una carga se corre `historico todo` (sol, barrido, cielo,
reporte, **en ese orden**), nunca solo `barrido` → [[regla-post-carga]]. Resuelto el mismo día:
`ventana_solar` 569 → **660 días**, `cielo_diario` 228 → **285**, `hallazgos_calidad` 28.509 →
**34.408**, clear-sky y POA hasta el 2026-08-31.

### Y se construyeron las cinco vistas del frontend

**Cierra lo que faltaba del encargo original.** `/` Tablero, `/series`, `/estadistica`, `/calidad` y
`/comparativa`, más los endpoints `analitica/rendimiento`, `analitica/energia`,
`analitica/variables`, paginación en `calidad/hallazgos` y el bloque `vigilancia` en
`calidad/resumen`. **Backend 490 tests, frontend 235, lint limpio, tsc limpio.** Regla dura:
**ninguna vista calcula, todo número sale del backend** → [[vistas-frontend]].

Lo que descubrió la vista de Calidad y merece quedar registrado: **5.325 hallazgos de 28.509 (casi
uno de cada cinco) no pueden pesar jamás en ningún veredicto**, porque su fuente no tiene
denominador contable (las cuatro POA, `kt_star`, `cs_ghi_wm2`). El backend ahora lo publica con
`hallazgos_en_el_periodo` y `cuentan_para_el_veredicto` separados ([[store-hallazgos-calidad]]).

**Próximo paso, al cierre del 2026-09-01:** enviar la corrección al equipo (lo primero de todo);
medir la ventana nueva de reflejada y albedo antes de escribir cualquier cifra ahí; reabrir la
calibración con el SP722, que ahora tiene casi cuatro meses de solape; y lo que ya venía en la cola
del 2026-08-31 (aplicar `sql/003`, el parámetro `variables` obligatorio, `contexto.py` contando la
POA, la severidad de `ruido_excesivo`) → [[abiertos]].

Relacionado: [[dataset-actual]], [[correccion-al-equipo]], [[regla-post-carga]],
[[vistas-frontend]],
[[implementacion-decisiones-lcv]], [[respuestas-lcv-consultas-agosto]],
[[energia-ac-tablero]], [[unidades-energia-kwh]], [[vista-corregida-no-corrige]],
[[inversor-sin-acoplar]], [[performance-ratio-diario]], [[rango-fisico-en-cinco-sitios]],
[[objetivo]], [[implementacion]], [[dataset-actual]], [[bloqueantes]],
[[algoritmos-antes-que-agente]], [[catalogo-metricas-evaluacion]],
[[pendientes-evaluacion-datos]], [[cuota-store-supabase]], [[superficie-expuesta]],
[[silencio-leido-como-salud]], [[muestreo-variable]], [[fuentes-fisicas]],
[[gaps-temporales]], [[capa-analitica]], [[consola-analitica]],
[[emparejamiento-por-timestamp]], [[store-hallazgos-calidad]], [[abiertos]].
