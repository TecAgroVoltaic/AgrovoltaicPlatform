---
name: mvp-debugger
description: Web local (Next.js) para probar/depurar en vivo los dos agentes; visor de traza (tools+salidas+respuesta), explorador de datos read-only y medición de tokens/costo por consulta y acumulado
categoria: proyecto
---

# MVP Debugger — evaluación en vivo de los agentes

Creado el **2026-08-10**. Web mínima en `mvp-debugger/` (Next 14, App Router, TS, sin libs de UI)
para **probar y depurar** los dos agentes con datos reales: [[agente-analizador]] (Q&A sobre el
histórico PV) y [[agente-pronostico]] (forecaster ambiental). No es diseño: es ver **qué consulta
el agente, qué calcula y cómo redacta**, y cruzar cada número contra las bases.

## Decisión de diseño clave
En vez de reimplementar el lazo del agente en Node, se **instrumentaron los loops Python** para que
emitan una **traza** (una sola fuente de verdad). `conversar()` en ambos `agent/agent.py` corre el
mismo lazo pero registra cada paso; `preguntar()`/`ask()` quedan como azúcar (DRY).

## Endpoints nuevos en los propios agentes (no en el debugger)
- **`POST /preguntar`** (ambos) → corre el lazo LLM y devuelve la TRAZA:
  `{pregunta, respuesta, modelo, pasos[], usage, costo, ms_total}`. Cada paso es `modelo`
  (texto + tools que pide) o `tool` (input + **salida cruda** + ms + error).
- **Analizador `GET /datos/{tablas,columnas,muestra,serie}`** — peek read-only con **allowlist**
  de relaciones (anti-inyección; booleano→proporción; texto rechazado 400). Módulo `datos.py` (SRP).
- **`GET /uso`** (ambos) — consumo acumulado del agente (extraíble): n consultas, tokens, USD, por modelo.
- **Pronóstico `GET /serie`** — peek del store (resumen + puntos para graficar).
- **Pronóstico `GET /backtest`** — backtest HONESTO (`backtest.py`, SRP): reaplica el método del
  forecaster (persistencia de kt* / del valor) sobre el histórico real y lo compara con lo medido;
  devuelve puntos + métricas (MAE, sesgo, error rel, skill vs. ingenuo). NO son predicciones en vivo
  (esas viven en la tabla `predicciones`); es evaluación del método.

## Tokens + costo (2026-08-10)
- **Nivel consulta:** la traza trae `costo = {usd_input, usd_output, usd_total, modelo, tarifa}`.
- **Nivel general:** `uso.py` (SRP) acumula y **persiste** en JSON atómico bajo `.uso/` (gitignored,
  sobrevive reinicios); la acumulación vive en el servicio (`/preguntar`), no en el lazo (queda puro).
- **Tarifa** (verificada en la doc oficial de Anthropic, 2026-08-10): `claude-haiku-4-5` = **$1/MTok in,
  $5/MTok out**. También Sonnet 5 ($3/$15), Opus 5/4.8 ($5/$25), Fable 5 ($10/$50). Override por `PRECIOS_JSON`.
- Es por **consulta y acumulado**, no por-tool (los tokens son del turno completo del LLM).

## Arquitectura y ejecución
```
Browser ─► /api/<svc>/*  (route handler Next, inyecta x-api-key) ─► :8010 analizador / :8000 pronostico ─► DB (SOLO LECTURA)
```
Las keys viven solo del lado servidor (`app/lib/config.ts`); el browser nunca las ve. Correr con
`mvp-debugger/dev.sh` (levanta analizador:8010 + pronóstico:8000 + next:3000; toma la ANTHROPIC key de
`agente-pronostico/.env`). Verificado end-to-end (trazas reales de ambos, costo exacto, `/uso` crece).

## UI actual — consola única con barra lateral (2026-08-10)
El `/` del Next es una **consola** (`app/components/console/`) con **barra lateral** (sin emojis,
paleta pastel) que conmuta 4 vistas conectadas a `/api/*`, todo con datos vivos:
- **Reconciliación** — Ask/traza del analizador (los números salen de tools SQL = verdad de la DB) +
  tabla de datos crudos en vivo (buscable + "cargar más") + cobertura.
- **Predicción vs Real** — **backtest** honesto vía `/backtest` (con banner que aclara que el agente
  NO predice en continuo) + métricas + traza de un forecast en vivo.
- **Rendimiento** — KPIs reales (tools) + series vía `/datos/serie` (potencia/GHI/kt*/PR) + dispersión.
- **Costo y uso** — acumulado real (`/uso`) + gasto de la sesión (gráfico acumulado, split, proyección).
Gráficas en SVG propio (`lib/charts.ts`) con **hover de valor exacto** (`ChartTooltip`), tema claro/oscuro.
Las rutas viejas `/analizador` y `/pronostico` siguen existiendo (herramientas extra: runner de tools,
explorador de datos completo) pero ya no están enlazadas.

## Chat (widget flotante, 2026-08-10)
El Ask inline de las vistas se reemplazó por un **chatbot flotante** (bubble abajo-derecha,
expandible; `app/components/chat/ChatWidget.tsx`). Un solo widget, **hilos separados por
agente** (analizador vs pronóstico, persistidos en localStorage, no se mezclan); habla con el
agente de la sección activa y le manda el **contexto de la vista**. Backend: `POST /chat` en
ambos agentes (`chat()` en `agent/agent.py`):
- **Multi-turno con historial de TEXTO limpio** (sin bloques tool_use/tool_result → no se
  malforma, no arrastra JSON pesado → barato); cap ~8 turnos.
- **web_search** nativa de Anthropic (verificado: Haiku 4.5 la soporta) con **barrera DB-first**
  en el system prompt: datos del sitio SIEMPRE de tools; web solo para conocimiento externo (cita).
- Analizador: tool **`graficar`** → datos reales + marcador `_grafico` que el widget pinta inline
  (el LLM recibe solo el resumen → no gasta tokens en los arreglos).
- Pronóstico: **DOS modalidades que el agente conoce de base** (system prompt) y rutea por intención:
  **`forecast`** (futuro, desde el último dato) y **`backtest`** (histórico: reconstruye cómo se
  habría predicho una fecha/período pasado y lo compara con lo real; `tools/backtest_tool.py` reusa
  `backtest.py`, devuelve valor real + métricas + `_grafico` Real-vs-Reconstrucción). Ej.: "¿cuánta
  irradiancia hizo el 21 de julio?" → backtest. Fecha sin datos → dice el rango disponible, no inventa.
  Fix relacionado: el analizador ya no especula motivos cuando falta el dato — cita su rango (hasta 1-jun-2026).
- **Caché** (cache_control en system+tools) cableada y correcta, pero NO engancha hoy: el prefijo
  (~2265 tok) está bajo el mínimo de Haiku 4.5 (probado: con prefijo grande sí cachea). Los ahorros
  reales vienen del historial solo-texto + recorte de `_grafico` + cap + web por criterio.
- UX: indicador con **frases genéricas rotando** mientras espera ("Consultando la base…",
  "Buscando en la web…"); **traza plegable** por respuesta (tools + búsquedas web + costo).

## Artifact de diseño (referencia)
`mvp-debugger/design/propuesta-ux.html` (publicado como artifact) — prototipo que definió el diseño
(sidebar, pastel, sin emojis, hover, vista de costo). **Ya portado al Next real** (arriba); queda como
referencia visual con datos snapshot.

Relacionado: [[agente-analizador]], [[agente-pronostico]], [[capa-agentes]], [[evaluacion-datos]].

## 2026-08-14 — auth, panel de salud y estados de error

- **Gate de acceso** (`middleware.ts` + `app/lib/auth.ts`): cookie `<expiracion>.<hmac>`
  firmada con **Web Crypto** (el middleware corre en runtime Edge, sin módulos de Node).
  Cubre las páginas y `/api/*`, que es donde se gastan tokens. **Falla cerrada**: sin
  `DEBUGGER_PASSWORD` en producción responde 503 en vez de abrirse.
- **Vista "Salud del sistema"**: frescura de ingesta por variable, gasto del día contra
  el tope y últimos errores del agente (lee `/salud/panel`).
- **Estados de error/vacío**: las vistas validaban nada y un 200 con otra forma las dejaba
  en "cargando…" para siempre. Ahora `extraerLista`/`mensajeError` + el bloque `Estado`.
- **Verificación**: `scripts/smoke-auth.sh` (8 casos con HTTP real) corre en el CI.

## 2026-08-19 — agente histórico BLOQUEADO (solo se muestra el predictivo)

Pedido del usuario: esta semana la consola muestra **solo el agente de pronóstico**. El
bloqueo es un flag de servidor, no un borrado: `AGENTE_ANALIZADOR=on` lo devuelve entero.

- **Fuente única**: `app/lib/agentes.ts` (`analizadorActivo()`), leído **solo del lado
  servidor** y bajado como prop. Nada de `NEXT_PUBLIC_*`: quedaría horneado en el bundle y
  habría dos fuentes de verdad (build vs. proceso).
- **Se corta la puerta, no el botón**: `/api/analizador/*` responde **503** con el mensaje
  de cómo revertirlo. Esconder la UI no alcanza — un `fetch` a mano igual consulta la
  Supabase PV y gasta tokens.
- Alcance: vistas Reconciliación y Rendimiento fuera de la navegación · selector de agente
  reemplazado por el rótulo «Pronóstico ambiental» · página suelta `/analizador` → **404** ·
  grupo «Agente Analizador PV» fuera de `/docs` + tarjeta y enlace muertos degradados ·
  el mini-chat del glosario (`ConceptChat`) ahora habla con el **agente activo** (antes
  apuntaba duro a `/api/analizador/chat` y el bloqueo lo dejaba en 503).
- **`export const dynamic = "force-dynamic"`** en `/`, `/docs` y `/analizador`: sin eso Next
  las prerenderiza y el flag queda congelado en el momento del build.
- **Verificación**: `scripts/smoke-agentes.sh` (12 casos, HTTP real) prueba el bloqueo **y su
  reversibilidad**; corre en el CI junto al de auth.

## 2026-08-19 — «Predicción vs Real» rediseñada: una sola fuente

La vista pasó a girar sobre **un solo momento**: se elige fecha, momento y anticipación, y de
ahí salen el gráfico, los tres números y la lectura del agente.

**El error que se corrigió (y por qué importa):** había dos relojes independientes —una
ventana de N días para el backtest y un instante suelto para el pronóstico anclado— y encima
hablaban en granularidades distintas. A las 12:00 del 22-jul el gráfico marcaba **358 W/m²**
(promedio de la hora) y el KPI **166** (lectura instantánea de las 12:02). Los dos ciertos: esa
hora fue de 237 a 449 W/m². Pero en una vista cuyo propósito es *validar de un vistazo*, dos
números que no cuadran destruyen la confianza más rápido de lo que la construye cualquier
métrica. Ahora **todo lee del mismo backtest**: gráfico, KPI y agente.

- **El techo de cielo despejado volvió al gráfico** (2026-08-19, tras quitarlo por error al
  simplificar). No era decoración: sin esa referencia un medido de 33 W/m² no dice si el día
  estuvo tapado o si simplemente era temprano. Además es lo que hace interpretable el método,
  porque kt* = medido / techo es justo la señal que el forecaster persiste. El KPI del momento
  elegido ahora muestra **«7 % del techo de cielo despejado (505 W/m²)»** en vez de un genérico
  "valor real de esa franja". En humedad de suelo no hay techo y la vista cae al texto genérico.
- **La predicción salió del gráfico y de los KPI.** El gráfico muestra solo el **terreno**
  —lo medido y el techo de cielo despejado— y la predicción vive **únicamente en la lectura del
  agente**, que es donde se la pide. Se borraron las tres tarjetas (midió / predijo / error) y el
  pie de métricas, y con ellos el componente `PuntoEvaluado.tsx` y la llamada de referencia a
  `/backtest?dias=7`. Motivo: sin predicción en el gráfico, esas tarjetas mostraban un número que
  nadie había pedido; y trazar la curva completa sugería que el sistema predice en continuo,
  cuando cada valor es una reconstrucción independiente.
- **Carga de la vista.** Cada llamada tarda 110–140 ms contra la EC2 (el backend no es el
  cuello). Lo que se arregló fue la **cadena secuencial**: había que esperar a `/serie` para saber
  qué día pedir y recién ahí salía la del gráfico. Ahora el rango se recuerda en `localStorage`,
  así las dos llamadas salen a la vez y la revalidación corrige si la ingesta avanzó. Además
  `/serie` pasó a `ultimos_dias=1` (el `resumen` se calcula sobre la serie completa igual, ver
  `peek_serie`). Neto: **3 llamadas y 19,3 kB → 2 llamadas y 2,1 kB**.
- **Qué es la «anticipación», con sus asteriscos.** Fija el `bucket` del backtest, y la
  reconstrucción es siempre **una franja hacia adelante**: `pred(N) = kt*(N−1) × techo(N)`. No
  adelanta datos — el algoritmo solo ve lo ya ocurrido; el techo del momento objetivo sí se usa,
  y es lícito porque es astronómico. **Cuidado al comparar MAE entre anticipaciones**: el bucket
  cambia a la vez el horizonte y el promediado, así que el objetivo mismo cambia (media horaria
  vs. media de 15 min). La caída 32 → 14 W/m² es sobre todo efecto del horizonte corto, pero no
  es una comparación estricta. Y **no es el forecaster en vivo**: `/forecast` usa lookback de
  60 min y MEDIANA de kt* a resolución instantánea; esta vista usa la franja anterior.
- **Procedencia de la curva predicha, dicha en la vista.** Al no estar escrito, es razonable
  suponer que hay un LLM analizando cada franja. No lo hay: las tres curvas salen de **una sola
  llamada determinista** a `/backtest` (~20 ms, pandas + pvlib), y el agente recién interviene al
  pulsar Analizar. Ahora lo dice una nota bajo el gráfico.
- **La anticipación ES la resolución** (`bucket` 15min/30min/h): reconstruir un bucket = predecirlo
  con el anterior. Un solo control en vez de dos que se contradecían. Efecto secundario útil para
  la demo: el error medio del 22-jul cae de **32 → 14 W/m²** al pasar de 1 h a 15 min.
- `console/PuntoEvaluado.tsx` (3 KPI: midió / predijo / error) y `console/LecturaAgente.tsx`.
- `lineChart` acepta `marca`: guía vertical en el momento elegido.
- **Menos texto**: el banner de tres líneas sobre el backtest es ahora una etiqueta
  «modo backtest» con el detalle en el `title`. Fuera la tabla de mayores desvíos, la serie de
  cielo despejado y las notas al pie; las métricas agregadas quedan en una línea.
- `AnclaForecast.tsx` **eliminado**: su rol se absorbió. El pronóstico anclado sigue vivo en la
  API (`ahora` en `POST /forecast`), pero **ya no se muestra en esta vista** — volvería a meter
  una segunda granularidad. Ver [[agente-pronostico]].
- El KPI «Skill vs. ingenuo» muestra **n/a** en humedad de suelo: ahí el método *es* la
  persistencia, así que el 0 % era una tautología, no una falla del modelo.

### La lectura del agente: fichas de lo que devolvió cada herramienta

La tarjeta lista, en **fichas chicas**, lo que devolvió cada herramienta llamada: predicho,
medido, error, techo, claridad kt* y error medio del día. Salen de la salida de la tool, no del
texto. Para que existieran hubo que enriquecer `backtest_tool`: `punto_consultado` ahora trae
`techo_cielo_despejado` y `kt_estrella`, y la serie compacta trae `techo`.

**Trampa encontrada ahí:** de noche el techo vale **0**, que es un valor válido, no un campo
ausente. La primera versión usaba `if techo:` y lo descartaba, confundiendo «no aplica» (humedad,
que no tiene análogo de cielo despejado) con «vale cero» (irradiancia nocturna). Se distingue con
`is not None`; el kt* sí se omite de noche, porque dividir por cero no significa nada.

### Cómo se renderiza lo que escribe el agente (2026-08-19)

Dos defectos que se veían como "está crudo" y en realidad eran de presentación:

- **Las tablas markdown salían con los pipes y los guiones a la vista.** `inlineMd` solo
  resolvía negritas, y la tabla es justo la forma natural en que el modelo pone
  "real / predicho / error" — o sea, el caso MÁS común de este sistema. Nuevo
  `app/lib/markdown.ts` (`renderMd`): párrafos, negrita, cursiva, código, listas y tablas.
  Escapa todo el HTML de entrada primero, así el texto del modelo no puede inyectar marcado.
  Se usa en las **cuatro** superficies (lectura inline, chat flotante, glosario y ChatWidget).
  Cubierto por `scripts/smoke-markdown.mjs` (16 casos) en el CI.
- **La tarjeta no mostraba la tesis del proyecto.** Era «botón + texto», y lo que hay que ver
  es la SEPARACIÓN: *el agente no predice, predice un algoritmo determinista*; el modelo elige
  cuál llamar, con qué parámetros, y explica lo que devuelve. Ahora la tarjeta va en ese orden:
  **(1) lo que devolvió el algoritmo** —herramienta, método, los tres números en grande y el
  contexto del día—, **(2) lo que dijo el agente**, **(3) cómo llegó ahí**. Cada bloque con su
  icono y color de acento (`bloq-algo` ámbar, `bloq-agente` violeta).
- **Verificación cruzada**: los valores que recibió el agente se comparan con los que muestra el
  gráfico y sale un sello «coincide con el gráfico». Es la prueba de que la explicación habla de
  los mismos datos que estás mirando — y si el modelo consultara otra resolución, se vería.
- **Iconos propios** (`components/Iconos.tsx`, SVG inline, nunca emojis: rompen la tipografía y
  la paleta). Sirven para distinguir de un vistazo quién actuó: engranaje = algoritmo,
  destellos = el modelo eligiendo, bocadillo = redacción, globo = web.
- **La traza era `JSON.stringify(pasos, null, 2)`**, ilegible. Nuevo componente compartido
  `components/TrazaLegible.tsx`: línea de tiempo con un paso por punto — «Decidió qué
  consultar», «Consultó los datos» (herramienta, ms, qué le pidió, qué le devolvió),
  «Buscó en la web», «Redactó la respuesta». Los arreglos se cuentan en vez de volcarse
  (`serie: 22 elementos`) y los objetos anidados se abren un nivel
  (`resumen.maximo_real`). Los parámetros van como **chips** y la salida se muestra **por
  relevancia**, no completa: volcar los doce campos —incluidos los que solo repiten la entrada—
  era el problema viejo con más pasos. Lo que no entra queda en «ver salida completa (+N
  campos)», que sigue siendo la prueba final. Reemplaza también la traza críptica del chat.
- **Menos redundancia**: la pregunta que manda la vista ahora pide prosa breve sin tablas,
  porque los tres números ya están en los KPI de arriba. Lo que aporta el agente es la
  interpretación, no volver a listar lo que se ve.

### Dónde va la respuesta del agente: en la vista, no en el chat flotante
Se evaluó mandar la consulta al widget flotante (reusa el hilo) contra un panel inline. Gana el
**inline**: lo que se está haciendo es comparar real contra predicho, y un panel flotante tapa
justo los números que se quieren contrastar. No duplica el chat — es un turno único, sin
historial ni persistencia, contra el mismo `POST /chat`. El widget flotante sigue para conversar.

## 2026-08-19 — vista «Arquitectura del agente»

Vista nueva en la consola (5ª del pronóstico, `components/console/arquitectura/`) que **dibuja
al agente como un grafo de nodos** estilo VisioneFlow: entradas → proxy → el modelo →
herramientas → capa determinista. Hover para el resumen, clic para el detalle (qué hace, qué
recibe, qué devuelve, límites, pruebas). Existe para **presentarla**: lo que estaba solo en el
código ahora se ve.

### La decisión que la hace confiable: la estructura se lee del servicio
El error fácil era escribir un archivo con las herramientas a mano. Eso se desincroniza en
silencio, y el pedido era justo lo contrario («debe ser a como lo tenemos construido»). En vez
de eso hay un endpoint nuevo, **`GET /arquitectura`** (ver [[agente-pronostico]]), que **deriva**
el mapa de `agent.MODOS` y de los `input_schema` reales — los mismos objetos que se le mandan
al modelo. La vista pinta eso.

El reparto queda así:
- **el servicio** aporta lo verificable: nombres, parámetros, tipos, rangos, obligatoriedad, en
  qué modo vive cada herramienta, los frenos y la cobertura de datos;
- **`catalogo.ts`** aporta solo lo que ningún esquema puede decir: por qué existe cada pieza,
  qué límite es una decisión, y qué prueba la blinda.

Y la vista **denuncia la deriva** en vez de taparla: una herramienta que el servicio expone sin
ficha se dibuja igual, con su contrato y la marca «sin documentar»; una ficha que ya no
corresponde a ninguna herramienta viva se avisa en pantalla. Nunca puede aparecer una ficción
callada.

### El interruptor de modo es el argumento, no un adorno
Al pasar a *predicción* se apagan `backtest` y `web_search` y se cortan sus aristas. Es la
garantía del sistema hecha visible: el agente no ve la respuesta **porque la herramienta no está
en la lista**, no porque el prompt se lo pida. Un prompt se puede ignorar; una herramienta
ausente no se puede llamar.

### Detalles de implementación
- **Disposición**: lienzo de coordenadas fijas (1140 de ancho) en un contenedor con scroll
  horizontal propio. Los nodos que no son herramientas llevan coordenadas fijas; la **pila de
  herramientas se calcula** desde lo que publica el servicio, así que una sexta tool entra sola
  y el lienzo crece.
- **Hover sin código nuevo**: cada nodo lleva `data-tip` y lo atiende `ChartTooltip`, que ya
  estaba montado en la consola y funciona por delegación.
- **Prosa en markdown** renderizada con `lib/markdown.ts` (escapa el HTML antes de formatear).
- **Pantalla completa** sobre el lienzo (Fullscreen API), para proyectar sin la barra lateral.
- Enlace desde la doc (`docs/content/agentes.tsx`, sección Pronóstico) para que no haya dos
  verdades.

### Cómo se verificó sin navegador
La extensión de Chrome no estaba conectada, así que los componentes se **renderizaron con
`react-dom/server` contra el mapa real de producción**: 12 nodos por modo, los 3 apagados
correctos en cada uno, un `data-tip` por nodo, y la tabla de parámetros de cada modal con
exactamente las filas de su `input_schema` (`predecir` → 7). Incluido el caso de la herramienta
sin ficha. 27 chequeos, todos OK.

## 2026-08-20 — Vista «Los datos» + «En qué ayuda» en las fichas de los tools

Dos superficies para la demo, sobre la misma idea: una ficha tiene que contestar **por qué
existe la pieza**, no solo qué hace.

### En las fichas de los tools (vista de Arquitectura)
Campo nuevo `ayuda` en el tipo `Ficha`, y `hace` recortado a una o dos frases. El modal abre
con «Qué hace» y, debajo, **«En qué ayuda»**: qué sería peor sin esa herramienta, con un número
medido cuando existe (la banda por régimen a 1 h pasó de 19 a 8 puntos de dispersión; el sesgo
diurno a las 16 h era +52 %). Todo el detalle técnico («Qué devuelve», «Límites», «Cómo se
prueba») queda igual, abajo.

Cuidado con una colisión que estuvo a punto de pasar: `.arq-ayuda` **ya existía** para el texto
de la leyenda del lienzo. La sección nueva se llama `.arq-porque`.

### Vista nueva «Los datos» (`app/components/console/datos/`)

**El lienzo: el recorrido en cinco actos, con el dato a la vista.** La primera versión dibujaba
`extract → transform → load`, que son los nombres de los MÓDULOS: se veía prolijo y no explicaba
nada, porque quien no escribió el pipeline no sabe qué hace algo llamado «transform». Izack lo
cortó («demasiado genérico, así no se entiende»).

Ahora cada acto muestra **cómo se ve el dato en ese punto**, con los valores reales de la base:

| # | Acto | Lo que se ve |
|---|---|---|
| 1 | Llega el crudo | `dic-2024 → vpv1` · `may-2025 → Voltaje PV1 [V]` · `jun-2026 → voltaje_pv1_v` |
| 2 | Se unifica el nombre | las tres variantes convergiendo a una |
| 3 | Se guarda tal cual | `85,0 °C` · `26.503.163 W` · `−15.538`, en rojo |
| 4 | Se corrige al leer | las **mismas tres filas**: `NULL` · `NULL` · `0`, en verde |
| 5 | Se calibra y se evalúa | `734 W/m²` · `kt* 0,61` · `PR 0,621` |

El antes/después no desapareció: se movió **adentro de los pasos 3 y 4**, que es donde se
entiende sin cruzar tablas.

**Lo que el dibujo enseña sin decirlo.** Una línea parte el lienzo en dos zonas rotuladas:
**«al cargar · una sola vez»** (irreversible, por eso hay lo mínimo) y **«al consultar · cada
vez»** (reversible, ahí vive toda la corrección). La línea lleva el rótulo «acá termina lo
irreversible» y **no hay flecha que la cruce**: una flecha diría lo contrario de lo que el dibujo
tiene que enseñar.

**El layout es fluido, no un lienzo de ancho fijo.** La segunda versión posicionaba los actos en
coordenadas absolutas sobre 1140 px: en pantalla ancha sobraba espacio a los lados, en angosta
había que arrastrar. Ahora cada tramo crece con `flex-grow` igual a **cuántos actos contiene**,
así las cinco cajas salen del mismo ancho sin que nadie lo declare y el conjunto ocupa lo que
haya. Por debajo de 1180 px las zonas se apilan y la línea se vuelve horizontal; por debajo de
840 px los actos envuelven. Nada de esto perdió lo que el dibujo enseña.

**Debajo, once tratamientos numerados**, uno por renglón, con la misma numeración y el mismo
orden que el documento que revisó Leo Cardinale (P1 a P12). Cada renglón declara dónde vive
(`al cargar` / `al consultar`) y cita la pregunta de Leo que lo respalda.

Va en el **grupo transversal** de la navegación (es el `SEPARADOR` ahora), no en el de un
agente: el ETL existe con cualquiera de los dos agentes apagado.

**La diferencia honesta con la vista de Arquitectura.** Aquella se dibuja con lo que el servicio
publica en vivo, así que no puede mentir. Esta **no tiene esa red**: el servicio del pronóstico
solo lee `lecturas_ambientales_sc`, y las tablas fotovoltaicas no pasan por él. En vez de fingir
que los números están vivos, se muestran con la **fecha de la corrida al lado** (`CORRIDA`),
verificados con SELECT contra la base viva el 2026-08-20.

### Cinco defectos reales encontrados al construirla
1. **`<p>` dentro de `<span>`.** `renderMd` envuelve en `<p>`; el helper de markdown en línea lo
   metía en un span. Anidado inválido: el parser lo expulsa y la regla CSS que lo apuntaba no lo
   alcanzaba nunca. Ahora es un `<div class="md-plano">`.
2. **Huecos desiguales entre columnas** del lienzo. Corregidos.
3. **Texto recortado en silencio.** El acto 1 apilaba nombre de archivo y encabezado en dos
   renglones y no entraba en la caja; con `overflow:hidden` se habría cortado sin avisar, que es
   el peor defecto posible en una vista que existe para explicar. Muestra compactada a un renglón
   por variante y alto fijo → `min-height`: si algo crece, crece la caja.
4. **El tooltip de TODA la consola recortaba el texto.** `#tip` tenía `white-space:nowrap` junto
   con `max-width`, y esa combinación no envuelve: **corta**. Con `width:max-content` una etiqueta
   corta sigue en un renglón (idéntico a antes) y una larga envuelve al llegar al tope. Afectaba a
   las gráficas y al grafo de arquitectura, no solo a esta vista.
5. **Superposición en la muestra del acto 2.** La convergencia se dibujaba con una llave lateral;
   al pasar a ancho fluido, el nombre resultante se montaba encima de la entrada y había que
   recortar los nombres para que entraran, que es justo el dato que ese paso tiene que dejar leer.
   Ahora va apilada y centrada, con una flecha hacia abajo: sin posicionamiento, sin superposición
   posible.

### Cómo se verificó sin navegador
La extensión de Chrome no estaba conectada, así que se compilaron los componentes con `tsc` y se
renderizaron con `react-dom/server`: los 6 nodos con su `data-tip`, los 11 tratamientos numerados
y en orden, que cada uno declare dónde vive y cite su pregunta de Leo, el sello de fecha, que
ningún nodo se solape ni se salga del lienzo, que los huecos entre columnas sean iguales, que las
6 tools tengan `ayuda`, y que el modal de cada una muestre «En qué ayuda» **sin perder** «Límites»
ni «Cómo se prueba». Y sobre el lienzo: que los cinco actos estén numerados y en orden, que cada
uno muestre el DATO y diga POR QUÉ, que **no queden nombres de módulo** (`extract`/`transform`/
`load`), que **no quede ni una coordenada absoluta en el marcado**, que cada tramo crezca según
cuántos actos tiene, que las zonas sean contiguas y que **ninguna flecha cruce la línea**. Con la
brevedad como aserción explícita, tooltips incluidos. **40 chequeos, 0 fallas.**
