---
name: agrodash-esquema
description: Esquema real de la DB de AgroDash (control/agrodash_dev) — modelo caja→sensor→reading, 34 tablas, variables comparables y problemas de calidad
categoria: datos
---

# Esquema real de AgroDash (DB `control`)

Extraído el 2026-06-16. Referencia completa (DDL limpio, sin secretos): `../../referencia/agrodash-control-schema.sql`.
Contexto del sistema: [[agrodash]].

## Modelo núcleo
`boxes` (punto de medición) → `sensors(box_id, sensor_number, type)` → `readings(sensor_id, value, created_at, timestamp_real)`.
- **caja = punto de medición.** Sufijo `SC` en el nombre = San Carlos.
- `sensors.type` (texto libre) define la variable medida.
- 34 tablas: núcleo de sensores, alertas, riego/Kalman (`processes`, `process_valve_events`…),
  experimentos (`experiment_*`, con `soil_id` y texturas de suelo), usuarios/equipos e infra.

## Variables comparables con San Carlos (solo ambientales)
- `irradiancia` (6 sensores) — **solo** en `Caja Irradiancia SC`. **Corregido 2026-06-30:** 26.280
  lecturas/canal a **5 min**, ventana continua **10-mar→30-jun 2026 (~3,7 meses)** tras un gap dic–mar;
  ~calibrada en W/m² (pico ~1.160, offset nocturno −0,3). NO hay irradiancia utilizable de Cartago
  (único sensor no-SC = estación de prueba z6-15052 con 3 lecturas). Timezone almacenado = **local UTC−6**.
- `radiacionPar` (PAR) — solo en `Caja Abioticos 1/2 SC`.
- `temperatura` (32) — en varias cajas (`Caja S`, `A`, `B`, `C`, `D`, + Abioticos SC).
- NO se vio irradiancia/PAR de Cartago (pendiente confirmar mapeo caja→sitio, ver [[bloqueantes]]).

## Problemas de calidad (verificados 2026-06-16)
- **`type` muy inconsistente (~63 valores):** `EC`/`ec`, `P`/`p`,
  `temperatura`/`Temperature`/`Temperatura1..4`, y tres nombres para radiación:
  `irradiancia`/`Solar Radiation`/`radiacionPar`. Más columnas mal ingestadas como tipo
  (`Datetime`, `timestamp`, `Port`, `X-axis level`). → Necesita normalización, mismo mal que
  los CSV ([[schemas-multiples]]).
- **Cajas duplicadas por nombre:** `Caja B`/`Caja-B`, `Caja C`/`Caja-C`, `Caja D`/`Caja-D`.
- **`readings.timestamp_real` suele venir NULL**; `created_at` = hora de inserción; ambos **sin timezone**.
- **Timestamp basura:** `min(created_at)=2011-01-01` (default malo).
- **Irradiancia SC ~calibrada (matiz, 2026-06-30):** los negativos son un dark-offset diminuto
  (~−0,3 W/m²), NO el crudo −38/−15.538 de los CSV PV; `Caja Irradiancia SC` está prácticamente en
  W/m² (a confirmar con overlay clear-sky). La humedad de Cartago es de **suelo** y sí viene cruda
  (cuentas ADC 0–65520, con sensores muertos → QC); la RH de aire solo existe en SC y está stale.
- **Escala:** ~19.4M filas en `readings` → trabajar sobre agregados, no escaneos crudos.

Relacionado: [[agrodash]], [[arquitectura-regiones]], [[irradiancia-sin-calibrar]], [[schemas-multiples]].
