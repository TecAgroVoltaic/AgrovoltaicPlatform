---
name: diccionario-variables
description: Diccionario oficial de variables de los datos San Carlos (jun 2026) — 3 tablas fuente: eléctricas/PV (inversor+termocupla+celda+SP722), archivos Fliwer, y nodos abióticos ESP32; con quién mide
categoria: datos
---

# Diccionario de variables (datos San Carlos)

Del doc del equipo `../../referencia/Evaluacion-de-datos.docx` (tablas actualizadas jun 2026).
Definiciones **fuente** de las variables crudas de San Carlos; complementa
`../../referencia/columnas-supabase.md` (que describe la tabla ya limpia en Supabase) y
[[fuentes-fisicas]]. Todo procesado por la Raspberry Pi salvo Fliwer/ESP32.

## Tabla 1 — Eléctricas / PV
- **Inversor FV:** `Voltaje PV1/PV2`, `Corriente PV1/PV2`, `Potencia PV1/PV2`, `Potencia total`
  (AC), `Frecuencia`, `Voltaje`/`Corriente` (AC), `energia_hoy`, `Energia total`,
  `Temperatura inversor`, `Energía PV1/PV2` (día), `codigo_error`.
  - Esto **resuelve la duda `[Wac]` vs `[VA]`** de los headers crudos: `Potencia total` =
    "Potencia Inversor en AC", y la metodología ([[metodologia]]) la especifica en **Wac** →
    ambas variantes se unifican en `potencia_total_wac`.
  - También **resuelve la semántica de los acumuladores**: `energia_hoy` = energía del día,
    `Energia total` = acumulada histórica, `Energía PV1/PV2` = energía **del día** por arreglo.
  - `PV1` = arreglo 1 y `PV2` = arreglo 2, pero la tabla **no dice cuál es vertical y cuál
    inclinado** → sigue pendiente ([[bloqueantes]]).
- **Termocupla FV:** `temp_vertical`, `temp_inclinado` (temp. de cada arreglo).
- **Celda calibrada:** `Irradiancia incidente`, `Irradiancia reflejada` (horizontal);
  `albedo` = reflejada/incidente (calculado).
  - ⚠️ El sensor de irradiancia original es una **celda calibrada analógica** (no un
    "piranómetro"), y la metodología dice que entrega **W/m²** — pero los datos llegan a
    11.265 y con piso −38.845 → **contradicción**: falta aplicar la constante de calibración
    en el procesamiento ([[irradiancia-sin-calibrar]]).
- **SP722:** `Irradiancia_incidente_SP722 [W/m2]`, `Irradiancia_reflejada_SP722 [W/m2]`,
  `Detector_incidente_SP722 [mV]` y `Detector_reflejado_SP722 [mV]` (**crudo en mV**),
  `Albedo_SP722`. `timestamp` = fecha/hora.

## Tabla 2 — Archivos Fliwer (procesa: Fliwer)
`measure time`, `measure time CR` (hora Costa Rica), `temperature (ºC)` (ambiente),
`air humidity (%)`, `light (lux)`, `water (%)` (humedad de suelo), `ec (µS)` (conductividad),
`battery (%)`.

## Tabla 3 — Nodos abióticos (procesa: ESP32)
`timestamp` (hora local); `ppfd_umol` (PAR estimada) e `iphoto_uA` (corriente del **fotodiodo**);
`dht_temp_C`, `dht_hum_pct` (**DHT22**); `rs485_temp_C` (temp. suelo), `rs485_hum_raw`,
`rs485_hum_cal`, `rs485_ec` (**SEN0600 DFRobot**); `analog_hum_pct` (**capacitivo SKU 000538**,
crudo); `n_samples` (muestras por promedio de PAR).

Relacionado: [[fuentes-fisicas]], [[metodologia]], [[dataset-actual]], [[evaluacion-datos]].
