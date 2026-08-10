---
name: pipeline-tiempo-real
description: Pipeline de datos del agente (arquitectura A) AgroDash→ETL→Supabase store→forecaster multi-variable (irradiancia + humedad de suelo). Congelamiento SC 2026-07-23. Desplegado en la EC2 con timers. Modo "solo histórico".
categoria: proyecto
---

# Pipeline de datos en tiempo real del agente (irradiancia + humedad)

Cómo el [[agente-pronostico]] pasa a pronosticar **humedad de suelo + irradiancia**
"en tiempo real" para San Carlos. Construido y desplegado el 2026-07-27/28.
Prioridad del usuario: **solo predicciones** de esas dos variables.

## Hallazgo que define el alcance: la fuente SC está CONGELADA

Verificado el 2026-07-27 en la DB viva de Cartago (`100.101.177.71`, read-only
`agrovoltaic_ro`): el subsistema de **San Carlos (cajas sufijo SC) + nodos ESP32 de
suelo dejó de reportar el 2026-07-23 ~02:32** y sigue congelado. NO es el rezago de
Zentra: es un **outage del subsistema SC**. Distinguir dos familias de ingesta:
- **VIVAS:** estaciones Zentra de aire `ZN_*` (5 min, rezago ~45 min, calibradas:
  Air Temp, Vapor Pressure, VPD), `Caja R` y el riego Kalman (Cartago-local).
- **CONGELADAS (desde 23-jul 02:32):** `Caja Irradiancia SC`, `Caja Hum_Suelo SC`,
  `Campbell VWC`, `Caja F/G/H/I/L/N/O`, nodos Abióticos. Sin fuente viva de
  irradiancia (`Solar Radiation` de Zentra muerto >14 días) ni humedad de suelo.

→ Decisión del usuario: **"solo histórico"**, NO avisar al equipo aún. Se construye
todo contra la historia (hasta 23-jul) y, por ser idempotente, **se pone en vivo
solo cuando el equipo restaure la ingesta SC**. Ver [[agrodash]], [[bloqueantes]].

## Arquitectura A (elegida por el usuario)

```
AgroDash Cartago (read-only) ──[ETL cron 15min]──▶ Supabase store ──[lee]──▶ Forecaster /forecast
   (fuente, congelada)          streaming+COPY       (AgroVoltaic)            (sidecar EC2)
```
SOURCE (de dónde traigo) ≠ STORE (dónde guardo). El store desacopla el forecaster
de la fuente, da historia propia y aloja predicciones + logs en un solo lugar.
Respeta la separación de regiones: es data ambiental de **San Carlos** repatriada a
su propia Supabase (no fusiona las DBs canónicas). Ver [[arquitectura-regiones]].

## Store — Supabase de AgroVoltaic (project ref `jijklguopafevyucogro`)

**OJO: es una Supabase DISTINTA** de la de la app de fitness (`hlhdxnqzqtfxqhrafuoh`,
la única conectada al MCP). Conexión por `DATABASE_URL`/`STORE_URL` en `.env`
gitignored. La **direct connection es IPv6-only** (no rutea desde la Mac); usar el
**Session pooler** `aws-1-us-east-1.pooler.supabase.com:5432`, user `postgres.<ref>`.
Es la misma DB que `monitoreo_agrovoltaic` (36.485 filas). 3 tablas nuevas del agente
(DDL en `agente-pronostico/sql/schema_supabase.sql`, idempotente):
- **`lecturas_ambientales_sc`** — store de ingesta, formato largo (1 fila = 1 lectura).
  PK `origen_id` = `readings.id` de AgroDash → upsert 1:1. Backfill: **~812k filas**
  (irradiancia 118k / 6 canales, humedad_suelo 694k / 5 canales), 2026-05-01→07-23.
- **`predicciones`** — audit + write-back del flujo (esperado, banda, frescura,
  modelo, latencia, contexto). Base del predicho-vs-real.
- **`agente_log`** — logs estructurados del ETL/forecaster/flujo.

## ETL (`pronostico.etl`) — Cartago→Supabase

- Lee la fuente con `config.conninfo()` (AgroDash, read-only) y escribe con
  `STORE_URL`. Idempotente (`ON CONFLICT (origen_id) DO NOTHING`) + incremental
  (watermark = `max(ts)` del store − solape). `--full` re-escanea desde `BACKFILL_SINCE`.
- **Escalable en memoria**: cursor server-side (streaming) + **COPY a tabla temporal
  por lotes de 50k** + INSERT…ON CONFLICT. Los lotes chicos evitan el
  `statement_timeout` de Supabase (el COPY único de 577k filas lo chocaba).
- Etiqueta los timestamps NAIVE de AgroDash como hora local CR (UTC−6) → instante
  correcto (verificado: pico diurno de irradiancia a las 11h local).
- **Timer `forecast-etl.timer`** (systemd, cada 15 min, `docker exec forecast-forecast-1
  python -m pronostico.etl`). Con la fuente congelada, no-op; listo para cuando vuelva.

## Forecaster multi-variable (Fase 3)

- **Despacho por variable** en `run_forecast` (`tools/forecast_tool.py`): irradiancia
  → persistencia de kt* + cielo despejado (intacto); **humedad_suelo → persistencia de
  la MEDIANA reciente** + banda por variabilidad (suelo cambia lento, muy
  autocorrelado; sin cielo despejado). Nuevo `forecasters/humidity.py`.
- **`data.py` lee del STORE** (`lecturas_ambientales_sc` por variable) en vez de
  AgroDash directo; cache por variable. `config` separa SOURCE de STORE (`store_conninfo`).
- Humedad de suelo va **cruda (ADC 0–65535)**; la calibración es aparte ([[bloqueantes]]).
- **57 tests** pasan (irradiancia intacta + casos de humedad).

## Deploy (2026-07-28) — vivo en la EC2

Sidecar `forecast-forecast-1` (compose `docker-compose.forecast.yml`, proyecto
independiente `forecast`, build context `/home/ec2-user/forecast/agente-pronostico`):
- `rsync` del `src/` nuevo → rebuild (`FORECAST_BUILD_CONTEXT=… docker-compose … up -d
  --build`) → **STORE_URL agregado a `forecast.env`** (junto al `DATABASE_URL`=Cartago
  que usa el ETL como source).
- Verificado en el contenedor (healthy): `run_forecast` de ambas variables leyendo el
  store → **156.1 W/m²** (irradiancia) y **41048 crudo** (humedad), idénticos al smoke
  local. En la EC2 el compose es `docker-compose` (con guion), NO `docker compose`.
- Convive con `forecast-refresh.timer` (cada 6h recrea el contenedor → re-lee el store).

**Código**: rama `feat/agente-pronostico-humedad-etl-store` (commit `639084e`, primer
commit del paquete `agente-pronostico` completo — estaba untracked). NO pusheado aún.

## Fase 4 (2026-07-29) — flujo programado + write-back

- **Write-back SERVER-SIDE** (`pronostico.audit`): cada `POST /forecast` audita una fila en
  `predicciones` (`origen`, `modelo`, `frescura_seg`, `latencia_ms`, `contexto`). Best-effort
  (no rompe el pronóstico si el store falla). Robusto: audita venga de donde venga (schedule,
  webhook, prueba), sin depender del LLM. Desplegado y **verificado por el `/forecast` público**.
- **Flujo DETERMINISTA** (sin LLM, recolección de datos): `docs/pronostico/flujo-schedule-visioneflow.json`
  — `scheduleTrigger` (cada 1h, tz CR) → `httpRequest`(irradiancia) → `httpRequest`(humedad) →
  `output`. Usa nodos de ACCIÓN (`httpRequest`), no el `aiAgent`. El **scheduler de VisioneFlow
  es real** (BullMQ/Redis): al **desplegar** el agente, `registerScheduledTriggers()` lo registra
  y el worker dispara la ejecución solo (`triggeredBy:'schedule'`).
- **Pendiente**: el usuario **importa + despliega** el flujo en el agent-builder (pega la
  `FORECAST_API_KEY` en los 2 nodos `httpRequest`). Con la fuente congelada, cada corrida audita
  un pronóstico de la data del 23-jul (irradiancia 0 de noche / humedad por persistencia); cuando
  la ingesta vuelva, las predicciones se vuelven reales sin tocar nada.

## Comparador MVP — tool de anomalías (2026-08-10)

Primer tool de la [[capa-agentes]]: endpoint **`/anomalias`** en el sidecar
(`pronostico.anomalias`, DETERMINISTA, sin LLM). Dado (variable, ventana_min) analiza el
store y devuelve hallazgos: **`sin_datos_recientes`** (detecta el outage SC — hoy reporta
~18 días de frescura), **`sensor_plano`** (stuck tipo 85 °C), **`fuera_de_rango`**,
**`outlier`** (z-score robusto por mediana/MAD) y **`drift`** (cambio de nivel). Señal: **kt\***
para irradiancia (reusa clear-sky), **crudo** para humedad. 64 tests. Desplegado y probado por
el `/forecast/anomalias` público. El aiAgent lo llama como tool (`detectar_anomalias`) y **solo
narra** los hallazgos. Los otros tools (rollups/consultas, Performance Ratio) quedan como
**nice-to-have** (backlog). Es la semilla del Comparador batch.

## Pendiente

- **Fase 5** — observabilidad + vista predicho-vs-real (semilla del Comparador, [[capa-agentes]]).
- **Seguridad**: rotar la clave débil de `agrovoltaic_ro` ([[conectividad-tailnet]]).
- **Cuando el equipo restaure la ingesta SC**: el ETL backfillea solo y el /forecast se
  pone en vivo sin tocar código.

Relacionado: [[agente-pronostico]], [[integracion-visioneflow]], [[conectividad-tailnet]], [[agrodash]], [[capa-agentes]], [[arquitectura-regiones]], [[bloqueantes]].
