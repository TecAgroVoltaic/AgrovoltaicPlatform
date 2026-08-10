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

## Artifact de diseño (referencia)
`mvp-debugger/design/propuesta-ux.html` (publicado como artifact) — prototipo que definió el diseño
(sidebar, pastel, sin emojis, hover, vista de costo). **Ya portado al Next real** (arriba); queda como
referencia visual con datos snapshot.

Relacionado: [[agente-analizador]], [[agente-pronostico]], [[capa-agentes]], [[evaluacion-datos]].
