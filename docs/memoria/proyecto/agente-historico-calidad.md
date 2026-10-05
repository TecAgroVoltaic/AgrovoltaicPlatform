---
name: comparador
description: El Agente Histórico (control de calidad determinista del historico PV + caracterizacion del cielo) implementado el 2026-08-24; incluye los tres bugs que se encontraron corriendolo y por que importan, mas los tres fallos silenciosos hallados el 2026-08-28, el alcance real del barrido (14 de 26 variables) y la corrida completa en produccion del 2026-08-28 (23.533 hallazgos, cero dias en verde)
categoria: proyecto
actualizado: 2026-09-01
tags: [comparador, calidad, nubes, kt, agentes]
---

# Agente Histórico (agente-historico/)

Los cuatro puntos que pidio Isaac por WhatsApp el 2026-08-21 (calidad de sensores, alertas de
inconsistencia, criterios estadisticos de nubes, variables que afectan la irradiancia) son
exactamente el **Agente Histórico** que ya preveia [[capa-agentes]]: deteccion determinista, store de
hallazgos propio, y el LLM solo narrando por encima.

Alcance decidido con el usuario: **San Carlos PV primero** (`radiacion_sc_15s` +
`monitoreo_sc_electrico`), alerta = **tabla de hallazgos + reporte**, y el punto 4 primero como
**estudio** y despues como capacidad diaria.

## Lo que descubrieron los datos, antes de escribir codigo

- **El logger solo graba de dia.** Los dias sanos cubren 11,5 a 12,7 h. Por eso "el dia esta
  completo" se mide contra las **horas de sol** (tabla `ventana_solar`, pvlib) y no contra 24 h.
  `radiacion_sc_clearsky` NO sirve para eso: solo tiene timestamps donde ya hay dato.
- **El nombre `radiacion_sc_15s` engaña**: el regimen real dominante es de 5 minutos (196 de
  274 dias). Hay 33 cadencias distintas en el historico. **Medido por mes el 2026-08-28:**
  **octubre 2025 es el UNICO mes realmente a 15 s**; el resto va de 2 s (dic-2024) a 315 s
  (nov-2025 a feb-2026). Ver [[muestreo-variable]].
- **Cero timestamps duplicados y cero nulos de fila** en radiacion: el ETL ya deduplico. El
  problema de completitud es otro (cobertura: 274 dias con datos de 569 de calendario, 48 %).

## Las tres trampas que costaron una corrida cada una

**1. El VI medía la cadencia del logger, no el cielo.** El indice de variabilidad esta definido
para un intervalo FIJO. Calculado sobre las muestras crudas daba VI 4,15 con cadencia de 315 s
y **VI 23,81 con cadencia de 42 s para el mismo kt**. El numerador no encoge al afinar el
muestreo (el ruido de nubes es de alta frecuencia) pero el denominador si (el cielo despejado
es suave). Arreglo: calcularlo sobre **rejilla uniforme de 5 min**. Despues del arreglo los tres
regimenes dan 4,44 / 4,18 / 3,50.

**2. Los kt imposibles se disfrazaban de dia soleado.** Incluir las muestras con kt > 1,2 en el
promedio diario daba `kt_medio` = **5,67**, o sea cinco veces la energia del cielo despejado
como caracteristica del dia. Se excluyen de la estadistica y se cuentan aparte como hallazgo.
Con eso el kt maximo diario real es 0,83: **en San Carlos no hay un solo dia completamente
despejado**, y eso ahora es un hallazgo creible y no un artefacto.

**3. "Sensor plano" eran tres cosas distintas.** De 307 casos, ninguno era un sensor trabado:
129 estaban clavados en **85** (DS18B20 desconectado, ya cubierto por `saturado_85`) y 178 en
**0** (el inversor no genero ese dia, que es un hecho operativo, no una averia). Se separaron en
`saturado_85`, `constante_en_cero` (aviso) y `sensor_plano` (grave, solo si el valor constante
no es ninguno de esos dos). Hoy `sensor_plano` no aparece ni una vez.

Bonus: una columna con TODAS las filas en NULL no es "faltan datos", es que la columna no vino
en el CSV. Es el problema de los 13 esquemas y se arregla en el ETL, asi que se llama
`columna_ausente` y no `nulos`.

Y un bug de coordinacion: el barrido borraba el rango completo por fuente antes de reinsertar,
y se llevaba puesto el `kt_imposible` que escribe `cielo.py` sobre la misma fuente. **En
silencio**: el resumen de la corrida seguia dando los mismos numeros. Ahora el borrado se acota
a `TIPOS_PROPIOS`.

## Tres fallos silenciosos mas, encontrados el 2026-08-28

Al construir la capa de algoritmos ([[algoritmos-antes-que-agente]]) aparecieron tres fallos que
seguian **vivos** en este barrido, y los tres fallaban en la direccion peligrosa: **afirmar que el
dato esta bien cuando no lo esta**. El patron que comparten esta en
[[silencio-leido-como-salud]]. En corto:

1. **`contexto.confianza` no encontraba los hallazgos de irradiancia.** Buscaba por el nombre
   calibrado (`irradiancia_incidente_wm2`) mientras `hallazgos_calidad` guarda el crudo
   (`irradiancia_incidente`): **321 hallazgos invisibles**, y las tres temperaturas perdian
   **837** por lo mismo. Cero hallazgos se lee como dato impecable, asi que la confianza salia
   perfecta justo cuando la irradiancia estaba rota.
2. **La familia de validez fisica se aprobaba a si misma.** Leida contra las vistas corregidas
   (que anulan lo que cae fuera de rango) da siempre cero valores imposibles: no porque el sensor
   este bien, sino porque la vista ya los borro.
3. **Cualquier hallazgo sobre una fuente cuyas filas nadie cuenta invalidaba el dia.** La
   condicion de materialidad `n_afectadas >= 0,20 x n_dia` con `n_dia = 0` es cierta siempre. Es
   la contracara del criterio que se explica mas abajo (un dia no deja de servir por 3 de 144
   lecturas): sin denominador, el criterio se da vuelta.

Y una cuarta cosa de la misma familia, medida contra `hallazgos_calidad`: **el barrido vigila 14
de las 26 variables**. No mira `albedo`, las cuatro del SP722, `cs_ghi_wm2`, `kt_star` ni las dos
POA. Para esas, "cero hallazgos" no dice que esten limpias: dice que nadie las miro. Ver
[[pruebas-calidad-umbrales]].

## Umbrales calibrados, no importados

`VI_VARIABLE = 6.0`. Medido sobre los 228 dias: min 0,76 · p25 3,09 · mediana 4,29 · p75 5,62 ·
p95 7,29 · max 9,33. El 3,0 que suele citarse es para datos de 1 minuto y etiquetaba al 77 % de
los dias como "variable", o sea que no distinguia nada. Hay un test que lo fija: si alguien lo
baja sin volver a medir la distribucion, la prueba se lo dice.

## Estado del historico segun el barrido (2026-08-24)

274 dias analizados por fuente. Cobertura 48 % del calendario. Cielo: 18 despejados, 113
parciales, 61 cubiertos, 36 variables; la irradiancia medida fue el **51 % de la de cielo
despejado** (kt medio 0,462: sitio muy nuboso, coherente con lo que ya decia el forecaster).

Lo mas grave: `fuera_de_rango` en 256 dias y 11 variables, `columna_ausente` en 140 dias y 12
variables, `saturado_85` en 117 dias. Y **`kt_imposible` en 82 de los 228 dias
caracterizados**, que dice algo incomodo sobre la calibracion de la irradiancia: ver
[[irradiancia-sin-calibrar]].

**Actualizacion 2026-08-28 (consulta directa a produccion).** Los 295 dias sin datos de 569 se
agrupan en **26 tramos**, el mayor de **125 dias** (2024-12-30 a 2025-05-03). Y la completitud del
electrico son **dos numeros distintos que no hay que mezclar: 0,444 contra el calendario y 0,926
sobre los dias en que el logger si grabo**. De nov-2025 a jun-2026 va de **0,84 a 1,02**; el 0,05
que daba antes era el artefacto de medir contra una cadencia nominal fija en vez de la moda de los
saltos reales ([[muestreo-variable]]). Ver [[gaps-temporales]].

## El barrido completo se corrió en produccion (2026-08-28)

**Los conteos de la seccion anterior quedaron superados.** Con las cuatro familias de pruebas ya
implementadas ([[capa-analitica]], [[pruebas-calidad-umbrales]]) el barrido se corrio entero
sobre produccion y `hallazgos_calidad` paso de **3.158 filas y 10 tipos** a **23.533 filas, 23
tipos y 6 fuentes** (4.071 graves · 8.498 avisos · 10.964 info). Idempotencia verificada: dos
corridas sobre el mismo rango, conteo identico.

Y volvio a aparecer el problema que esta vista ya habia resuelto una vez: el veredicto por dia
quedo **`ok = 0`**, aviso 16, grave 258, sin_datos 295. Ningun dia en verde no informa de nada, y
es el mismo fallo que `FRACCION_MATERIAL` se introdujo para corregir. Causas medidas, el falso
positivo de `voltaje_vac = 0` (238 dias) y la conclusion de diseño (**la señal util de este
dataset es el bloque `confianza` por variable, no el veredicto del dia**) estan en
[[store-hallazgos-calidad]].

> ⚠️ **Corregido el 2026-08-31:** el falso positivo del `voltaje_vac = 0` **marcaba** 238 dias pero
> **no era la causa** de que estuvieran en rojo (quitarlo deja el veredicto en 206 y 206). Los
> bloqueantes reales, en orden: la columna AC ausente (**129 dias**), el DS18B20 muerto (**111**) y
> **`ruido_excesivo` en severidad `aviso`**, que hace el verde imposible por construccion. Y el
> veredicto **electrico** real, sobre los 274 dias con dato, es **206 grave / 68 aviso / 0 ok**: la
> tabla de arriba es el global sobre el calendario entero. Ver [[store-hallazgos-calidad]] y
> [[inversor-sin-acoplar]].

## 2026-09-01: la tabla `ventana_solar` resultó ser una dependencia oculta

La carga de 57 días nuevos ([[dataset-actual]]) sacó a la luz algo que esta nota describía como un
acierto de diseño y que también es un riesgo: **el veredicto mide la completitud contra
`ventana_solar`, así que esa tabla es su calendario**. Cuando se corrió solo el barrido, el
veredicto **siguió informando 274 días con datos con la base ya en 331**, porque `ventana_solar`
terminaba el 2026-06-01 y para él los días nuevos no existían. Sin error ni advertencia
([[silencio-leido-como-salud]]).

Regla operativa adoptada, con las cifras del arreglo: [[regla-post-carga]]. Estado después del
recorrido completo: `ventana_solar` **660 días**, `cielo_diario` **285**, `hallazgos_calidad`
**34.408** ([[store-hallazgos-calidad]]).

Y dos números de esta nota que la carga movió: los **82 de 228 días con `kt_imposible`** pasan a
**102** sobre 285 días caracterizados, o sea que el problema de calibración **se sigue manifestando
en el dato nuevo** y no es solo del histórico viejo ([[irradiancia-sin-calibrar]]).

## En la consola (2026-08-24)

Vista **«Calidad de datos»** en el mvp-debugger, y el Agente Histórico como **tercer agente del
selector**. Lo puse primero como vista transversal (razonando que describe los datos y no el
comportamiento de un modelo) y estaba mal: `capa-agentes.md` lo llama agente desde el
principio, y el usuario lo buscó en el selector. Corregido el mismo dia.

Servicio FastAPI propio en **:8020**, proxy `/api/historico/*` **solo GET**: la deteccion
corre por lotes y la consola solo sirve el store. Si la consola pudiera dispararla, cada
visita recorreria los 274 dias y el resultado dependeria de quien mire y cuando.

El selector paso a estar **derivado de una tabla** (`AGENTES` en Console.tsx) en vez de dos
botones escritos a mano y dos `if (a === "...")` en `goAgent`: con tres agentes eso se
multiplica y se desincroniza. De esa tabla salen el selector, el ping de salud, el contexto
del chat y a que vista saltar al cambiar de agente.

Y la tabla tiene un campo **`chat`**: el Agente Histórico esta marcado `chat: false` porque **no
tiene `/chat`**. Es determinista y no lleva LLM a proposito; ofrecerle un chat seria ofrecer
un 502. El widget solo se monta para los agentes que lo declaran.

Dos decisiones de la vista que costaron una iteracion:

- **El mapa es un calendario, no una tabla.** El hallazgo mas grande son los 295 dias que
  faltan de 569, y una tabla de 274 filas no puede mostrar lo que no existe.
- **Dos tiras, una por fuente.** El veredicto combinado daba 226 graves y **cero dias ok**, o
  sea un mapa todo rojo, tan informativo como uno todo verde. Separado aparece lo accionable:
  **radiacion 126 dias ok, electrico 4**. El problema esta en el inversor, no en el
  piranometro.

Y el veredicto se decide en el SERVICIO, no en la vista: si lo calculara el cliente, la
consola y el reporte del CLI podrian discrepar sobre si un dia sirve. Ademas "grave" no es
cualquier hallazgo grave, es el que toca una parte material del dia (una quinta parte de las
lecturas, o los que invalidan el dia por naturaleza): un dia no deja de servir porque 3 de 144
lecturas de una de trece columnas se salieran de rango.

Dos trampas tecnicas anotadas: `timestamptz <= date` compara contra la **medianoche** de ese
dia y se comia el ultimo dia entero (274 aparecia como 273), y **psycopg parsea los `%` de
toda la cadena SQL, comentarios incluidos** (un "20 %" en un comentario revienta con
"incomplete placeholder").

El arnes de verificacion sin navegador se **promovio de scratchpad a
`mvp-debugger/scripts/verificar-vistas.mjs`** (`npm run verificar`, 28 chequeos), que era deuda
anotada en [[abiertos]]. Ver [[verificacion-consola]].

## Pendiente

- **Punto 4 (el estudio).** Los 4 dispositivos `fliwer` de Joshua (temperatura, humedad de aire,
  lux, humedad de suelo, EC, sobre los propios paneles) solapan **1.938 de las 3.302 horas** con
  radiacion, 59 %. AgroDash solo aporta 907 h (27 %). El electrico solapa el 100 % pero sus
  temperaturas son EFECTO de la irradiancia, no causa.
- **Programarlo** (hoy se corre a mano) y **la capa de lenguaje natural** sobre el store.

Relacionado: [[regla-post-carga]], [[dataset-actual]], [[capa-agentes]],
[[irradiancia-sin-calibrar]], [[temperatura-85]],
[[schemas-multiples]], [[muestreo-variable]], [[agente-historico]],
[[silencio-leido-como-salud]], [[pruebas-calidad-umbrales]], [[gaps-temporales]],
[[algoritmos-antes-que-agente]], [[fuentes-fisicas]], [[capa-analitica]],
[[store-hallazgos-calidad]], [[emparejamiento-por-timestamp]].
