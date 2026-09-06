---
name: abiertos
description: Trabajo pendiente que depende de NOSOTROS (no de terceros): ofrecido y no autorizado, deuda conocida y decisiones sin tomar. Lo primero de la lista desde el 2026-09-01 es enviarle al equipo la corrección de tres hechos falsos que ya le dimos
categoria: pendiente
actualizado: 2026-09-03
tags: [pendientes, deuda, decisiones]
---

# Pendientes abiertos

Distinto de [bloqueantes](bloqueantes.md), que son cosas que dependen de **terceros**. Esto
depende de nosotros: está ofrecido, medido o identificado, y falta decidir o hacer.

## ⚠️ Lo primero de toda la lista (2026-09-01): la corrección al equipo

**El documento que le enviamos al equipo el 2026-08-28 tiene tres afirmaciones falsas**, y sobre una
de ellas Leo ya se llevó trabajo (*"vamos a revisar esto"* sobre un corte del sistema que nunca
ocurrió). Va antes que cualquier otra cosa de este archivo porque **hay alguien del otro lado
trabajando sobre un hecho equivocado** → [[correccion-al-equipo]].

## Frente que abre la carga del 2026-09-01

Entraron 57 CSVs del 2026-06-02 al 2026-08-31 ([[dataset-actual]]) y dejaron esta cola. Todo depende
de nosotros:

- **REABIERTO: calibrar la irradiancia contra el SP722.** Estaba **cerrado por ventana
  insuficiente** (18 días, 360 lecturas), y esa ventana era falsa: son **8.984 lecturas del
  2026-05-11 al 2026-08-31**, casi cuatro meses de solape con el piranómetro viejo. Hay que comparar
  `irradiancia_incidente` contra `Irradiancia_incidente_SP722` y `albedo` contra `Albedo_SP722` y
  ver si la relación es constante, recta con offset o nada. **Es la primera vía de calibración
  independiente del clear-sky que aparece en el proyecto**, y puede no dar nada: lo que cambió es
  que el argumento para no intentarlo desapareció ([[fuentes-fisicas]],
  [[irradiancia-sin-calibrar]]).
- **Que el barrido no pueda correr en silencio sobre un calendario corto.** Hoy la regla es
  operativa (correr `historico todo` en orden, [[regla-post-carga]]) y depende de acordarse. Lo
  correcto es que **el barrido avise o se niegue cuando `ventana_solar` no cubre el rango pedido**.
  Es la regla 1 de [[silencio-leido-como-salud]] aplicada a una tabla de apoyo.
- **Re-medir lo que la carga dejó viejo, antes de citarlo.** Quedaron marcados como huecos: la
  ventana y el conteo de `irradiancia_reflejada` y `albedo` ([[fuentes-fisicas]]), el número de
  tramos sin datos y la completitud dentro de los días con registro ([[gaps-temporales]]), y el
  reparto de energía entre días registrados y no registrados ([[gaps-temporales]],
  [[energia-ac-tablero]]). Todos siguen citados con cifras del corte del 2026-08-28 o del
  2026-08-31.
- **Reconstruir de dónde salen los 28.509 hallazgos.** La memoria documenta 23.533 al 2026-08-31 y
  el 2026-09-01 la cuenta arranca en 28.509: **la corrida intermedia no quedó registrada**
  ([[store-hallazgos-calidad]]).
- **Explicar la diferencia de 21 filas entre los CSV y la base** en la tanda nueva (8.822 filas de
  datos en los CSV, 8.801 filas eléctricas nuevas en la base; y 663 contra 661 registros con
  `codigo_error = 302` en agosto). No cambia ninguna conclusión, pero es una discrepancia sin
  explicar entre dos fuentes que deberían coincidir ([[inversor-sin-acoplar]]).
- **Decidir qué se hace con la carpeta del dataset.** `dataset/Monitoreo-AgroVoltaic-SC-NEW/`
  contiene hoy **solo los 57 archivos nuevos** y la carpeta `...-OLD/` ya no existe en disco; los
  285 históricos están en el `.zip` y en la base. Quien re-corra el ETL sobre "la carpeta activa"
  hoy procesa 57 archivos, no 342 ([[dataset-actual]]).

## Frente que abre el responsive (2026-09-03)

- **Decidir si la barra de rango vuelve a quedar pegada en portátiles de 13 pulgadas.** Hoy deja de
  ser pegajosa por debajo de 1280 px de ancho **o** 880 px de alto, porque en esa pantalla ocupa el
  16,5 % y el criterio adoptado es 15 %. Es una pérdida real del "siempre a la vista" a cambio de
  cumplir el criterio: **se le planteó al usuario y todavía no contestó**. Cambiar el `879` de la
  consulta lo revierte → [[responsive-mvp]].
- **Deuda del frontend anotada al medir, ninguna urgente:** `bars.ts` reserva 96 px fijos para las
  etiquetas de barra horizontal (un tercio del ancho en un lienzo de 286 px, hoy sin uso); la
  leyenda de ECharts pagina en lienzos angostos y muestra 2 de 4 ítems a 286 px;
  `tablero.module.css` (300 líneas) y `Console.tsx` (245) siguen por encima de la guía de 150
  → [[responsive-mvp]].

## Ofrecido al usuario y NO autorizado

- **Darle un volumen al contenedor del pronóstico.** Hoy no tiene ninguno (`Mounts: []`) y
  `forecast-refresh.timer` lo recrea **cada 6 horas** (00, 06, 12, 18 UTC). Ofrecido dos veces,
  sin respuesta. **Dejó de ser urgente el 2026-08-24**: la descarga por arranque en frío pasó de
  56 MB a 4,7 MB, así que ya no revienta la cuota. Sigue siendo trabajo tirado cada 6 h.
- **Encender el addon NWP en producción.** Está desplegado y **apagado**; se activa con
  `NWP_HABILITADO=1` en `forecast.env`. Ganancia medida fuera de muestra: **−8 % de MAE a 6 h**.
  El costo es que el sistema pasa a depender de un servicio externo (Open-Meteo), que hoy no.
  Es decisión de producto, no técnica.

## Deuda conocida

- ~~El arnés de verificación sin navegador vive en un scratchpad.~~ **HECHO el 2026-08-24:**
  promovido a `mvp-debugger/scripts/verificar-vistas.mjs` + `tsconfig.verify.json`, con
  `npm run verificar` (28 chequeos). Ver [verificacion-consola](../proyecto/verificacion-consola.md).
- **La vista «Base de datos» muestra un corte fechado, no una lectura viva.** Es deliberado y está
  declarado en pantalla: el servicio del pronóstico solo lee `lecturas_ambientales_sc`, así que
  ningún endpoint puede reportar las tablas fotovoltaicas. Si algún día se quiere en vivo, hay que
  exponerlo desde el analizador, que sí las lee. Consultas para re-verificar a mano en
  [verificacion-numeros](../datos/verificacion-numeros.md).
- **Separación fina de filas mezcladas (Paso 2).** Hoy esas filas se saltan y se acepta el hueco,
  en vez de recuperar el dato remapeando columnas. Spec y ground-truth en
  [correccion-filas-mezcladas](../datos/correccion-filas-mezcladas.md).
- **Nada pusheado.** La rama `feat/agente-predictivo-humedad-etl-store` acumula **32 commits**
  por delante de `origin/master` al 21-ago. No se pushea sin pedirlo.

## Decidido, pero deliberadamente pospuesto

- **Unificar la orquestación en VisioneFlow.** Hoy hay **dos cerebros sobre el mismo par de
  manos**: el nodo `aiAgent` del canvas y un lazo propio en Python (`agent/agent.py`) que es el
  que usa la consola por `/preguntar` y `/chat`. La consola **no pasa por VisioneFlow**: le pega
  directo a los servicios. Eso son dos juegos de prompts, dos facturas de modelo y dos lugares
  donde el comportamiento puede derivar. **La decisión es dejar VisioneFlow como único
  orquestador** y que los servicios Python conserven solo las tools deterministas.
  **Se hace DESPUÉS de terminar el Agente Histórico**, no antes: no se mueven dos cosas a la vez.
  Evidencia de que hoy no se usa lo que se cree que se usa: en todo el log del loadbalancer hay
  **cero** llamadas a `/analizador/`, y los únicos golpes a `/webhook` son de un escáner de
  vulnerabilidades. Lo único vivo en VisioneFlow es el disparo horario del Predictivo.

## Vale la pena investigar

- **NSRDB (NREL PSM v4, GOES Full Disc)**: 4 km / 30 min, cubre Costa Rica, gratis con registro.
  Solo histórico, pero arreglaría la limitación de fondo de la climatología del pronóstico, que
  hoy se calcula sobre **78 días** de serie. No se evaluó todavía.

## Frente nuevo (2026-08-28)

El doc de evaluación de datos de Leonardo Cardinale abrió su propia lista: decisiones de
alcance sin tomar (unidad de tiempo del Rendimiento Específico, qué columna es la energía
oficial, prioridad de construcción de los algoritmos) y **21 ambigüedades del documento** (6 de métricas, 8 de umbrales, 7 de gráficos) que
hay que preguntarle al autor antes de codificar umbrales. Todo en
[pendientes-evaluacion-datos](pendientes-evaluacion-datos.md).

## Frente de la capa de algoritmos (2026-08-28)

La capa se construyó entera ([[capa-analitica]]) y dejó esta cola. Las dos primeras esperan a
otras personas; las cuatro últimas dependen solo de nosotros.

- ~~**Aplicar `agente-historico/sql/002_performance_emparejado_por_bin.sql`.** Decisión de Izack:
  avisar primero a Leo y a Hugo y aplicarla cuando confirmen.~~ **Ya no espera a nadie
  (2026-08-30).** Leo no la aprobó ni la rechazó: **cambió la unidad de análisis** y sacó el
  Performance Ratio de ese cruce ([[respuestas-lcv-consultas-agosto]]). Sigue **escrita y sin
  aplicar**, y sigue siendo pertinente para los cruces **punto a punto** (la nube de puntos de la
  Fig. 8), donde el sesgo medido sigue vigente. **Decidir si se aplica es ahora trabajo nuestro**
  ([[emparejamiento-por-timestamp]]).
- ~~**Decidir si `voltaje_vac = 0` es válido.**~~ **RESUELTO el 2026-08-30 por Leo: es válido.** El
  rango 100-280 V se retira de validez física y entra una **prueba de disponibilidad del equipo**
  (`voltaje_vac`, `frecuencia_hz` y `potencia_total_wac` en 0 entre las 7:00 y las 17:00, con
  refinamiento opcional por irradiancia > 300 W/m²). Lo que queda es **implementarla y re-correr el
  barrido** ([[store-hallazgos-calidad]], [[pruebas-calidad-umbrales]]).
- **Resolver las duplicaciones de detectores.** `nulos` y `valor_nulo` escriben el mismo hecho
  para las 12 variables eléctricas, y `valor_nulo` + `parametro_faltante` + `columna_ausente`
  disparan los tres sobre las columnas AC vacías: **cuatro detectores para dos hechos**. Hay que
  decidir cuál es el dueño de cada hecho, no sumarlos ([[store-hallazgos-calidad]]).
- ~~**`tools/hallazgos.py::QUE_ES` sigue con los 12 tipos viejos.**~~ **HECHO el 2026-08-31:**
  pasó a **30 entradas**, derivadas del registro y con tests que fallan si sobra o falta un tipo
  ([[implementacion-decisiones-lcv]]).
- **`agent/prompts.py` nombra a mano las tools viejas** y no menciona las **diez nuevas**, así que
  el agente no las usaría aunque estén registradas. Junto con lo anterior, es lo que hoy separa al
  Agente Histórico de poder usar su propio catálogo ([[capa-agentes]]).
- **Validar el factor de bifacialidad `φ` de forma independiente.** Se creía validado
  empíricamente por la convergencia de los dos PR, y ese argumento resultó **circular**: la
  convergencia se conseguía ajustando la irradiancia del vertical con el propio φ. Importa porque
  **el vertical depende de ese factor casi proporcionalmente y el inclinado casi no** (su cara
  trasera modelada aporta **+109 %** contra +15 %, o sea que casi la mitad de su irradiancia
  efectiva es modelo y no medición): un 10 % de error en φ mueve 5 % su PR. **φ ≈ 0,80 queda sin
  validar, no refutado**, y no hay un número nuevo ([[geometria-sistema]]). Insumo que sí
  desbloquearía esto y depende de terceros: el datasheet de los módulos ([[bloqueantes]]).
- ~~**Las vistas del frontend no están construidas.**~~ **HECHO el 2026-09-01:** las cinco
  (`/`, `/series`, `/estadistica`, `/calidad`, `/comparativa`), con tres endpoints nuevos, 490 tests
  de backend y 235 de frontend ([[vistas-frontend]]). **Cierra el encargo original.** Lo que queda
  es contrastar **figura por figura** contra las 8 visualizaciones del doc, que no es lo mismo que
  tener las pantallas ([[graficos-evaluacion]]).

## Frente que abre la ronda de implementación (2026-08-31)

Se implementó todo lo que decidió Leo ([[implementacion-decisiones-lcv]]; suite de 353 a **462
tests en verde**), y lo que quedó abierto es corto pero incluye **las dos únicas escrituras a
producción**:

- **Aplicar `sql/003_electrico_sin_falsos_positivos.sql` y re-correr el barrido.** Están escritas y
  validadas, y **nada se escribió todavía en producción**: **las decide Izack**. El ensayo del
  barrido con las escrituras anuladas da **25.720 hallazgos** y **190 filas de
  `inversor_sin_acoplar` en 96 días** (135 graves bajo sol, 37 avisos por irradiancia baja, 18 sin
  irradiancia) → [[store-hallazgos-calidad]].
- **`contexto.py` no sabe contar filas de `radiacion_sc_poa`.** Es lo **único** que bloquea vigilar
  la POA: mientras no cuente, declararla vigilada convertiría un aviso honesto en un aprobado falso
  ([[decisiones]]). ⚠️ **Cuantificado el 2026-09-01:** eso deja **5.325 hallazgos de 28.509 (casi
  uno de cada cinco) sin poder pesar en ningún veredicto**, entre las cuatro POA, `kt_star` y
  `cs_ghi_wm2`. Ya se publica separado (`hallazgos_en_el_periodo` y `cuentan_para_el_veredicto`),
  así que dejó de ser invisible, pero **sigue sin contarse** ([[vistas-frontend]],
  [[store-hallazgos-calidad]]).
- **Hacer obligatorio el parámetro `variables` de `confianza`.** Hoy es opcional, y llamarla sin él
  informa "sin acotar" y **no cuenta nada**, o sea que **la forma de llamarla mal es la más
  cómoda**. Ya costó 190 días de veredicto equivocado ([[silencio-leido-como-salud]]).
- **La misma vista sigue definida en dos proyectos.** Los cinco sitios del rango físico están
  corregidos, pero la causa no: `v_sc_electrico_corregido` la crea el ETL y la parametriza el
  Agente Histórico, con configs distintos y sin nada que obligue a que coincidan
  ([[rango-fisico-en-cinco-sitios]]).

## Frente que abre la medición de la energía AC (2026-08-31)

Salió de cerrar el hueco anterior ([[energia-ac-tablero]]) y todo depende de nosotros:

- **Arreglar `v_sc_electrico_corregido`, que tiene dos bugs.** ⚠️ **Los sitios de código ya están
  arreglados (eran CINCO, no tres: [[rango-fisico-en-cinco-sitios]]) y la migración `sql/003` está
  escrita y validada. Lo que falta es aplicarla a la base.** El contexto original, que conviene no
  perder:
  Las cuatro columnas de energía pasan **sin ningún `CASE`** (la vista "corregida" devuelve los
  mismos 39 MWh que la cruda) y los `CASE` de las variables AC **borran los ceros que Leo declaró
  válidos** (7.872 de `voltaje_vac` y 3.760 de `frecuencia_hz`). Los `CASE` se **eliminan, no se
  ensanchan**: medido, el techo de 280 V no dispara nunca (máximo 218,8) ni el de 65 Hz (máximo
  60,06), o sea que solo servían para borrar los ceros. Y hay que tocar `config.py:76`,
  `analitica/catalogo.py` **y** la vista: **olvidar cualquiera de los tres falla en silencio**
  ([[vista-corregida-no-corrige]]).
- **Decidir qué se hace con el sufijo `_wh`**, que miente: las cuatro columnas están en **kWh**.
  Renombrar a `_kwh` obliga a re-correr el ETL; documentarlo es más barato pero deja la trampa
  puesta. Por ahora quedó documentado en los dos diccionarios de columnas
  ([[unidades-energia-kwh]]).
- **Decidir qué se hace con el 2026-03-09.** Su último registro es otra fila mezclada (137,25 kWh
  contra una mediana de 6,65) y **por sí solo mete un 8 % de error en cualquier total anual**
  ([[filas-mezcladas]]).
- **Rehacer el tablero de energía con la fuente correcta.** `energia_hoy_wh` como primaria y
  `energia_total_wh` como control: con eso el tablero AC se llena para **toda la serie**, incluidos
  los cuatro meses que se creían vacíos.

- **Decidir la severidad de `ruido_excesivo`.** Es lo que hace el verde **imposible por
  construcción**: dispara sobre casi todas las variables de casi todos los días, y como el veredicto
  `ok` exige cero graves **y cero avisos**, mientras siga en `aviso` no hay días verdes. Medido:
  **bajándolo a `info` pasan de 1 a 15 días en verde**. Es el tema si alguien espera ver verde
  ([[store-hallazgos-calidad]]).

## Frente que abren las respuestas de Leo (2026-08-30)

Las tres consultas volvieron respondidas ([[respuestas-lcv-consultas-agosto]]) y lo que dejan es
trabajo nuestro, no espera. Ninguna de estas cuatro cosas está hecha:

- ~~**Recalcular el Performance Ratio como métrica diaria y mensual.**~~ **HECHO el 2026-08-31**
  ([[performance-ratio-diario]]): gana el **inclinado** en las cinco particiones probadas (POA
  bifacial 0,648 contra 0,612; GHI horizontal 0,733 contra 0,517). Lo que queda de acá es
  **llevarlo al código**: hoy vive en una medición, no en la capa de algoritmos ni en la vista.
  Y reportar siempre **las dos cifras**, con y sin los 43 días de inversor caído (0,648 y 0,830),
  porque un PR de 0,648 hace pensar en paneles malos cuando fue el inversor.
- **Integrar la irradiancia pesando por el salto real, no por `5/60` fijo.** Leo escribió
  `radiacion_intervalo = Irradiancia*5/60` suponiendo cadencia de 5 min; la nuestra va de 15 s a
  330 s, y aplicar `5/60` a un tramo de 15 s multiplica esa irradiación por veinte. Hay que usar
  `irradiancia * (dt_real / 3600)` con **techo con nombre**, igual que ya hace la integración de
  potencia ([[muestreo-variable]]). **Cuantificado el 2026-08-31:** el error global es +83,6 %,
  pero **cambia de signo** (+860 % en oct-2025, −6,7 % en feb-2026), así que **no se puede
  descontar con una constante**: inventa una estacionalidad falsa de un orden de magnitud
  ([[performance-ratio-diario]]).
- ~~**Volver a medir los cuatro acumuladores de energía sobre la vista corregida.**~~ **HECHO el
  2026-08-31** ([[energia-ac-tablero]]). El descarte del contador **era un artefacto nuestro**: los
  39 MWh salían de una sola fila contaminada y sin ella el máximo es 2.710,7 kWh. La medición dejó
  cuatro tareas nuevas, abajo.
- ~~**Implementar la prueba de disponibilidad del equipo**~~ **HECHA el 2026-08-31** en
  `calidad/pruebas/disponibilidad.py`, con `inversor_sin_acoplar` fuera del veredicto en **las tres
  cuentas** de `contexto.py` ([[implementacion-decisiones-lcv]]). **Falta re-correr el barrido**,
  que es escritura a producción. ⚠️ **Y no esperar que destrabe el verde:** medido, quitar el rango
  100-280 deja el veredicto **igual** (206 y 206).

Relacionado: [[correccion-al-equipo]], [[regla-post-carga]], [[vistas-frontend]],
[[dataset-actual]], [[fuentes-fisicas]],
[[implementacion-decisiones-lcv]], [[respuestas-lcv-consultas-agosto]],
[[performance-ratio-diario]], [[inversor-sin-acoplar]], [[rango-fisico-en-cinco-sitios]],
[[energia-ac-tablero]],
[[vista-corregida-no-corrige]], [[unidades-energia-kwh]], [[bloqueantes]], [[pendientes-evaluacion-datos]], [[agente-predictivo]],
[[mvp-debugger]], [[servidor-propio]], [[capa-analitica]], [[consola-analitica]],
[[store-hallazgos-calidad]], [[emparejamiento-por-timestamp]].
