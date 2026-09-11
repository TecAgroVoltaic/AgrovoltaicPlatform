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

## 2026-09-11 — vista "Descargas": exportar por rango de fechas, dos fuentes (csv / dat / mat)

Pedido de Isaac (WhatsApp 9-sep): *"descargar data de rangos de fechas de x a y tiempo… csv o
.dat .mat"*; luego en sesión: *"debe permitir descargar tanto del Supabase… como de AgroDash y
mejora la interfaz"*. Implementado como **vista "Descargas"** en la consola (`DescargasView.tsx`,
agente analizador) + módulo `exportar.py` del analizador (no es tool del LLM) con cuatro endpoints:
`/datos/exportables` (catálogo por fuente), `/datos/exportar/estimar`, `/datos/exportar/previa`
(primeras filas tal como saldrán) y `/datos/exportar` (adjunto, `Content-Disposition`).

- **Dos fuentes, dos vías:** `supabase` (SQL; las 9 relaciones de `datos.py` + `ambiental_crudo` =
  `lecturas_ambientales_sc`) y `agrodash` (**API pública** de AgroDash, `agrodash_api.py`, sin
  credenciales → funciona desde cualquier máquina; datasets `lecturas` —filtrable por **caja** y **tipo
  de sensor**, con **resolución** `paso` 0/60/300/900/3600/86400 s, 0 = crudo— y `sensores`). Isaac
  descartó la vía DB (réplica en la EC2): la API estaba documentada en el PDF del proyecto y está viva.
  Si la API no responde, el catálogo la marca `disponible:false` y el resto sigue. La API no cuenta
  filas: `estimar` devuelve una **cota** (sensores × intervalos) y la UI lo dice.
- **UI (v3, tras feedback de Isaac: "demasiada data en pantalla"):** dos columnas. Izquierda, un
  **acordeón** de pasos (fuente → datos → filtros → rango → formato → columnas): un solo paso abierto a
  la vez y los cerrados resumen su valor en una línea; las listas largas (43 cajas, 69 tipos, columnas)
  van en un **selector con búsqueda y paginación** (`Picker`, 10–12 por página). Derecha, fija: nombre
  de archivo, **filas estimadas + tamaño**, botón y **vista previa plegable** (5 filas). Descripciones
  largas quedan como tooltip. Sin verificación visual automatizada (la hace Isaac en :3123).
- **Descarga con feedback (v3.1, tras "no me descarga nada"):** el botón ya no es un `<a download>`
  (no avisa nada mientras el servidor arma el archivo y esconde errores) sino un `fetch` que lee el
  stream, muestra **bytes recibidos**, permite **cancelar** y muestra el error (400/413/429/503) en el
  panel. Causa del "nada": un `.mat` de AgroDash en crudo (10 días, 8 sensores) tardaba minutos sin
  emitir un byte. Ahora `agrodash_api` es **adaptativo** (medido: la API devuelve ≤~5000 buckets POR LLAMADA a
  ~0.7 s fijos, los sensores leen cada 1–3 min): una llamada gruesa por sensor da el **conteo exacto**
  (suma de `n`), se parte en `ceil(N/2500)` ventanas en paralelo y solo se biseca si un bucket mezcla
  lecturas; 4 sensores a la vez × 4 tramos. 10 días crudos de 8 sensores: **6 s csv / 15 s mat**
  (antes 28/35 s en paralelo simple, minutos en serie); 30 días de 5 sensores densos (272k filas): 17 s.
  `estimar` con ≤24 sensores es **exacto** (2.8 s). La API tiene **tope de 3 descargas simultáneas** (429). Calendario: «Hasta»
  no puede ser menor que «Desde» (min/max cruzados + corrección automática).
- **Formatos:** `csv` (coma, nulo vacío) · `dat` (tabulador, nulo `NaN`, booleano 1/0, `<t>_unix`) ·
  `mat` (scipy `savemat`: variable por columna, `<t>_unix`, `<t>_datenum`, struct `meta`).
- **Memoria/egress:** CSV/DAT por lotes con **cursor de servidor** (`db.iterar`, sin tope); MAT en RAM
  → **tope 500.000 filas** (413). Solo lectura: no gasta almacenamiento, sí egress (5 GB/mes Free).
- **Horas:** todo sale en **hora local CR sin sufijo**; las bases mezclan tres convenciones →
  ver [[reloj-timestamps]] (hallazgo nuevo de este trabajo).
- **Proxy:** `upstream.ts` reenvía el cuerpo como **stream de bytes** y propaga `content-disposition`.
- **Verificado:** 60 tests del analizador (mock de DB y de la API); smoke por el proxy autenticado;
  **contra la Supabase real** (10 datasets, cobertura hasta 31-ago-2026; csv/dat/mat OK) y **contra la
  API real de AgroDash** (catálogo 43 cajas, estimar, previa, csv de 1 día/1 caja en 3 s, mat crudo con
  n=1, sensores); cursor de servidor con 300k filas en Docker. Build + typecheck OK.
  **Sin verificación visual automatizada** (Isaac la hace en http://localhost:3123).
- Deps nuevas del analizador: `numpy`, `scipy`. Credencial de la Supabase ahora en
  `agente-analizador/.env` (gitignored) como `ANALIZADOR_DB_URL` (pooler `aws-1-us-east-1`).
- **Pendiente para producción:** reconstruir la imagen del analizador en la EC2 (deps nuevas
  `numpy`/`scipy`): `docker compose -f docker-compose.analizador.yml up -d --build`. AgroDash no
  necesita configuración (API pública; override opcional `AGRODASH_API_URL`).
