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
| `energia_pv1_wh` | Energía del día del arreglo 1. ⚠️ **En kWh, no en Wh** (ver aviso al final). Es un **acumulador diario**: abre en 0 al amanecer y crece monótono; se toma el **cierre del día**. Solo 144 días con dato, ninguno entre nov-2025 y feb-2026 |

## Inversor — String PV2
| Columna | Qué es |
|---|---|
| `voltaje_pv2_v` | Voltaje DC del string 2 (V) — ausente Dic 2024–May 2025 |
| `corriente_pv2_a` | Corriente DC del string 2 (A) |
| `potencia_pv2_w` | Potencia DC del string 2 (W) |
| `energia_pv2_wh` | Energía del día del arreglo 2. ⚠️ **En kWh, no en Wh**. Mismo comportamiento y misma cobertura que `energia_pv1_wh` |

## Inversor — Salida AC y estado
| Columna | Qué es |
|---|---|
| `potencia_total_wac` | Potencia AC total entregada (Wac) |
| `voltaje_vac` | Voltaje de red AC (V) |
| `corriente_aac` | Corriente AC (A) |
| `frecuencia_hz` | Frecuencia de red (Hz) |
| `energia_hoy_wh` | Energía AC generada en el día (acumulador → `last` al resamplear). ⚠️ **En kWh, no en Wh**. 270 días con dato, **incluidos los 118 de nov-2025 a feb-2026 donde el resto de las columnas AC están en NULL** |
| `energia_total_wh` | Energía AC total histórica (acumulador monótono). ⚠️ **En kWh, no en Wh**. Medido: **no se reinicia ni una vez** en 19.889 lecturas, va de 182,3 a 2.710,7. Se lee como último menos primero, no con `max()` sobre la tabla cruda |
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


---

## ⚠️ Aviso de unidades: las cuatro columnas de energía están en kWh, no en Wh

Medido contra producción el **2026-08-31**, por dos vías independientes: la razón contra
`potencia_total_wac` integrada (que sí está en W) da mediana **1.003,58** sobre 127 días, y el
rendimiento específico implícito da máximo exactamente **5,00 kWh/kWp/día**. Leídas como Wh, esas
columnas darían 14 Wh de producción diaria para 2,84 kWp, mil veces menos de lo posible.

Aplica a `energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh` y `energia_pv2_wh`. **No** aplica a
`potencia_total_wac`, `potencia_pv1_w` ni `potencia_pv2_w`, que sí están en W.

**El sufijo `_wh` del nombre es incorrecto y todavía no se decidió si se renombra o se deja
documentado.** Detalle en `../memoria/inconsistencias/unidades-energia-kwh.md`; la medición
completa, en `medicion-energia-ac.md`.

## ⚠️ Aviso sobre `v_sc_electrico_corregido`

Dos bugs medidos el 2026-08-31: las cuatro columnas de energía **pasan sin ningún `CASE`** (la
vista devuelve los mismos máximos contaminados que la tabla cruda), y el `CASE` de `voltaje_vac`
**anula los ceros que son dato válido** (inversor sin exportar). Detalle en
`../memoria/inconsistencias/vista-corregida-no-corrige.md`.
