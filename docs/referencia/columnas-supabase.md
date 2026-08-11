# Columnas importantes en Supabase (post-EDA)

Tabla: **`monitoreo_agrovoltaic`** — 1 fila = 1 ventana de **5 min** (resampleo).
PK = `timestamp`. Todas las medidas son `DOUBLE PRECISION`. Generado desde
`CONCEPT_MAP` (cero columnas quemadas); ver `src/agrovoltaic/` y `sql/schema.sql`.

## Clave temporal
| Columna | Tipo | Qué es |
|---|---|---|
| `timestamp` | TIMESTAMPTZ (PK) | Inicio de la ventana de 5 min. ⚠️ Timezone sin confirmar (bloqueante) |

## Inversor — String PV1
| Columna | Qué es |
|---|---|
| `voltaje_pv1_v` | Voltaje DC del string 1 (V) |
| `corriente_pv1_a` | Corriente DC del string 1 (A) |
| `potencia_pv1_w` | Potencia DC del string 1 (W) |
| `energia_pv1_wh` | Energía **del día** del arreglo 1 (Wh, según diccionario del equipo) — casi siempre vacía en datos recientes |

## Inversor — String PV2
| Columna | Qué es |
|---|---|
| `voltaje_pv2_v` | Voltaje DC del string 2 (V) — ausente Dic 2024–May 2025 |
| `corriente_pv2_a` | Corriente DC del string 2 (A) |
| `potencia_pv2_w` | Potencia DC del string 2 (W) |
| `energia_pv2_wh` | Energía **del día** del arreglo 2 (Wh, según diccionario del equipo) — casi siempre vacía |

## Inversor — Salida AC y estado
| Columna | Qué es |
|---|---|
| `potencia_total_wac` | Potencia AC total entregada (Wac) |
| `voltaje_vac` | Voltaje de red AC (V) |
| `corriente_aac` | Corriente AC (A) |
| `frecuencia_hz` | Frecuencia de red (Hz) |
| `energia_hoy_wh` | Energía generada en el día (Wh, acumulador → `last` al resamplear) |
| `energia_total_wh` | Energía total histórica (Wh, acumulador monótono) |
| `temperatura_inversor_c` | Temperatura del inversor (°C) |
| `codigo_error` | Código de error del inversor |

## Piranómetro original
| Columna | Qué es |
|---|---|
| `irradiancia_incidente` | Irradiancia incidente — ⚠️ **sin calibrar** (valores negativos/irreales, offset −38.845 → 0) |
| `irradiancia_reflejada` | Irradiancia reflejada — sin calibrar |
| `albedo` | Albedo (reflejada/incidente) |

## Piranómetro SP722 (desde May 2026)
| Columna | Qué es |
|---|---|
| `irradiancia_incidente_sp722` | Irradiancia incidente SP722 (W/m²) |
| `irradiancia_reflejada_sp722` | Irradiancia reflejada SP722 (W/m²) |
| `detector_incidente_sp722_mv` | Lectura cruda del detector incidente (mV) |
| `detector_reflejado_sp722_mv` | Lectura cruda del detector reflejado (mV) |
| `albedo_sp722` | Albedo del SP722 |

## Temperaturas DS18B20
| Columna | Qué es |
|---|---|
| `temp_vertical` | Temp. sensor vertical (°C) — saturación 85.0 → NULL |
| `temp_inclinado` | Temp. sensor inclinado (°C) — saturación 85.0 → NULL |

## Metadata (agregadas por el pipeline)
| Columna | Tipo | Qué es |
|---|---|---|
| `tipo_fila` | TEXT | `inversor` o `sensor` (clasificación de la fila cruda) |
| `fuente_archivo` | TEXT | CSV de origen (trazabilidad) |
| `n_muestras` | INTEGER | Nº de filas originales promediadas en la ventana de 5 min |
| `intervalo_original_seg` | INTEGER | Intervalo de muestreo del archivo fuente (2, 6, 60, 300 s) |

---

**Aún NO existen** (bloqueadas por lat/lon, kWp, timezone, modelo de piranómetro):
irradiancia calibrada en W/m², Clear Sky Index, Performance Ratio, Specific Yield.

**Tabla auxiliar:** `_ingest_log` (filename, md5, rows, processed_at) — controla la
idempotencia de la ingesta, no contiene datos de monitoreo.
