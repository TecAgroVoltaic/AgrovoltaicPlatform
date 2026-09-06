# Memoria del Proyecto — AgroVoltaic

Sistema de memoria jerárquico. Un tema por archivo, agrupados por carpeta. Empieza aquí
para ubicar qué buscas; cada línea apunta al archivo de detalle.

**Última actualización:** 2026-09-03 · *(**Se rehizo el responsive de las siete pantallas del MVP
y se desplegó.** La queja era "está fatal, terrible el navbar" y la medición le dio la razón con
número: la banda pegajosa se comía el **25 % de la pantalla del teléfono** y el **60 % en
`/consola`**, y **768 px, el ancho de tablet más común, caía del lado equivocado del único corte
(760 px) por 8 píxeles**, recibiendo la barra lateral de escritorio entera. Ahora la banda mide
**52 px (6 %)** en las siete pantallas y **35 de 35 combinaciones** (7 rutas x 5 anchos) no
desplazan de lado → [responsive-mvp](proyecto/responsive-mvp.md). **Lo que más vale guardar no es
el arreglo sino el método**, porque dos verificaciones dieron por bueno lo que no lo era:
**`--window-size` no produce un viewport real bajo 500 px en macOS** (Chrome recorta la imagen pero
maqueta con otro ancho), y una corrección se dio por hecha **midiendo la barra nueva en vez de
enumerar todas las pegajosas**, con lo que una regresión del 25 % al **38 %** pasó la revisión. La
causa de esa regresión es de manual y conviene tenerla presente: **una media query no aporta
especificidad**, así que un override dentro de `@media` escrito **antes** que su regla base en el
mismo archivo está muerto; se escribió un **auditor de las 627 reglas** de `globals.css` y era la
única → [verificar-midiendo-el-dom](decisiones/verificar-midiendo-el-dom.md). Queda **una decisión
del usuario sin contestar**: si la barra de rango vuelve a quedar pegada en portátiles de 13
pulgadas, donde cuesta el 16,5 % contra el criterio adoptado del 15 %
→ [abiertos](pendientes/abiertos.md). **Ojo, esto NO movió nada del frente de datos:** la
corrección al equipo sigue siendo lo más urgente y la alarma del código 302 sigue abierta.)*

**Antes:** 2026-09-01 · *(**Llegaron datos nuevos y desmienten tres hechos que ya
le reportamos al equipo.** `Last-Data.zip`: **57 CSVs del 2026-06-02 al 2026-08-31**, ya ingestados.
La base pasó de 274 a **331 días** y de 36.469 a **45.270 filas** eléctricas
→ [dataset-actual](datos/dataset-actual.md). **1) El sistema NUNCA dejó de reportar:** le dijimos a
Leo que llevaba 88 días caído y él respondió *"vamos a revisar esto"*; hay dato hasta el 31 de
agosto y **55 de los 57 días generan**, con picos de **2.115 W** sobre 2.840 Wp. Lo desactualizado
era **nuestra descarga**. **2) El SP722 no corrió 18 días:** volvió el 2026-06-03 y son **8.984
lecturas** hasta el 2026-08-31, así que **el descarte por ventana insuficiente se reabre**
→ [fuentes-fisicas](datos/fuentes-fisicas.md). **3) Los 13 esquemas se terminaron:** los 57
archivos comparten **una sola cabecera de 27 columnas** y **ninguna fila mezclada** (sigue siendo
cierto para el histórico viejo) → [schemas-multiples](inconsistencias/schemas-multiples.md). Las
tres van a una corrección al equipo, que es **lo más urgente de todo esto**
→ [correccion-al-equipo](pendientes/correccion-al-equipo.md). **Y un hallazgo nuevo que es una
alarma:** el **código de error 302** aparece en **661 registros de agosto**, y el **2026-08-26 y el
2026-08-31 la generación es exactamente cero todo el día** (144 y 147 filas en error) con
irradiancia de 1.077 y 1.041 W/m² y los arreglos energizados a 168 y 172 V. Es el caso
`inversor_sin_acoplar` que pidió Leo, **salvo que ya no es historia: el último día que tenemos la
planta no generó nada**. Disponibilidad total **118 días parada, 86 con sol pleno**, sobre 331 con
datos → [inversor-sin-acoplar](datos/inversor-sin-acoplar.md). Y **102 días con kt imposible**, con
picos de **1.464 W/m²**: la irradiancia sin calibrar se sigue manifestando en el dato nuevo
→ [irradiancia-sin-calibrar](inconsistencias/irradiancia-sin-calibrar.md). **Un modo de falla
nuevo, y es el quinto de la misma familia:** corriendo solo el barrido, **el veredicto siguió
informando 274 días con datos con la base ya en 331**, porque su calendario sale de la tabla de
apoyo `ventana_solar`, que terminaba el 2026-06-01. Sin error ni advertencia: un número plausible y
viejo. Regla adoptada: después de una carga se corre **`historico todo`** (sol, barrido, cielo,
reporte, en ese orden), **nunca solo `barrido`**
→ [regla-post-carga](decisiones/regla-post-carga.md). Resuelto: `ventana_solar` 569 → **660**,
`cielo_diario` 228 → **285**, hallazgos 28.509 → **34.408**. **Y se construyeron las cinco vistas
del frontend**, que era lo que faltaba del encargo original: `/`, `/series`, `/estadistica`,
`/calidad` y `/comparativa`, con tres endpoints nuevos, **490 tests de backend y 235 de frontend**,
y la regla dura de que **ninguna vista calcula**. Lo que descubrió la vista de Calidad: **5.325
hallazgos de 28.509 (casi uno de cada cinco) no pueden pesar jamás en ningún veredicto**, porque su
fuente no tiene denominador contable → [vistas-frontend](proyecto/vistas-frontend.md).)*

**Antes:** 2026-08-31 · *(**Se implementó todo lo que decidió Leo, y nada se
escribió todavía en producción.** La suite pasó de 353 a **462 tests en verde**. Tres módulos
nuevos: `analitica/rendimiento.py` (el PR diario y mensual, que **reproduce exactamente** los
números medidos, agrega ponderando por energía según IEC 61724 y **marca la variante de POA frontal
como físicamente imposible** en vez de devolverla como un resultado más),
`analitica/energia.py` (con **dos totales de nombre propio**, `registrada` 1.644,02 kWh y `planta`
2.528,40 kWh, así que los 1.622,85 kWh de días que no tenemos pasan de advertencia a aritmética; y
nov-2025 a feb-2026 ya devuelve **667,2 kWh reales**) y
`calidad/pruebas/disponibilidad.py` (quinta familia, excluida del veredicto **en las tres cuentas**
de `contexto.py` y visible en canal propio) →
[implementacion-decisiones-lcv](proyecto/implementacion-decisiones-lcv.md). **Tres correcciones a
cosas que dábamos por buenas:** `comparativa.py` **calculaba su propio Performance Ratio a 5
minutos** (convivían dos definiciones del mismo indicador; ahora sus números van de 0,664/0,633 a
**0,648/0,612** y el ganador no cambia, y lo que sí vive a 5 min quedó como `emparejamiento_5min`
**sin ninguna clave `pr`**), `QUE_ES` pasó de **12 a 30 entradas** derivadas del registro, y **el
rango físico vivía en CINCO sitios y no en tres**: los dos que faltaban están en el **otro
proyecto**, así que **regenerar el esquema desde el menú del ETL reintroducía los defectos
completos** → [rango-fisico-en-cinco-sitios](inconsistencias/rango-fisico-en-cinco-sitios.md). **Y
un bug nuevo, el cuarto de la misma familia:** `calidad_periodo.py` llamaba `confianza` de forma
**posicional** y la fuente caía en `variables`; sin acotar reportaba **274 días utilizables cuando
eran 45**, y con lo eléctrico **190 días cambiaban de veredicto**. La trampa que lo hizo posible es
lo importante: `confianza` acepta que no le pasen variables, informa "sin acotar" y **no cuenta
nada**, o sea que **la forma de llamarla mal es también la más cómoda**.)*

**Antes ese mismo día:** 2026-08-31 · *(**Se midió la energía AC del tablero y salieron tres
cosas que nadie buscaba.** La medición cerraba el hueco que dejó la respuesta de Leo, y terminó
corrigiendo un número que ya habíamos publicado. **El contador del inversor SÍ sirve:** los
39.328.367 que lo hicieron descartar salen de **una sola fila** (`2025-10-07 07:45`, la misma de
los 26 MW de potencia PV1); sin ella el máximo es **2.710,7 kWh**, o sea 571 kWh/kWp/año, físico.
Lo descartamos por leer la tabla contaminada, y ese descarte llegó al documento que se le envió al
equipo. **El hueco de cuatro meses del tablero AC no existe:** `energia_hoy_wh` tiene **13.923
lecturas en 118 días** entre nov-2025 y feb-2026, justo donde todas las demás columnas AC están en
NULL, así que no hay nada que decidir, el dato estaba en otra columna. **Las cuatro columnas de
energía están en kWh y no en Wh** pese al sufijo `_wh`: verificado por dos vías (razón 1.003,58
contra `potencia_total_wac` integrada, y un máximo de 5,00 kWh/kWp/día), y quien lea el nombre se
equivoca por un factor de mil → [unidades-energia-kwh](inconsistencias/unidades-energia-kwh.md).
**`v_sc_electrico_corregido` tiene dos bugs:** las columnas de energía pasan **sin ningún `CASE`**
(la vista corregida devuelve los mismos 39 MWh que la cruda) y el `CASE` de `voltaje_vac` **borra
los 7.873 ceros que Leo acaba de declarar válidos**, con lo que hoy nada que lea esa vista puede
ver un inversor caído a mediodía →
[vista-corregida-no-corrige](inconsistencias/vista-corregida-no-corrige.md). **La predicción de R7
se cumple:** razón AC/DC contador contra contador, 129 días, **mediana 0,958**; contra la
integración DC no, porque **la integración subestima un 14 %**. Y el número que ningún otro
instrumento del sistema da: de 2.528,40 kWh de vida, **1.622,85 se generaron en días que no
tenemos** → [energia-ac-tablero](datos/energia-ac-tablero.md). **Límite duro para el PR diario:**
`energia_pv1_wh` y `energia_pv2_wh` solo cubren **144 días**, ninguno entre nov-2025 y feb-2026.
**Y la tercera medición del día cerró la consulta 2, la del inversor caído.** La premisa de Leo es
**falsa** y su conclusión **correcta**, y hay que decirle las dos cosas: la tabla eléctrica tiene
**7 filas fuera de 05-17 h**, o sea que no hay noche que medir y el 0 V es un 20 % plano a todas las
horas, pero coincide con DC = 0 en **7.872 de 7.872** casos y el **97 % tiene el string energizado**
(el inversor sin acoplar a plena luz). Regla adoptada: ventana fija **07-17** con la irradiancia
como **graduador de severidad, no como filtro**, porque de filtro **pierde 8 días en silencio, 3 de
ellos apagones de día entero**. Va en **módulo propio** y **fuera del veredicto de calidad del
dato**, porque hoy el código confunde disponibilidad con validez y **hunde la confianza de meses
cuya energía es exacta** → [inversor-sin-acoplar](datos/inversor-sin-acoplar.md). **Y una corrección
a un número que dimos por bueno:** el documento enviado al equipo decía que el rango 100-280 era el
motivo principal de que ningún día quede en verde. Los conteos eran correctos, **la atribución
causal no**: quitarlo deja el veredicto **igual** (206 grave · 68 aviso · 0 ok). Los bloqueantes
reales son la **columna AC ausente** (129 días), el **DS18B20** (111) y **`ruido_excesivo` en
severidad `aviso`**, que hace el verde imposible por construcción (a `info` pasan **15 días a
verde**).
**Y el mismo día se calculó el PR con el método de Leo, que cierra la pregunta principal del
proyecto: gana el arreglo INCLINADO**, en las cinco particiones probadas (POA bifacial 0,648
contra 0,612; GHI horizontal 0,733 contra 0,517, ganando los diez meses). Es la **tercera
metodología independiente** que llega ahí, y el único que daba ganador al vertical sigue siendo el
join por timestamp exacto. Tres avisos que van pegados al número: la fórmula `Irradiancia*5/60`
**no se puede corregir con una constante** porque su error **cambia de signo** (+860 % en oct-2025,
−6,7 % en feb-2026, o sea una estacionalidad falsa de un orden de magnitud); **el 22 % de los días
útiles tiene el inversor caído con sol pleno**, que es lo que baja el PR de 0,830 a 0,648 y no los
paneles; y **nov-2025 a feb-2026 es un régimen anómalo sin explicar** (+27 % de potencia a igual
irradiancia). El +5,9 % de brecha con POA **depende de que Hugo confirme la transposición**; el
+41,6 % contra horizontal no depende de ningún modelo, pero tampoco es eficiencia de conversión:
es energía por kWp → [performance-ratio-diario](datos/performance-ratio-diario.md).)*

**Antes:** 2026-08-30 · *(**Leo Cardinale respondió las tres consultas y cerró
dos de las tres.** Devolvió `consultas-sobre-la-data.pdf` anotado. **El Performance Ratio cambia
de unidad de análisis:** deja de calcularse cada 5 minutos y pasa a ser **diario y mensual**, con
el acumulado de `energia_pv1_wh` y `energia_pv2_wh` al final del día contra la radiación integrada
del día, así que el debate del emparejamiento **sale del PR** y queda para los análisis punto a
punto. **`voltaje_vac = 0` es dato válido:** el rango 100-280 V se retira y entra una prueba de
**disponibilidad del equipo** (las tres variables AC en 0 entre las 7:00 y las 17:00, refinable
por irradiancia > 300 W/m²), lo que saca del rojo a **238 días** en cuanto se re-corra el barrido.
**La energía del tablero es AC**, de `energia_hoy_wh` o `energia_total_wh`, ambos contadores que se
reinician, así que el **1.522,78 kWh publicado es DC**, otra magnitud. **Única pregunta abierta:**
cuál **ecuación de transposición** para llevar la horizontal al plano de cada arreglo, y esa la
confirma **Hugo**. Sobre el corte del 2026-06-01, Leo dijo *"vamos a revisar esto"* →
[respuestas-lcv-consultas-agosto](decisiones/respuestas-lcv-consultas-agosto.md). Ojo con dos
trampas que su respuesta da por sentadas y en nuestro dato no se cumplen: la fórmula
`Irradiancia*5/60` **supone cadencia de 5 min** (la nuestra va de 15 s a 330 s), y los 39 MWh con
que se descartó el contador del inversor **se midieron sobre la tabla contaminada**, así que hay
que volver a medirlos sobre la vista corregida antes de sostener el descarte.)*

**Antes:** 2026-08-28 · *(**La capa de algoritmos se construyó, el barrido corrió
en producción, y el Performance Ratio quedó en revisión.** La decisión de "algoritmos antes que
agente" se ejecutó el mismo día: **13 módulos** de analítica, **11** de pruebas de calidad, **325
tests** sin base de datos, **23 tools** y **10 endpoints**, con tres reglas de arquitectura
(funciones puras que no saben del LLM ni de la UI, el **payload del LLM distinto al de la API**, y
un endpoint por algoritmo compuesto en el servidor) → [capa-analitica](proyecto/capa-analitica.md).
**Hallazgo mayor:** `v_sc_performance` unía potencia con POA **por timestamp exacto** y conservaba
**4.369 de 28.996 lecturas (15 %)**, con el **69 % de la muestra en octubre 2025 y mayo 2026**; al
emparejar por bin **gana el inclinado (0,664) y no el vertical (0,633)**, o sea que el sesgo
**invertía el eje 1 del doc de evaluación**. Y comparar contra la GHI **horizontal** castiga al
arreglo vertical (pendiente 0,547 contra 0,906 con su propia POA). Migración escrita y **NO
aplicada**: se avisa a Leo y a Hugo primero →
[emparejamiento-por-timestamp](inconsistencias/emparejamiento-por-timestamp.md). **Y el
emparejamiento no era el único apoyo flojo:** en el arreglo vertical la cara trasera *modelada*
aporta **+109 %** sobre la frontal (contra +15 % en el inclinado), o sea que **casi la mitad de su
irradiancia efectiva es modelo y no medición**, y su PR es casi proporcionalmente sensible a φ
(10 % de error en φ mueve 5 % su PR y solo 0,7 % el del inclinado). La validación vieja era
**circular**, así que **φ ≈ 0,80 queda SIN VALIDAR** (no refutado) y hace falta una validación
independiente → [geometria-sistema](datos/geometria-sistema.md). **El barrido
completo corrió**: `hallazgos_calidad` de 3.158 a **23.533 filas**, 23 tipos, 6 fuentes, y dejó un
problema de producto: **ningún día queda en verde** (`ok=0`) →
[store-hallazgos-calidad](datos/store-hallazgos-calidad.md). **Frontend:** el análisis pasa a ser
la sección principal y la consola de agentes se muda a `/consola`; el estado de un gráfico es una
unión discriminada que **exige un motivo para el vacío** →
[consola-analitica](proyecto/consola-analitica.md). **Y una corrección de la propia sesión:** lo
de "el metadato ocultaba 1.018 huecos de una fila" era impreciso (ningún criterio los ve; los
detecta `completitud`), el beneficio real es el opuesto y mayor, **8.756 saltos falsos contra 65**
→ [muestreo-variable](inconsistencias/muestreo-variable.md).)*

**Antes ese mismo día:** 2026-08-28 · *(**Corrección de hechos contra producción: seis
afirmaciones de esta memoria eran falsas.** Al construir la capa de algoritmos se consultó la
Supabase directamente y salió que el **SP722 no está "desde may-2026"** (corrió **18 días**, 360
lecturas, y paró 3 días antes que el resto), que el **albedo no tiene 19 meses sino 7** (la
reflejada se instaló el 2025-10-25), que **`intervalo_original_seg` NO da la cadencia del dato
guardado** (el eléctrico está a 5 min uniformes; esa columna es la cadencia del CSV de origen),
que **`radiacion_sc_15s` solo está a 15 s en octubre 2025**, que la **POA sí existe modelada**
(la memoria decía que no la teníamos) y que el **barrido de calidad vigila 14 de 26 variables**.
Además, **tres fallos silenciosos** que afirmaban que el dato estaba bien cuando no lo estaba:
321 + 837 hallazgos invisibles por buscar el nombre calibrado en una tabla que guarda el crudo,
la validez física aprobándose a sí misma contra las vistas corregidas, y la materialidad cierta
siempre con `n_dia = 0`. Los cuatro tienen la misma forma y viven juntos en
[silencio-leido-como-salud](inconsistencias/silencio-leido-como-salud.md). Números corregidos
(energía 1.522,78 kWh, rendimiento 864 kWh/kWp/año, completitud 0,444 vs 0,926) en
[verificacion-numeros](datos/verificacion-numeros.md).)*

**Y antes:** 2026-08-28 · *(**El doc de evaluación de datos redefine al Agente
Histórico, y se decide construir los algoritmos antes que el agente.** Llegó
`Evaluación de datos.pdf` de Leonardo Cardinale (el equipo lo llama "el doc de Hugo") y todo lo
que enumera (9 KPIs, series de tiempo, análisis estadístico, **4 familias de pruebas de calidad
con umbrales exactos** y 7 ejes de análisis energético) **son las métricas que evaluará el
Agente Histórico**. Decisión de Izack: primero los **algoritmos**, el agente después, porque
"el valor está en los tools que tiene el agente, y los tools son algoritmos". Contrato:
genéricos, entrada y salida tipadas, sin acoplarse a la UI, y **rango de fechas como parámetro
de primera clase**. El agente sí va a existir, pero para **acompañar a un experto humano**: el
experto pide analizar una variable en un rango, el agente compone las tools, presenta el dato y
aporta su lectura. Lo que el doc pide y **no tenemos**: sensores bifaciales traseros, viento y
precipitación (dos pruebas de validez física y un panel de la Fig. 6 se apoyan en datos que
ninguna de sus propias tablas contiene). Detalle en
[algoritmos-antes-que-agente](decisiones/algoritmos-antes-que-agente.md).)*

**Anterior:** 2026-08-26 · *(**La fuente del ETL pasa a ser la API pública de
AgroDash.** El store llevaba **33 días sin avanzar** mientras el ETL corría verde cada 15 min
trayendo cero filas: leía una réplica del dump congelada el 30-jun. La premisa que sostenía ese
arreglo era falsa, porque lo inalcanzable era el **puerto Postgres por tailnet**, no la app de
Cartago, que estuvo sirviendo dato de hace 30 segundos todo el tiempo. Las cajas SC además
**volvieron el 5-ago** tras 12 días caídas. La trampa que casi corrompe el store: `/readings` no
devuelve el instante real sino el **centro del bin**, y solo coincide en ventanas ≤ 2 h; medio
segundo de corrimiento no colisiona contra la PK `(serie_id, ts)` y habría duplicado el solape en
cada corrida. Validado comparando el **md5 de los timestamps** contra el store en 2.591 lecturas,
sin una divergencia. Detalle en [agrodash-api](proyecto/agrodash-api.md).)*

**Previo:** 2026-08-25 · *(**Servidor propio y consola desplegada.**
AgroVoltaic salió del EC2 de VisioneFlow: los dos agentes, la réplica de AgroDash y la consola
viven ahora en `VisioneMetrics`, detrás de nginx con TLS en `agro.visione-edge.com`. Se corrigieron
tres cosas que la doc daba por buenas y no lo eran: los servicios escuchaban en `0.0.0.0` (no en
loopback), el `Dockerfile` del Predictivo apuntaba a un módulo que el refactor borró, y la
renovación automática del certificado estaba **deshabilitada** pese a que certbot dijo lo
contrario. Detalle en [servidor-propio](proyecto/servidor-propio.md). **TODO decidido y pospuesto:**
unificar la orquestación en VisioneFlow cuando el Agente Histórico esté terminado, porque hoy hay
dos cerebros sobre las mismas tools: ver [abiertos](pendientes/abiertos.md).)*

**Previo:** 2026-08-21 · *(**Vocabulario unificado + vista «Base de datos» nueva.**
Los modos del agente pasaron por dos renombres hasta quedar en `medicion_visible` / `medicion_oculta`:
antes la misma cosa tenía cuatro nombres (servicio, chip, botón y variable decían cosas distintas) y
«modo backtest» era además falso, porque `/backtest` dibuja el gráfico en los dos. Al renombrar
apareció una **fuga real**: un modo inválido caía al modo PERMISIVO, o sea que quien pedía la medición
oculta recibía `backtest`. Ahora es 422, verificado en producción. Vista **«Base de datos»** nueva: el
recorrido del ETL en cinco actos con el dato a la vista, partido por la línea que separa lo
irreversible (al cargar) de lo reescribible (al consultar), más once tratamientos numerados como el
doc de Leo. Y las fichas de los tools ganaron **«En qué ayuda»**. Detalle en
[agente-predictivo](proyecto/agente-predictivo.md) y [mvp-debugger](proyecto/mvp-debugger.md).
**La extensión de Chrome no conecta**, así que toda la UI se verifica con `react-dom/server` — ver
[verificacion-consola](proyecto/verificacion-consola.md).)*

**Previo:** 2026-08-19 · *(**Solo el Agente Predictivo, y verificado end-to-end.**
El Agente Histórico quedó bloqueado en la consola con un flag de servidor reversible
(`AGENTE_HISTORICO=on`). 74 chequeos e2e, 0 fallas. Hallazgo que habría hundido la demo: el último
dato es de madrugada → se agregó el instante de referencia (`ahora` en `/forecast`).)*

**Antes:** 2026-08-18 · Cartago caído → el ETL lee una réplica del dump dentro de la EC2; llevaba
9 días fallando en silencio. Detalle: [agrodash-local](proyecto/agrodash-local.md) · riesgos abiertos
en [cuota-store-supabase](proyecto/cuota-store-supabase.md) y [superficie-expuesta](proyecto/superficie-expuesta.md).

**Y antes:** 2026-08-10 · Leo Cardinale validó el tratamiento de datos y con eso cayeron los
bloqueantes de geometría. Regla rectora: **crudo en la DB, corrección en capa de análisis**. Esquema
rediseñado, ETL re-corrido y capas de calibración y PR **en vivo**. Fuente de verdad:
[respuestas-leo-cardinale](decisiones/respuestas-leo-cardinale.md) · [implementacion](proyecto/implementacion.md).

## proyecto/ — qué es y en qué fase está
- [objetivo.md](proyecto/objetivo.md) — estandarizar CSV crudos y cargarlos a Supabase como pipeline automatizado y permanente
- [estado.md](proyecto/estado.md) — pipeline implementado y corrido OK (36.630 filas en Supabase); falta calibración y Paso 2 · **2026-08-28 al cierre:** capa de algoritmos terminada, barrido corrido en producción, Performance Ratio en revisión y **las vistas del frontend sin construir** · **2026-08-30:** Leo respondió las tres consultas, el PR sale de "bloqueado por terceros" y pasa a "hay que recalcularlo con la definición nueva" · **2026-08-31:** tres mediciones en un día, la energía AC (unidades en kWh, dos bugs de la vista, el contador sí sirve), el **PR con el método de Leo (gana el inclinado)** y el **inversor caído**, que cerró la consulta 2 y corrigió la atribución causal del veredicto · **y al cierre, todo eso implementado**: 462 tests en verde y **cero escrituras a producción** · **2026-09-01:** llegaron **57 CSVs nuevos** (base a **331 días / 45.270 filas**), **tres hechos que le reportamos al equipo quedaron falsos**, apareció una **alarma abierta** (el último día que tenemos la planta no generó nada) y **el frontend quedó terminado**
- [implementacion-decisiones-lcv.md](proyecto/implementacion-decisiones-lcv.md) — **NUEVO (2026-08-31):** la ronda que llevó las tres respuestas de Leo de medición a código, en un día. **353 → 462 tests en verde**, tres módulos nuevos más `analitica/contaminacion.py` (la firma de filas del piranómetro estaba en **tres sitios con tres criterios distintos**, por eso una medición contaba 466 filas y otra 490). Las correcciones que dejó: **`comparativa.py` tenía su propia definición de PR**, `QUE_ES` de 12 a 30, y el rango físico en **cinco** sitios. La decisión de diseño que hay que recordar: **el criterio de `_VIGILADAS` es asimétrico a propósito**, porque una clave de más produce silencio leído como salud y una de menos la canta `sin_vigilancia()`. **Nada escrito en producción todavía**: aplicar `sql/003` y re-correr el barrido son las dos únicas escrituras y las decide Izack
- [vistas-frontend.md](proyecto/vistas-frontend.md): **NUEVO (2026-09-01):** las **cinco vistas** del frontend de análisis, construidas sobre las fundaciones del 2026-08-28. Cierra **lo que faltaba del encargo original**. `/` Tablero, `/series`, `/estadistica`, `/calidad` y `/comparativa`, más `analitica/rendimiento`, `analitica/energia`, `analitica/variables`, paginación en `calidad/hallazgos` y el bloque `vigilancia` en `calidad/resumen`. **490 tests de backend, 235 de frontend, lint y tsc limpios.** Regla dura: **ninguna vista calcula**, todo número sale del backend (el proyecto ya pagó por tener el mismo indicador definido dos veces). Y lo que descubrió la vista de Calidad: **5.325 hallazgos de 28.509 no pueden pesar jamás en ningún veredicto**, porque su fuente no tiene denominador contable (las cuatro POA, `kt_star`, `cs_ghi_wm2`); ahora se publica separado en `hallazgos_en_el_periodo` y `cuentan_para_el_veredicto`
- [responsive-mvp.md](proyecto/responsive-mvp.md): **NUEVO (2026-09-03):** el responsive de las **siete pantallas** rehecho y desplegado. La banda pegajosa pasó de **226 px (25 % de la pantalla del teléfono)** a **52 px (6 %)**, y en `/consola` de **543 px (60 %)** a lo mismo. Tres hallazgos que no se veían leyendo el CSS: **768 px caía del lado equivocado del corte por 8 píxeles** (el ancho de tablet más común recibía la maqueta de escritorio), **`.app { align-items: flex-start }` estiraba el documento entero** en columna vía *shrink-to-fit*, y **una media query no aporta especificidad**, así que un override escrito antes que su regla base está muerto (dejó la barra de rango pegajosa ocupando **38 %**, peor que el defecto original). Se escribió un **auditor de las 627 reglas** de `globals.css` para el tercero. Verificación: **35 de 35 combinaciones sin desplazamiento lateral**, 318 pruebas, lint y tsc limpios
- [capa-analitica.md](proyecto/capa-analitica.md) — **NUEVO (2026-08-28):** la capa de algoritmos del Agente Histórico, construida y terminada. 13 módulos de `analitica/` + 11 de `calidad/pruebas/`, **325 tests sin base de datos**, **23 tools** y **10 endpoints** GET con errores tipados que salen 400/422 con `codigo`. Tres decisiones de arquitectura: **los algoritmos son funciones puras** (la misma sirve a la API, a la tool y al CLI, para que los tres den el mismo número), **el payload del LLM no es el de la API** (resumen sí, arrays no) y **un endpoint por algoritmo**, compuesto en el servidor con `Promise.all`. Los contratos de `catalogo.py` (`clave_calidad`, `origen_crudo`, `cobertura`, la guarda que revienta al importar) existen porque cada uno de esos olvidos ya costó una corrida · **2026-08-30: las respuestas de Leo obligan a cuatro cambios de algoritmo** (PR diario y mensual, energía del tablero en AC leída como contador que se reinicia, integración de irradiancia pesada por el salto real y no por `5/60` fijo, y la prueba de disponibilidad del equipo); **ninguno toca la arquitectura** · **2026-08-31: los cuatro implementados**, la suite a **462 tests**, y el pendiente de `QUE_ES` **cerrado** (12 → 30, derivadas del registro) → [implementacion-decisiones-lcv](proyecto/implementacion-decisiones-lcv.md)
- [consola-analitica.md](proyecto/consola-analitica.md) — **NUEVO (2026-08-28):** fundaciones del frontend de análisis. El análisis toma `/` y la consola de agentes se muda **entera** a `/consola`. ECharts 6 tree-shakeable con wrapper propio (**140 kB gzip menos, 38 %**), seis primitivas tipadas, el rango de fechas **en la URL**, eje en `useUTC` a propósito, y el contrato clave: el estado del gráfico es una **unión discriminada** donde `empty` **exige un motivo** y `missing` no tiene campo `value`, así que un `?? 0` no compila. ESLint instalado (no había): una violación real de `rules-of-hooks` y **187 errores** de deuda vieja, separada en `lint:todo`. **Las vistas todavía no están construidas** · **2026-09-01: las vistas YA están construidas** → [vistas-frontend](proyecto/vistas-frontend.md). Esta nota queda como el registro de las **fundaciones** y de por qué son como son
- [implementacion.md](proyecto/implementacion.md) — paquete `src/agrovoltaic`: diseño (cero columnas quemadas), estructura, idempotencia, bugs corregidos · ⚠️ **2026-08-31: este paquete define una vista que otro proyecto parametriza**, y regenerar el esquema desde el menú reintroduce los defectos que el otro acaba de corregir → [rango-fisico-en-cinco-sitios](inconsistencias/rango-fisico-en-cinco-sitios.md)
- [arquitectura-regiones.md](proyecto/arquitectura-regiones.md) — dos regiones (Cartago/AgroDash + San Carlos/Supabase), sin DB central; San Carlos está partido
- [capa-agentes.md](proyecto/capa-agentes.md) — Agente Histórico + Agente Predictivo; infraestructura consolidada (servicio Python aparte, batch, lee ambas DBs); **2026-08-28: el Histórico pasa a ser acompañante de un experto sobre un catálogo de algoritmos; ese catálogo se terminó el mismo día, así que el Histórico ya no espera manos sino dos costuras (`QUE_ES` con 12 tipos viejos contra 23, y `prompts.py` sin las tools nuevas)**
- [agente-predictivo.md](proyecto/agente-predictivo.md) — agente LLM que pronostica irradiancia + humedad de suelo vía clear-sky + kt*; dos modos (`medicion_visible` / `medicion_oculta`) y `GET /arquitectura`, que **deriva** el mapa del agente de `agent.MODOS` y los esquemas reales; **verificado e2e contra producción el 19-ago (72 chequeos, 0 fallas · 159 tests)**; instante de referencia para pronosticar con sol pese al congelamiento; cobertura real de la serie
- [servidor-propio.md](proyecto/servidor-propio.md) — **NUEVO (2026-08-25):** la plataforma salió del EC2 de VisioneFlow a uno propio (`VisioneMetrics`), con dominio, TLS y la consola desplegada en `agro.visione-edge.com`. Réplica de 6 GB movida por red privada y verificada por conteo exacto (21.314.662 filas). Los servicios **no estaban en loopback** como decía la doc: escuchaban en `0.0.0.0` y los tapaba solo el security group. El servidor **se apaga 19:00–07:00 y los fines de semana**, así que todo consumidor externo tiene que disparar en esa ventana
- [agente-historico-calidad.md](proyecto/agente-historico-calidad.md) — **NUEVO (2026-08-24):** control de calidad determinista del histórico PV (completitud contra las **horas de sol**, no contra 24 h) + caracterización del cielo (kt y variabilidad). Las tres trampas que costaron una corrida cada una: el **VI medía la cadencia del logger** (4,15 vs 23,81 para el mismo kt), los **kt imposibles se disfrazaban de día soleado** (kt medio 5,67), y **«sensor plano» eran tres cosas distintas** (85, cero, o trabado de verdad). Store `hallazgos_calidad` + `cielo_diario` + reporte + **vista «Calidad de datos» en la consola** (servicio :8020, mapa de días como calendario y no tabla, dos tiras por fuente: radiación 126 días ok contra eléctrico 4) · **2026-08-28:** tres fallos silenciosos más y el alcance real del barrido, **14 de 26 variables** → [silencio-leido-como-salud](inconsistencias/silencio-leido-como-salud.md) · **y ese mismo día el barrido completo corrió en producción**, con 23.533 hallazgos y cero días en verde → [store-hallazgos-calidad](datos/store-hallazgos-calidad.md) · **2026-09-01: `ventana_solar` resultó ser una dependencia oculta del veredicto**, y los `kt_imposible` pasan de 82/228 a **102/285** → [regla-post-carga](decisiones/regla-post-carga.md)
- [agente-historico.md](proyecto/agente-historico.md) — **NUEVO (2026-08-10):** agente Q&A sobre el histórico PV en Supabase; tools atómicas (SRP) sobre las vistas limpias; el LLM solo orquesta; MVP CLI, tools validadas contra la base
- [mvp-debugger.md](proyecto/mvp-debugger.md) — web local (Next.js) para depurar en vivo los agentes; **desde el 19-ago solo muestra el predictivo** (flag `AGENTE_HISTORICO`): visor de traza (tools+salidas+respuesta), explorador de datos read-only, tokens+costo por consulta y acumulado (`/preguntar`, `/datos/*`, `/uso`); **vista «Arquitectura del agente»** (grafo de nodos leído de `/arquitectura`, con hover y modales por herramienta, cada uno con «En qué ayuda»); **vista «Base de datos»** (el recorrido del ETL en cinco actos, con el dato a la vista en cada paso); + artifact de diseño en iteración · **2026-08-28: todo eso se mudó a `/consola`** y la sección principal pasó a ser el análisis → [consola-analitica](proyecto/consola-analitica.md)
- [integracion-visioneflow.md](proyecto/integracion-visioneflow.md) — agente montándose en VisioneFlow: servicio FastAPI /forecast HECHO (53 tests) + modelos agregados + deploy preparado (runbook docs/predictivo/04); bloqueante: la EC2 no alcanza la DB AgroDash (sin Tailscale)
- [conectividad-tailnet.md](proyecto/conectividad-tailnet.md) — malla Tailscale para acceso a datos: la EC2 (100.125.236.125) YA lee la DB viva de Cartago (100.101.177.71) por Postgres 5432, rol read-only `agrovoltaic_ro`, probado OK; pendiente: rotar la clave débil de prueba
- [pipeline-tiempo-real.md](proyecto/pipeline-tiempo-real.md) — pipeline arquitectura A (AgroDash→ETL→Supabase store→forecaster multi-variable irradiancia+humedad); congelamiento SC 23-jul → "solo histórico"; desplegado en la EC2 con timers (~812k filas backfilleadas)
- [agrodash-api.md](proyecto/agrodash-api.md) — **NUEVO (2026-08-26):** la **API pública** de AgroDash (`agrodash.nm.35-208-114-233.nip.io/api/v1`, sin credenciales ni tailnet) es la fuente del ETL. Dato vivo (~30 s) e historia completa. La trampa: `/readings` devuelve el **centro del bin**, no el instante real, y solo es exacto en ventanas **≤ 2 h**; `n == 1` NO alcanza como guarda porque a 3 h los timestamps ya están corridos y `n` sigue en 1. Pierde `origen_id` y `ts_medicion` (migración 003 los deja NULL). Validado por md5 de timestamps contra el store: 2.591 lecturas, cero divergencia
- [agrodash-local.md](proyecto/agrodash-local.md) — **SUPERADO el 2026-08-26** (era la fuente; ahora vuelta atrás) · **NUEVO (2026-08-14):** réplica del dump de AgroDash **restaurada en la EC2** (`agrodash-pg`, 127.0.0.1:5433) como fuente del ETL con Cartago caído; 5.045 MB / 21.3M filas → el dump completo NO cabe en la Supabase Free (500 MB); + script para levantarla local
- [cuota-store-supabase.md](proyecto/cuota-store-supabase.md) — **RESUELTO (2026-08-24):** la cuota estaba reventada (egress 103 %, disco 90 %) por **modelar una serie de tiempo como texto repetido**: 353 MB para 885.606 floats con solo 11 combinaciones distintas, e índices (192 MB) más pesados que los datos (161 MB). Normalizado sin perder un dato: base **415 → 150 MB (90 → 30 %)** y la bajada del forecaster **56 → 4,7 MB (11,8x)**. Migración 002
- [acceso-lectura-equipo.md](proyecto/acceso-lectura-equipo.md) — **NUEVO (2026-08-24):** por qué un cliente con la llave anon ve **0 filas y ningún error** (RLS activo sin políticas) y por qué una consulta grande devuelve «conexión cerrada» (`statement_timeout` de 3 s). El rol `joshua_ro` (login + BYPASSRLS + solo lectura + 120 s) por el session pooler
- [superficie-expuesta.md](proyecto/superficie-expuesta.md) — **NUEVO (2026-08-18):** qué escucha y qué es alcanzable en la EC2 (verificado desde fuera); 8000/8010 bindean `0.0.0.0` y solo los frena el security group; `/forecast/salud/ingesta` es público
- [verificacion-consola.md](proyecto/verificacion-consola.md) — **NUEVO (2026-08-21):** la extensión de Chrome NO conecta; cómo verificar la UI sin navegador (`tsc` + `react-dom/server`, 44 chequeos) y las trampas de la operativa local (`npm run build` con `next dev` vivo rompe el dev server)
- [metodologia.md](proyecto/metodologia.md) — metodología del equipo (San Carlos): variables, puntos de medición, arquitectura HW, frecuencias, periodos
- [evaluacion-datos.md](proyecto/evaluacion-datos.md) — plan de análisis/dashboard San Carlos: DataViz/Stats/Mining, 7 objetivos energéticos, Ridge, Colab · **AMPLIADO por el PDF del 2026-08-28**: quedó como resumen, el detalle está en los tres archivos nuevos; y su advertencia de que "no es para el Agente Histórico" **ya no aplica**
- [graficos-evaluacion.md](proyecto/graficos-evaluacion.md) — **NUEVO (2026-08-28):** especificación de las 8 visualizaciones del doc (grilla de 9 KPIs, filtro de calendario, `Data_Drifts` de completitud, series con trendline/media móvil/desviación, box plots mensuales + barras de GHI, ridge plot, scatter con OLS mostrando ecuación y R², heatmaps tipo carpeta día × hora) + 7 ambigüedades del doc, incluida la Fig. 8 duplicada y el scatter que grafica PAR vs GHI cuando el pie dice potencia vs irradiancia

## datos/ — el dataset y sus fuentes
- [fuentes-fisicas.md](datos/fuentes-fisicas.md) — 3 fuentes: inversor, piranómetros, DS18B20 · **+2 desde jun 2026** (Fliwer y nodos ESP32), que **no pasan por el ETL** y cuyos archivos todavía hay que ubicar · **CORREGIDO 2026-08-28 contra producción:** el SP722 corrió **18 días** (2026-05-11 a 2026-05-28, 360 lecturas), no "desde may-2026"; y reflejada/albedo arrancan el **2025-10-25**, no en 2024 · **2026-08-30: Leo explicó por qué** (las dos son mediciones adicionales incorporadas después, no un fallo), lo que no agranda la ventana · **CORREGIDO 2026-09-01: el SP722 no corrió 18 días.** Volvió el 2026-06-03 y son **8.984 lecturas hasta el 2026-08-31**, así que **se reabre como candidato a calibración**. Las otras tres filas de la tabla de ventanas son del corte viejo y **hay que re-medirlas**
- [dataset-actual.md](datos/dataset-actual.md) — carpeta NEW (285 CSVs), rango, NEW vs OLD · el corpus está **cerrado**: último dato 2026-06-01, 88 días de antigüedad al 2026-08-28 · **REESCRITO 2026-09-01: el corpus NO está cerrado.** Entraron 57 CSVs (2026-06-02 a 2026-08-31), el corpus son **342 archivos**, la base **331 días / 45.270 filas**, y los 57 nuevos traen **una sola cabecera de 27 columnas y ninguna fila mezclada**. ⚠️ La carpeta activa en disco contiene **solo los 57**, no los 342
- [agrodash-esquema.md](datos/agrodash-esquema.md) — esquema real de AgroDash (caja→sensor→reading, 34 tablas) y su calidad
- [agrovoltaic2025-db.md](datos/agrovoltaic2025-db.md) — DB de Joshua: re-volcado crudo + 1 tabla unificada SIN limpiar; veredicto: no adoptar
- [remodelado-propuesto.md](datos/remodelado-propuesto.md) — **HISTÓRICO/SUPERADO**: las vistas viejas (v_inversor/…) y `monitoreo_agrovoltaic` se dropearon; el split ahora es nativo del modelo crudo
- [diccionario-variables.md](datos/diccionario-variables.md) — variables fuente San Carlos (jun 2026): 3 tablas (PV/inversor+SP722, Fliwer, nodos ESP32) · **2026-08-31:** las columnas de energía están en **kWh** pese al sufijo `_wh`, y `energia_pv1_wh`/`pv2_wh` son **acumuladores diarios**, no energía del intervalo
- [correccion-filas-mezcladas.md](datos/correccion-filas-mezcladas.md) — spec del equipo para remapear filas de piranómetro (L/M/N/O) + par ground-truth original/corregido
- [verificacion-numeros.md](datos/verificacion-numeros.md) — **NUEVO (2026-08-21):** las consultas SQL que reproducen el antes/después del ETL; hay que re-correrlas cuando cambie el pipeline, porque las cifras de la consola son un corte fechado · **+ corte 2026-08-28:** cobertura por variable (no nulos), cadencia real por mes, energía integrada (1.522,78 kWh) y las dos completitudes · **+ corte 2026-08-31:** las nueve cifras de la energía AC que hay que poder reproducir (máximos con y sin la fila sucia, recorrido del contador de vida, cobertura de cada acumulador, razón AC/DC, factor de unidad, y la diferencia **cero** entre la vista corregida y la cruda) · ⚠️ **2026-09-01: TODAS sus cifras son de antes de la carga.** Las consultas valen, los resultados guardados no
- [catalogo-metricas-evaluacion.md](datos/catalogo-metricas-evaluacion.md) — **NUEVO (2026-08-28):** qué hay que calcular. Los **9 KPIs** del dashboard con sus definiciones textuales (la ventana de 7 días se ancla al **último día con dato**, no a hoy), los **7 ejes de análisis energético** con lo que el doc marca "más adelante" o "no tenemos", y las preguntas de investigación abiertas (abióticos, bióticos, eléctricos) · **2026-08-30:** la ambigüedad de qué columna es la energía oficial queda **cerrada (es AC)** y el **Performance Ratio pasa a diario y mensual**; el 1.522,78 kWh publicado es **DC**, otra magnitud · **2026-08-31:** el acumulador del inversor **no estaba descartado**, era un artefacto nuestro, y el 1.522,78 kWh está **subestimado un 14 %** por la integración
- [pruebas-calidad-umbrales.md](datos/pruebas-calidad-umbrales.md) — **NUEVO (2026-08-28):** las **4 familias de pruebas de calidad con umbrales exactos** (completitud, validez física, consistencia temporal, anomalías estadísticas; ref. BSRN), qué parte ya cubre el barrido del 24-ago y **8 ambigüedades**: ningún umbral declara la cadencia de referencia, y con 33 cadencias distintas en el histórico eso ya costó una corrida · **2026-08-28: las cuatro familias están implementadas** (`calidad/pruebas/`, 11 módulos) · **2026-08-30: el rango 100-280 V del voltaje AC sale de validez física** y se reemplaza por una prueba de **disponibilidad del equipo**, que es un eje distinto y no debería compartir severidad con la calidad del dato · **2026-08-31: esa prueba ya tiene forma cerrada y es una QUINTA familia**, en módulo propio, fuera de las cuatro del doc → [inversor-sin-acoplar](datos/inversor-sin-acoplar.md)
- [geometria-sistema.md](datos/geometria-sistema.md) — specs físicas confirmadas por Leo: 1420 Wp/arreglo (4×355 Wp), PV1=inclinado (20°/150°), PV2=vertical (90°/50°), bifaciales; insumo de calibración/PR · **2026-08-28: φ ≈ 0,80 queda SIN VALIDAR** (no refutado): la convergencia que lo estimaba salía de una muestra sesgada **y el argumento era circular**, porque esa convergencia se conseguía ajustando la irradiancia del vertical con el propio φ. Medido: en el vertical la cara trasera modelada aporta **+109 %** sobre la frontal (contra +15 % en el inclinado), así que casi la mitad de su irradiancia efectiva es modelo y no medición · **2026-08-30: Leo confirma el principio de trabajar con irradiancia por plano, pero la ecuación de transposición la define Hugo**; los PR de esta nota son todos **de la definición vieja** · **2026-08-31: el PR con la definición nueva ya existe** y confirma con el PR anual lo que esta nota dice de φ (el del vertical se duplica según la POA, 0,612 a 1,217; el del inclinado se mueve 14 %) → [performance-ratio-diario](datos/performance-ratio-diario.md)
- [inversor-sin-acoplar.md](datos/inversor-sin-acoplar.md) — **NUEVO (2026-08-31):** la detección del inversor caído que pidió R3, medida. **La premisa de Leo es falsa y su conclusión correcta**, registrado con las dos partes a propósito: no hay noche que medir (**7 filas** fuera de 05-17 h en todo el histórico) pero el 0 V coincide con **DC = 0 en 7.872 de 7.872** casos y el **97 % tiene el string sobre 50 V**. Regla: **07-17 fija, irradiancia como graduador y no como filtro** (de filtro pierde **8 días en silencio, 3 apagones de día entero**), **6.330 lecturas en 95 días** contra 7.954 en 238 de la vieja, con **32 días de apagón de más del 90 %** de la ventana. La ventana solar marca 224 días contra 95, tal como Leo anticipó. **Convergencia total con la medición de energía:** 41 de 202 días con la planta parada, y las dos reglas capturan **41 de 41**. Y la razón de fondo de sacarla del veredicto: **un día con la planta parada es un día con dato bueno sobre un sistema malo** · **2026-09-01: deja de ser historia.** El **código 302** en **661 registros de agosto**, y el **2026-08-26 y el 2026-08-31 con generación exactamente cero todo el día** (144 y 147 filas en error, 1.077 y 1.041 W/m², strings a 168 y 172 V, corriente cero). **El último día que tenemos, la planta no generó nada.** Disponibilidad **118 días parada, 86 con sol pleno**, sobre 331
- [performance-ratio-diario.md](datos/performance-ratio-diario.md) — **NUEVO (2026-08-31):** el PR con el método que pidió Leo (energía diaria contra irradiación diaria, agregado por mes y año según IEC 61724), sobre **197 días válidos de 228 con dato**. **Gana el INCLINADO** en las cinco particiones probadas: GHI **0,733 contra 0,517** (+41,6 %, gana los diez meses), POA bifacial **0,648 contra 0,612** (+5,9 %, gana ocho de diez y los dos que pierde son por 0,004). Confirma el bin de 5 min y contradice el join exacto: **tercera metodología independiente**. El método literal con el contador converge dentro del 2 % pero **tiene sesgo estacional** (solo 91 días, sin nov-feb). Tres avisos sin maquillar: el error de `5/60` **cambia de signo**, **43 de 197 días (22 %) tienen el inversor caído con sol pleno** (el PR pasa de 0,648 a 0,830 al excluirlos, sin cambiar el ganador), y **nov-2025 a feb-2026 es un régimen anómalo** con +27 % de potencia a igual irradiancia, sin explicación. Y el hallazgo de fondo: **el PR del vertical se duplica** según qué POA se use (0,612 a 1,217, imposible) mientras el del inclinado se mueve 14 %, así que **la mitad de su denominador es modelo**
- [energia-ac-tablero.md](datos/energia-ac-tablero.md) — **NUEVO (2026-08-31):** qué es realmente la energía AC del tablero, medido contra producción. Cierra el hueco que dejó la respuesta de Leo. **El contador del inversor sí sirve** (los 39 MWh eran una sola fila contaminada; sin ella, 2.710,7 kWh de vida y **0 reinicios en 19.889 lecturas**), **el hueco de cuatro meses no existe** (`energia_hoy_wh` cubre 118 días ahí), `energia_pv1_wh` y `energia_pv2_wh` son **acumuladores diarios** con solo **144 días** de cobertura, y la razón AC/DC medida es **0,958**, exactamente lo que predijo R7. **Tres totales distintos y los tres correctos**, porque miden ventanas distintas: 2.528,40 kWh de calendario, 1.777,68 de cierres diarios y 1.522,78 de integración DC (que subestima un 14 %)
- [store-hallazgos-calidad.md](datos/store-hallazgos-calidad.md) — **NUEVO (2026-08-28):** estado real de `hallazgos_calidad` tras correr el barrido completo en producción: de **3.158 a 23.533 filas**, 10 → **23 tipos**, 2 → **6 fuentes** (4.071 graves · 8.498 avisos · 10.964 info), idempotencia verificada. El problema que dejó: el veredicto por día quedó `ok=0 · aviso=16 · grave=258 · sin_datos=295`, o sea **ningún día en verde**, que no informa de nada. Causas medidas (el falso positivo `voltaje_vac = 0` en 238 días, las columnas AC contadas por tres detectores, el 85 °C) y la conclusión: **la señal útil es el bloque `confianza` por variable, no el semáforo del día**. Deuda sin resolver: **cuatro detectores para dos hechos** · **2026-08-30: el falso positivo de `voltaje_vac = 0` quedó RESUELTO** (Leo: el 0 es dato válido) · **2026-08-31, y corrige lo anterior: la atribución causal era FALSA.** Los conteos estaban bien, pero **quitar el rango 100-280 no mueve ni un día** (206 graves antes y después): esos 238 días ya estaban graves por otra cosa. Veredicto eléctrico real hoy: **206 grave · 68 aviso · 0 ok**. Bloqueantes reales en orden: **columna AC ausente 129 días** (triple contada), **DS18B20 111 días**, y **`ruido_excesivo` en aviso**, que hace el verde imposible por construcción (a `info` pasan **15 días a verde**). Hoy llega a verde **un solo día, el 2026-04-09**, y solo en el eje eléctrico. Más la trampa de implementación: la vista corregida anula esos ceros, así que la prueba de disponibilidad **tiene que leer el crudo** · **Ensayo del barrido nuevo (escrituras anuladas): 25.720 hallazgos y 190 filas de `inversor_sin_acoplar` en 96 días** (135 graves bajo sol, 37 avisos por irradiancia baja, **18 con motivo `sin_irradiancia`**, que son la prueba de que la regla no se calla). **El store todavía no cambió** · **2026-09-01: 34.408 hallazgos** tras la carga, y el hallazgo de la vista de Calidad: **5.325 de 28.509 no pueden pesar jamás en ningún veredicto** (fuentes sin denominador contable), ahora publicado como `hallazgos_en_el_periodo` contra `cuentan_para_el_veredicto`. ⚠️ **Hueco de auditoría:** el salto de 23.533 a 28.509 **no quedó registrado**

## inconsistencias/ — un archivo por problema (verificadas en NEW el 2026-06-01; las del 2026-08-28, contra producción)
- [schemas-multiples.md](inconsistencias/schemas-multiples.md) — 13 schemas, nombres inconsistentes · **2026-09-01: dejó de reproducirse en el dato nuevo.** Los 57 archivos del 2026-06-02 al 2026-08-31 comparten **1 sola cabecera** de 27 columnas: alguien estandarizó el logger. **No se archiva**: sigue siendo un hecho del histórico, y lo que cambia es **desde cuándo deja de pasar**
- [filas-mezcladas.md](inconsistencias/filas-mezcladas.md) — filas de distintas fuentes con ≠ nº de columnas · **2026-08-31: dos filas concretas envenenan los totales de energía**, la del `2025-10-07 07:45` (única de las 466 contaminadas que trae `energia_total_wh`, y la que hizo descartar el contador) y el último registro del `2026-03-09` (137,25 contra una mediana de 6,65, **8 % de error en cualquier total anual**) · **2026-09-01: confirmado con tres meses más**, las **8.822 filas nuevas traen las 27 columnas**, sin una excepción
- [irradiancia-sin-calibrar.md](inconsistencias/irradiancia-sin-calibrar.md) — valores negativos/irreales, offset −38.845 · **2026-09-01: sigue vivo en el dato nuevo** (pico **1.464,46 W/m²** el 2026-07-21, **102 días con kt imposible** sobre 285 caracterizados) y **el SP722 vuelve al juego** como segunda vía de calibración, independiente del clear-sky
- [temperatura-85.md](inconsistencias/temperatura-85.md) — saturación en 85.0 (error DS18B20)
- [muestreo-variable.md](inconsistencias/muestreo-variable.md) — de 2 s a 5 min según la época · **CORREGIDO 2026-08-28:** la cadencia real medida por mes (solo oct-2025 está a 15 s) y `intervalo_original_seg` **no** es la cadencia del dato guardado; regla de integración (salto real con techo de **900 s**) y de completitud (**moda** de los saltos) · **+ el criterio implementado** (moda de los saltos vecinos, ventana de 11) y **la corrección de una afirmación de esa misma sesión**: lo de los "1.018 huecos de una fila" era impreciso, el beneficio real son **8.756 saltos falsos contra 65**
- [gaps-temporales.md](inconsistencias/gaps-temporales.md) — gaps de 126 y 71 días + nuevos · **medido 2026-08-28:** 295 días sin datos en **26 tramos** (mayor de 125), corpus **detenido** desde 2026-06-01, y las **dos completitudes** que no hay que mezclar (0,444 calendario vs 0,926 días con registro) · **2026-08-31: primera cuantificación en energía**, y no en días: de 2.528,40 kWh que produjo la planta, **1.622,85 (el 64 %) se generaron en días que el datalogger no grabó** · **CORREGIDO 2026-09-01: el «corpus detenido desde el 2026-06-01» era FALSO.** Calendario **660 días**, **331 con dato**, cobertura **0,50**. Los gaps históricos no se movieron; lo que cambió es que el corpus **dejó de tener final**. Marcados como sin re-medir: tramos, completitud interna y el reparto de energía
- [duplicados.md](inconsistencias/duplicados.md) — archivos `(N)` duplicados y fragmentos
- [typos-headers.md](inconsistencias/typos-headers.md) — `Energì`, `POTencia`, `Corriente PV2[A]` · **2026-09-01: ninguno de los tres aparece en los 57 CSVs nuevos**
- [emparejamiento-por-timestamp.md](inconsistencias/emparejamiento-por-timestamp.md) — **NUEVO (2026-08-28):** el hallazgo más importante de la tanda. Cruzar dos tablas de cadencia distinta **por timestamp exacto** conservaba **4.369 de 28.996 lecturas (15 %)** y no de forma uniforme: **el 69 % de la muestra salía de octubre 2025 y mayo 2026**, los meses en que los dos registradores se alineaban. El sesgo **invierte el eje 1 del doc**: join exacto da PV1 0,622 · PV2 0,626 (gana el vertical), por bin de 5 min da **0,664 · 0,633** (gana el inclinado), y por vecino ±150 s da 0,665 · 0,634, o sea que **dos métodos independientes convergen**. Auditoría de todos los cruces: clear-sky limpio, PR y la nube de puntos de la Fig. 8 sesgados (su recta pasa de 0,636/R² 0,369 a 0,745/R² 0,401). Segundo hallazgo: **comparar contra la GHI horizontal castiga al vertical** (0,547 contra 0,906 con su propia POA), porque el sensor está montado en horizontal. Tercer hallazgo: **el PR del vertical depende casi proporcionalmente del factor bifacial φ y el del inclinado casi no** (su cara trasera modelada aporta +109 % contra +15 %), así que la comparación descansa sobre dos apoyos y arreglar el emparejamiento no arregla el otro → [geometria-sistema](datos/geometria-sistema.md). **Migración escrita y NO aplicada**: se avisa a Leo y a Hugo antes · **2026-08-30: Leo respondió cambiando la unidad de análisis**, así que el PR **deja de pasar por este cruce** (pasa a diario y mensual) y la migración deja de esperar a nadie: sigue siendo pertinente solo para los cruces **punto a punto**. El segundo hallazgo (comparar el vertical contra la GHI horizontal lo castiga) queda **confirmado** → [respuestas-lcv-consultas-agosto](decisiones/respuestas-lcv-consultas-agosto.md) · **2026-08-31: dos confirmaciones más.** El PR diario confirma este archivo (0,648 / 0,612 con POA bifacial, casi encima del bin de 5 min) → [performance-ratio-diario](datos/performance-ratio-diario.md); y en la prueba de inversor caído el join exacto encuentra irradiancia para **818 de 6.330** lecturas (pierde el **87,1 %**) contra 5.979 con `date_bin`, que es **la primera vez que el sesgo aparece en una prueba de calidad** y no en una métrica → [inversor-sin-acoplar](datos/inversor-sin-acoplar.md)
- [rango-fisico-en-cinco-sitios.md](inconsistencias/rango-fisico-en-cinco-sitios.md) — **NUEVO (2026-08-31):** el rango de validez del voltaje AC estaba escrito en **cinco** lugares y no en tres, y los dos que faltaban viven en el **otro proyecto**: `src/agrovoltaic/ddl.py` (el generador del ETL, con su **propio config**) y `sql/schema.sql`, que es **generado**. Con los tres primeros arreglados, **bastaba regenerar el esquema desde el menú del ETL para reintroducir los dos defectos completos**, y no hacía falta que nadie se equivocara: bastaba hacer **lo correcto** en el otro repo. Corregido en los cinco, pero **la causa sigue viva**: la misma vista está definida en dos proyectos, con configs distintos y sin nada que obligue a que coincidan
- [unidades-energia-kwh.md](inconsistencias/unidades-energia-kwh.md) — **NUEVO (2026-08-31):** el sufijo `_wh` de las cuatro columnas de energía **miente**: están en **kWh**. Medido por dos vías (razón **1.003,58** contra `potencia_total_wac` integrada sobre 127 días, y rendimiento específico implícito de máximo **5,00 kWh/kWp/día**). Importa porque **el error no avisa**: el nombre invita a dividir entre 1000 y el resultado, mil veces más chico, no choca con nada a simple vista. Sin decidir si se renombra a `_kwh` (obliga a re-correr el ETL) o se deja documentado
- [vista-corregida-no-corrige.md](inconsistencias/vista-corregida-no-corrige.md) — **NUEVO (2026-08-31):** dos bugs de `v_sc_electrico_corregido`, y hacen daño en direcciones opuestas. **No limpia lo que debería:** las cuatro columnas de energía pasan sin ningún `CASE`, así que la vista devuelve los mismos 39 MWh que la cruda (diferencia **0** en filas y en todos los máximos). **Y limpia lo que no debería:** el `CASE` de `voltaje_vac` anula los **7.873 ceros** que Leo declaró dato válido, con lo que la prueba de disponibilidad del equipo **no se puede implementar sobre la vista**, tiene que leer el crudo. El segundo es el mismo patrón de [silencio-leido-como-salud](inconsistencias/silencio-leido-como-salud.md), ahora con "cero inversores caídos" en vez de "cero valores imposibles". **Ninguno de los dos está arreglado** · **2026-08-31: los `CASE` se ELIMINAN, no se ensanchan** (el techo de 280 V no dispara nunca, máximo 218,8; el de 65 Hz tampoco, máximo 60,06: solo servían para borrar ceros), y hay que tocar **tres sitios a la vez** (`config.py:76`, `analitica/catalogo.py` y la vista), porque olvidar cualquiera **falla en silencio** · **corregido el mismo día: eran CINCO** → [rango-fisico-en-cinco-sitios](inconsistencias/rango-fisico-en-cinco-sitios.md). Los sitios de código ya están arreglados y `sql/003` está **escrita y validada pero NO aplicada**
- [silencio-leido-como-salud.md](inconsistencias/silencio-leido-como-salud.md) — **NUEVO (2026-08-28):** cuatro fallos con **la misma forma** (la ausencia de señal leída como señal de que todo está bien), tres de ellos vivos en producción: **321 + 837 hallazgos invisibles** por buscar el nombre calibrado en una tabla que guarda el crudo; la **validez física aprobándose a sí misma** al leerse contra las vistas corregidas, que ya borraron lo imposible; la **materialidad `n_afectadas >= 0,20 × n_dia` siempre cierta con `n_dia = 0`**; y el alcance real del barrido, **14 de 26 variables**. Las 6 reglas de diseño que salen de ahí (cero hallazgos nunca se reporta solo, `sin_hallazgos` ≠ `sin_cobertura`, la validez física se lee contra el crudo) · **2026-08-31: tres casos más.** Un sexto vivo en producción (la vista corregida borrando los ceros del voltaje AC → [vista-corregida-no-corrige](inconsistencias/vista-corregida-no-corrige.md)), y dos que estuvieron a punto de entrar: la **irradiancia usada como filtro se apaga sola** en los 46 días sin dato y no lo dice, y **`NOT (...)` en vez de `IS NOT TRUE`** pierde la mitad del histórico (35.979 filas a 18.005) sin un solo aviso. Más una de lectura: confundir "esta prueba marca 238 días" con "esta prueba causa que 238 días estén en rojo" · **+ el cuarto vivo en producción**, la llamada **posicional** a `confianza` que desactivaba el acotado (**274 días utilizables reportados cuando eran 45**; 190 días cambiaban de veredicto con lo eléctrico), con su trampa de diseño: un parámetro opcional cuyo valor por omisión devuelve el número más grande y más plausible. **Los cuatro fallan hacia el mismo lado: declarar sano lo que no lo es** · **+ el QUINTO que falla hacia el lado tranquilizador (2026-09-01):** el veredicto contando sobre `ventana_solar`, una tabla de apoyo que terminaba tres meses antes. Lo distinto: **no es un bug en una expresión, es una dependencia entre pasos que no estaba escrita** → [regla-post-carga](decisiones/regla-post-carga.md)

## decisiones/ — qué decidimos y por qué
- [decisiones.md](decisiones/decisiones.md) — resampleo, gaps, duplicados, schema destino; **2026-08-10 giro a "crudo en DB + corrección en análisis"** (superó 85→NULL, offset→0, resampleo-todo) · **2026-08-30: decisiones de cálculo** (PR diario y mensual, energía del tablero en AC, voltaje AC en cero válido) · **2026-08-31: la disponibilidad del equipo NO es calidad del dato**, con la regla completa (07-17 fija, irradiancia como graduador) y el módulo propio, **ya implementado** · y **el criterio asimétrico de `_VIGILADAS`**: una clave de más produce silencio leído como salud, una de menos la canta `sin_vigilancia()`, así que ante la duda se deja fuera · **2026-09-01: la regla operativa de post-carga** (`historico todo`, nunca solo `barrido`) → [regla-post-carga](decisiones/regla-post-carga.md)
- [regla-post-carga.md](decisiones/regla-post-carga.md): **NUEVO (2026-09-01):** después de cargar datos nuevos se corre **`historico todo`** (sol, barrido, cielo, reporte, **en ese orden**) y nunca solo `barrido`. Cada paso escribe el denominador del siguiente: el calendario del veredicto no sale de la tabla de datos sino de la tabla de apoyo **`ventana_solar`**, así que un barrido suelto escribe hallazgos que el veredicto **no puede ver** y devuelve un número plausible y viejo (**274 días con datos con la base ya en 331**), sin error ni advertencia. Lo distinto de los otros cuatro fallos de la familia: no es un bug en una expresión, es una **dependencia entre pasos que no estaba escrita en ningún lado**
- [latencia-manda-sobre-el-sql.md](decisiones/latencia-manda-sobre-el-sql.md) — **NUEVO (2026-09-01):** las cinco vistas cargaban lento y **no era el SQL**. Contra el pooler de Supabase (us-east-1) un `SELECT 1` tarda **225 ms**, así que el tiempo de un endpoint es esencialmente **`viajes × 225 ms`** y las consultas en sí son casi gratis. Tres palancas, ninguna toca un plan de ejecución: **fusión** de los tres insumos del bloque `confianza` en una sola consulta (viaja dentro de casi toda respuesta agregada, así que baja dos viajes en diez endpoints), **concurrencia** de las consultas independientes de cada endpoint (`db.en_paralelo`, con el anidamiento corriendo en fila a propósito para no colgar el ejecutor) y un **caché de 10 s cuya ganancia es la coalescencia**, no el TTL: la consola pide con `Promise.all` y sin ella las cinco peticiones fallarían el caché a la vez. Suma de los 15 endpoints **14,0 s → 3,8 s** a 30 días y **22,3 s → 7,2 s** en el histórico completo; con 5 vistas simultáneas la peor pasa de **2,88 s a 0,98 s**. El criterio de aceptación no fue el tiempo sino que **no cambiara ni un número**: 122.295 hojas comparadas en 5 rangos (dos vacíos), **cero diferencias**
- [verificar-midiendo-el-dom.md](decisiones/verificar-midiendo-el-dom.md): **NUEVO (2026-09-03):** el responsive **no se verifica con capturas**, se recorre el DOM real y se clasifica el desbordamiento, porque lo que hay que detectar es el contenido **recortado sin barra de desplazamiento**, que es invisible tanto en pantalla como en la foto (misma familia que [silencio-leido-como-salud](inconsistencias/silencio-leido-como-salud.md)). La trampa cara: **`--window-size` no produce un viewport real bajo ~500 px en macOS**, Chrome recorta la imagen pero evalúa las media queries con otro ancho, así que dos verificaciones dieron falso justo en la franja del problema; hay que usar `Emulation.setDeviceMetricsOverride`. Más: **todo informe lleva prueba de vida** (un informe limpio y una página que no cargó se ven igual), **el que desborda casi nunca es el que hay que arreglar**, y los **tres falsos positivos** que denunciaban el arreglo como defecto
- [respuestas-leo-cardinale.md](decisiones/respuestas-leo-cardinale.md) — **fuente de verdad**: respuestas verbatim de Leo P1–P12 + los 4 datos pendientes (doc rev LCV, 2026-08-10). **PRIMERA ronda**, sobre el *tratamiento* de los datos
- [respuestas-lcv-consultas-agosto.md](decisiones/respuestas-lcv-consultas-agosto.md) **NUEVO (2026-08-30):** **segunda ronda** de respuestas de Leo, esta vez sobre *cómo se calculan las métricas*. Cierra tres consultas: el **Performance Ratio pasa a diario y mensual** (acumuladores de energía contra radiación integrada del día, y el emparejamiento fino queda para los análisis punto a punto), **`voltaje_vac = 0` es dato válido** (se retira el rango 100-280 V y entra una prueba de **disponibilidad del equipo**: las tres variables AC en 0 entre las 7:00 y las 17:00, refinable por irradiancia > 300 W/m²) y la **energía del tablero es AC** (`energia_hoy_wh` / `energia_total_wh`, contadores que se reinician, así que no se leen con `max()`). **Abierta una sola:** cuál ecuación de transposición, la confirma **Hugo**. Citas verbatim en `../referencia/respuestas-lcv-consultas.md`. Incluye las tres advertencias técnicas que su respuesta da por sentadas y nuestro dato no cumple (`5/60` supone cadencia de 5 min, los 39 MWh salieron de la tabla contaminada, y la irradiancia pre-julio-2025 es NULL) · **2026-08-31: los huecos que dejaba marcados ya se midieron** → [energia-ac-tablero](datos/energia-ac-tablero.md)
- [algoritmos-antes-que-agente.md](decisiones/algoritmos-antes-que-agente.md) — **NUEVO (2026-08-28):** el PDF de Leonardo Cardinale define las métricas del Agente Histórico, y se construyen **primero como algoritmos**: el valor está en los tools y los tools son algoritmos. Contrato de tool (entrada y salida tipadas, sin UI, rango de fechas de primera clase) y agente después, para **acompañar a un experto**, no para automatizar · **EJECUTADA el mismo día** → [capa-analitica](proyecto/capa-analitica.md)
- [alcance-agente-historico.md](decisiones/alcance-agente-historico.md) — **MATIZADO el 2026-08-28** (su tesis sigue en pie, pero ahora el alcance tiene lista concreta y la secuencia cambió) · **NUEVO (2026-08-26):** el Histórico es el agente **de los CSV**, no de AgroDash. Son dos temas: el corpus CSV es finito e **irremplazable** (su trabajo es cerrarse bien), AgroDash es un flujo reconsultable (su trabajo es vigilarse). El dato vivo **ya está en la misma base** que lee el Histórico (1,1 M filas, 3 min de rezago): que no esté conectado es decisión, no olvido

## pendientes/ — lo que bloquea y lo que falta decidir
- [correccion-al-equipo.md](pendientes/correccion-al-equipo.md): **NUEVO (2026-09-01) y es LO MÁS URGENTE.** El documento que se le envió al equipo el 2026-08-28 tiene **tres afirmaciones que ya no son ciertas**: que el sistema dejó de reportar el 2026-06-01 (**nunca dejó**), que el SP722 solo tiene 18 días y 360 lecturas (**son 8.984 hasta el 2026-08-31**, y con eso **se reabre el descarte para calibración**), y que el albedo tiene 7 meses de ventana (**vencida, son ~10**; el conteo exacto está **sin medir** y va marcado como hueco). Va primero porque **hay alguien del otro lado trabajando sobre un hecho equivocado**: Leo respondió *"vamos a revisar esto"* sobre un corte que no existió. Más una cuarta cosa que el equipo tiene que saber aunque no esté en el documento (**los 13 esquemas se terminaron**) y el diagnóstico de por qué pasó: las tres se midieron bien contra la base, y la base estaba al día con **nuestra descarga**, no con la planta
- [abiertos.md](pendientes/abiertos.md) — **NUEVO (2026-08-21):** lo que depende de NOSOTROS: volumen del contenedor (885k filas cada 6 h), addon NWP apagado (−8 % MAE a 6 h), 32 commits sin pushear, NSRDB sin evaluar · **2026-08-30: frente nuevo con las respuestas de Leo**, que ya no es espera sino trabajo: ~~recalcular el PR diario y mensual~~ (**hecho el 2026-08-31**, falta llevarlo al código), integrar la irradiancia pesando por el salto real, ~~volver a medir los cuatro acumuladores de energía~~ (**hecho el 2026-08-31**) y re-correr el barrido · **frente nuevo del 2026-08-31:** decidir qué se hace con el sufijo `_wh`, con el día 2026-03-09 y con **la severidad de `ruido_excesivo`** (es lo que hace el verde imposible) · **y al cierre del día, tras la ronda de implementación:** aplicar `sql/003` y re-correr el barrido (**las dos únicas escrituras a producción, decide Izack**), enseñarle a `contexto.py` a contar `radiacion_sc_poa` (lo único que bloquea vigilar la POA) y **hacer obligatorio el parámetro `variables` de `confianza`** · **2026-09-01: lo primero de toda la lista es la corrección al equipo.** Frente nuevo de la carga: **reabrir la calibración con el SP722**, que el barrido **no pueda correr en silencio sobre un calendario corto**, y **re-medir todo lo que la carga dejó viejo**. Y **las vistas del frontend salen de la lista**: hechas
- [pendientes-evaluacion-datos.md](pendientes/pendientes-evaluacion-datos.md) — **NUEVO (2026-08-28):** lo que el doc pide y no tenemos · **2026-08-30: las tres consultas volvieron respondidas** y con ellas se cierra la decisión de qué columna es la energía oficial (es AC); las otras cuatro decisiones de alcance siguen abiertas. **Sensores bifaciales traseros** (lo declara el propio doc; la **POA salió de esta lista el 2026-08-28**: existe modelada en `radiacion_sc_poa`), **viento y precipitación** (lo detectamos nosotros: dos pruebas de validez física y el panel WS de la Fig. 6 se apoyan en variables que ninguna de sus tres tablas contiene), y una **temperatura ambiente neutra**, fuera del microclima de los cultivos. Además: dónde viven los datos **Fliwer** (SharePoint del TEC, Wayner Montero) y de los **nodos ESP32** (Google Drive), y si los Fliwer de Wayner son los mismos 4 dispositivos que ya usó el barrido de calidad
- [bloqueantes.md](pendientes/bloqueantes.md) — **2026-08-10 casi todo RESUELTO por Leo** (kWp, tilt/azimut, PV1/PV2, constante de calibración); queda el mapeo caja→sitio fino para el Agente Histórico · **2026-08-30: se cerraron las tres consultas de agosto y se abrió una sola pregunta**, cuál **ecuación de transposición** usar, que la confirma **Hugo**; además Leo se llevó para revisar **por qué el sistema dejó de reportar el 2026-06-01** · **2026-09-01: el punto 11 se CIERRA y no por Leo**, la pregunta estaba mal hecha (el sistema nunca dejó de reportar), pero **hay que avisarle** antes de que alguien vaya a campo. Dos entradas nuevas: **qué significa el código de error 302** y **la planta está parada hasta donde llega el dato**

## contexto-externo/ — sistemas relacionados
- [agrodash.md](contexto-externo/agrodash.md) — DB de Cartago y objetivo de comparación; suelo/riego/experimentos, NO fotovoltaica; contiene ambos sitios

---

## Material fuera de la memoria (en `../`, agrupado por carpeta)

Detalle largo, binarios y material de apoyo. La memoria de arriba los cita cuando hace falta.

### analisis/ — análisis puntuales
- `../analisis/cambios-2026-08-18.html` — resumen de los 19 commits del 14–17 ago (réplica de AgroDash en la EC2, 6 tareas de confiabilidad, doc de arquitectura) + verificación en vivo y riesgos

### referencia/ — documentos largos de detalle
- `../referencia/EDA-Monitoreo-AgroVoltaic.md` — análisis exploratorio completo (los 13 schemas, calidad, gaps)
- `../referencia/TODO-Pipeline-Limpieza.md` — diseño del pipeline de 12 pasos · **HISTÓRICO: ya implementado**, ver [implementacion](proyecto/implementacion.md)
- `../referencia/columnas-supabase.md` — diccionario de columnas de la tabla `monitoreo_agrovoltaic` (qué es cada una)
- `../referencia/brief-evaluacion-datos.md` — **NUEVO (2026-08-28):** el brief técnico que leyeron todos los equipos. Traduce el PDF de evaluación a decisiones de implementación **ya verificadas contra la base**: volúmenes reales, cobertura por variable, la regla de que **los timestamps NO son UTC** (son hora local etiquetada `+00`, y meter un `AT TIME ZONE` corre seis horas todos los perfiles diarios), las vistas que ya existen, el contrato compartido, los umbrales exactos y el estándar de código. Si choca con el PDF, manda el PDF
- `../referencia/medicion-inversor-caido.md` — **NUEVO (2026-08-31):** la medición que cierra la consulta 2, con el SQL, la distribución horaria del 0 V, las cinco variantes de regla comparadas y las dos trampas de leer la tabla cruda (`IS NOT TRUE` contra `NOT(...)`, y descartar por firma y no por el rango de la variable que se mide) → [inversor-sin-acoplar](datos/inversor-sin-acoplar.md)
- `../referencia/medicion-pr-diario.md` — **NUEVO (2026-08-31):** la medición del Performance Ratio con el método de Leo, con el SQL completo, la serie diaria de los 228 días (anexo A) y los 31 días descartados con su motivo (anexo B) → [performance-ratio-diario](datos/performance-ratio-diario.md)
- `../referencia/medicion-energia-ac.md` — **NUEVO (2026-08-31):** la medición de solo lectura que cierra la consulta 3, con las consultas SQL completas y sus CTE (hallazgo cero de unidades, contaminación cruda contra vista, cobertura mensual, reset de cada acumulador, qué son `energia_pv1_wh`/`pv2_wh`, y coherencia AC contra DC) → [energia-ac-tablero](datos/energia-ac-tablero.md)
- `../referencia/respuestas-lcv-consultas.md` — **NUEVO (2026-08-30):** las respuestas **verbatim** de Leo Cardinale a las tres consultas, extraídas de las anotaciones PDF de `consultas-sobre-la-data-Rev-LCV.pdf`. **Es la fuente**: no se parafrasea al implementar, y si algo no cuadra con el dato se anota como discrepancia y se consulta → [respuestas-lcv-consultas-agosto](decisiones/respuestas-lcv-consultas-agosto.md)
- `../referencia/ObjetivosProyecto.md` — plan de la pasantía (contexto académico)
- `../referencia/agrodash-control-schema.sql` — esquema real de AgroDash (DDL, sin secretos)
- `../referencia/Metodologia-Agrivoltaic.docx` — doc fuente de la metodología (San Carlos) → [metodologia](proyecto/metodologia.md)
- `../../Evaluación de datos.pdf` (**raíz del repo**) — **VERSIÓN VIGENTE (2026-08-28)** del doc de evaluación de datos, de Leonardo Cardinale Villalobos; el equipo lo llama "el doc de Hugo". 12 páginas, figuras en 3-8 → [catalogo-metricas-evaluacion](datos/catalogo-metricas-evaluacion.md), [pruebas-calidad-umbrales](datos/pruebas-calidad-umbrales.md), [graficos-evaluacion](proyecto/graficos-evaluacion.md). *Conviene moverlo a `referencia/` junto al resto*
- `../referencia/Evaluacion-de-datos.docx` — doc fuente del diccionario + plan de análisis (**versión de junio, superada por el PDF de arriba**) → [evaluacion-datos](proyecto/evaluacion-datos.md), [diccionario-variables](datos/diccionario-variables.md)
- `../referencia/temp_tail_ridge_plot.py` — código de referencia del análisis Ridge (DataStats)
- `../referencia/correccion-filas-mezcladas/` — PNG anotado + par CSV original/corregido (ground-truth Paso 2) → [correccion-filas-mezcladas](datos/correccion-filas-mezcladas.md)

### conceptos/ — material pedagógico (cómo funciona el sistema)
- `../conceptos/glosario.md` — términos del dominio (panel, string, irradiancia, albedo, bifacial)
- `../conceptos/sistema-fotovoltaico.html` — anatomía de un sistema fotovoltaico
- `../conceptos/panel-desnivel-electrones.html` — por qué nace la corriente en el panel
- `../conceptos/proceso-datos-agrovoltaico.html` — diagrama "de la luz al dato" (sol → Supabase)
- `../conceptos/anticipacion/` — **NUEVO (2026-08-19):** el selector de anticipación explicado sin jerga, con el ejemplo real del 22-jul 08:00 y las dos advertencias al comparar errores entre resoluciones (`.html` fuente + `.pdf` de 2 páginas)

### equipo/ — interacción con el equipo de campo / profesor
- `../equipo/consultas-sobre-la-data.pdf` (+`.txt`) — **NUEVO (2026-08-28):** tres consultas para el grupo, en impersonal y sin dar por sabido nada del stack: el **emparejamiento del Performance Ratio** con su evidencia mes a mes, si **`voltaje_vac = 0`** es válido (238 días de veredicto en juego), y si la **energía del tablero es continua o alterna**. Más tres hechos de contexto. La evidencia completa del primer punto vive además en un documento web: https://claude.ai/code/artifact/733783d8-9789-47dd-8406-72ead07787c0 · **VOLVIÓ RESPONDIDO el 2026-08-30** como `../../consultas-sobre-la-data-Rev-LCV.pdf` (raíz del repo) → [respuestas-lcv-consultas-agosto](decisiones/respuestas-lcv-consultas-agosto.md) · ⚠️ **2026-09-01: TRES DE SUS AFIRMACIONES SON FALSAS** y hay que enviar una corrección (el sistema nunca dejó de reportar, el SP722 no corrió 18 días, y la ventana del albedo ya no es de 7 meses). **Es lo más urgente del proyecto**, porque Leo se llevó a revisar un corte que no existió → [correccion-al-equipo](pendientes/correccion-al-equipo.md)
- `../equipo/DUDAS-Pendientes.md` (+`.pdf`) — 17 preguntas para el equipo de campo
- `../equipo/Preguntas-Profesor-CapaAgentes.pdf` — preguntas para definir la capa de agentes
- `../equipo/Preguntas-Profesor-Tratamiento-Datos.pdf` — consulta al profesor: decisiones de tratamiento con opciones y preguntas P1–P12 (nomenclatura, 85 °C, offset, filas mezcladas, resampleo, umbrales, calibración); breve/no técnica; lo ya respondido por el diccionario/metodología va como nota, no como pregunta
- `../equipo/Hallazgos-Datos-Monitoreo-SanCarlos.pdf` — hallazgos y tratamiento aplicado (base del PDF de preguntas)
- `../equipo/Minuta_Reunion_2025-06-24.pdf` — minuta de reunión

### _archivo/ — histórico / desactualizado (no usar como fuente actual)
- `../_archivo/referencia_api_agrodash.pdf` — PDF de AgroDash (DESACTUALIZADO; usar el `.sql` real)
- `../_archivo/Need.md` — nota cruda de la capa de agentes, ya destilada en [capa-agentes](proyecto/capa-agentes.md)
