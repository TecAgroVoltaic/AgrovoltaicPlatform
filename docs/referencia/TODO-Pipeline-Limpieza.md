# TODO - Pipeline de Limpieza y Estandarizacion de Datos AgroVoltaic

**Fecha:** 2026-05-22  
**Dependencia:** Resolver primero las preguntas en `DUDAS-Pendientes.md`  
**Referencia:** `EDA-Monitoreo-AgroVoltaic.md`

---

## Fase 0: Prerequisitos (resolver antes de tocar datos)

### 0.1 Obtener informacion del sitio
- [ ] Latitud y longitud exactas de la instalacion en Santa Cruz
- [ ] Capacidad instalada del sistema (kWp totales, kWp por string PV1 y PV2)
- [ ] Modelo del inversor (confirmar si es de 1 o 2 strings MPPT)
- [ ] Modelo del piranometro y su sensibilidad (mV per W/m2)
- [ ] Timezone de los timestamps (hora local Bolivia = UTC-4?)

### 0.2 Instalar herramientas
- [ ] `pvlib-python` — modelos clear-sky, posicion solar
- [ ] `pvanalytics` — QC automatizado de irradiancia
- [ ] `pandas` — manipulacion y resampleo
- [ ] Acceso a NASA POWER API (gratuito, sin API key)

**Bloqueo:** Sin lat/lon y kWp no se puede hacer Paso 3 (calibracion) ni Paso 6 (Performance Ratio). Todo lo demas puede avanzar en paralelo.

---

## Fase 1: Limpieza estructural (no requiere info del sitio)

### Paso 1 — Eliminar archivos duplicados exactos
**Prioridad:** Alta | **Esfuerzo:** Bajo | **Riesgo:** Ninguno

- [ ] Eliminar `Monitoreo_2024-12-23(1).csv` (duplicado exacto de `Monitoreo_2024-12-23.csv`)
- [ ] Eliminar `Monitoreo_2025-10-01(1).csv` (duplicado exacto de `Monitoreo_2025-10-01.csv`)
- [ ] Decidir que hacer con los archivos `(N)` que NO son duplicados (ver `DUDAS-Pendientes.md` pregunta 2)
- [ ] Resultado: 275 archivos unicos (o menos si se descartan los fragmentos)

### Paso 2 — Separar filas por tipo de fuente dentro de cada CSV
**Prioridad:** Critica | **Esfuerzo:** Medio | **Riesgo:** Alto si se hace mal

Archivos afectados: ~120 (todos los que tienen filas con distinta cantidad de columnas)

- [ ] Para cada CSV, contar columnas no vacias por fila
- [ ] Clasificar cada fila como:
  - **Tipo INVERSOR:** >10 columnas con valor (voltajes, corrientes, potencias, etc.)
  - **Tipo SENSOR:** 3-4 columnas con valor (irradiancia, temperaturas, timestamp)
- [ ] Validar que el timestamp de cada fila corresponda a la fecha del archivo
- [ ] Almacenar internamente la clasificacion (columna `tipo_fila: inversor | sensor`)

Archivos que sabemos tienen mezcla:
- `Monitoreo_2024-12-25.csv`: 8,657 filas inversor + 886 filas sensor
- Archivos Schema 6 (Nov 2025 - Mar 2026): alternancia inversor/sensor con ~50/50 filas
- Archivos Schema 1 (Dic 2024-12-24,27,28,29): 100% sensor, no necesitan separacion

**Criterio de validacion:** Despues de separar, ninguna fila de tipo SENSOR debe tener valores en columnas del inversor, y viceversa.

### Paso 3 — Mapear los 13 schemas al schema estandar
**Prioridad:** Critica | **Esfuerzo:** Medio | **Riesgo:** Medio

- [ ] Crear un diccionario de mapeo por cada schema que traduzca nombres de columna originales al schema estandar

Mapeos necesarios (de original → estandar):

```
Schema 11 (Nov 2024, 18 cols):
  vpv1 → voltaje_pv1_v
  ipv1 → corriente_pv1_a
  pv1_watt → potencia_pv1_w
  vpv2 → voltaje_pv2_v
  ipv2 → corriente_pv2_a
  pv2_watt → potencia_pv2_w
  pac_total → potencia_total_wac
  freq → frecuencia_hz
  vac1 → voltaje_vac
  iac1 → corriente_aac
  energia_hoy → energia_hoy_wh
  energia_total → energia_total_wh
  temp_inversor → temperatura_inversor_c
  codigo_error → codigo_error
  irradiancia → irradiancia_incidente
  temp1 → temp_vertical
  temp2 → temp_inclinado
  timestamp → timestamp

Schema 10 (Dic 2024, 20 cols):
  (igual que 11) +
  Energìa PV1 → energia_pv1_wh
  Energìa PV2 → energia_pv2_wh

Schema 9 (Dic 2024 - May 2025, 17 cols):
  (igual que 11 pero SIN vpv2, ipv2, pv2_watt) +
  Energìa PV1 → energia_pv1_wh
  Energìa PV2 → energia_pv2_wh

Schema 13 (May-Oct 2025, 20 cols):
  (igual que 10, orden distinto de Energia vs codigo_error)

Schema 12 (Sep-Oct 2025, 20 cols):
  (igual que 13 pero irradiancia → irradiancia_incidente, ya coincide)

Schema 1 (Dic 2024, 4 cols):
  irradiancia → irradiancia_incidente
  temp1 → temp_vertical
  temp2 → temp_inclinado
  timestamp → timestamp

Schema 5 (Oct 2025, 22 cols):
  Voltaje PV1 [V] → voltaje_pv1_v
  Corriente PV1 [A] → corriente_pv1_a
  Potencia PV1 [W] → potencia_pv1_w
  Voltaje PV2 [V] → voltaje_pv2_v
  Corriente PV2[A] → corriente_pv2_a       # OJO: sin espacio antes de [A]
  POTencia PV2 [W] → potencia_pv2_w        # OJO: typo POT
  Potencia total [Wac] → potencia_total_wac
  Frecuencia → frecuencia_hz
  Voltaje [Vac] → voltaje_vac
  Corriente [Aac] → corriente_aac
  Energia hoy [Wh] → energia_hoy_wh
  Energia total [Wh] → energia_total_wh
  Temperatura inversor [°C] → temperatura_inversor_c
  Energìa PV1 [Wh] → energia_pv1_wh
  Energìa PV2 [Wh] → energia_pv2_wh
  codigo_error → codigo_error
  irradiancia_incidente → irradiancia_incidente
  irradiancia_reflejada → irradiancia_reflejada
  albedo → albedo
  temp_vertical → temp_vertical
  temp_inclinado → temp_inclinado
  timestamp → timestamp

Schema 4 (Oct 2025, 22 cols):
  (igual que 5 pero Potencia PV2 [W] sin typo)

Schema 6 (Nov 2025 - Mar 2026, 19 cols — EL MAS COMUN):
  Voltaje PV1 [V] → voltaje_pv1_v
  Voltaje PV2 [V] → voltaje_pv2_v
  Corriente PV1 [A] → corriente_pv1_a
  Corriente PV2[A] → corriente_pv2_a
  Potencia PV1 [W] → potencia_pv1_w
  Potencia PV2 [W] → potencia_pv2_w
  Energia hoy [Wh] → energia_hoy_wh
  Voltaje [Vac] → voltaje_vac
  Corriente [Aac] → corriente_aac
  temp_vertical → temp_vertical
  temp_inclinado → temp_inclinado
  irradiancia_incidente → irradiancia_incidente
  irradiancia_reflejada → irradiancia_reflejada
  albedo → albedo
  timestamp → timestamp
  Corriente PV2 [A] → IGNORAR (duplicada y vacia)
  Potencia total [VA] → potencia_total_wac  # ver DUDA 8: VA vs Wac
  Energía PV1 [Wh] → energia_pv1_wh        # casi siempre vacia
  Energia PV2 [Wh] → energia_pv2_wh        # casi siempre vacia
  NOTA: Frecuencia, Energia total, Temp inversor, codigo_error NO EXISTEN

Schema 7 (disperso Nov 2025 - Feb 2026, 19 cols):
  (igual que 6 pero irradiancia/albedo despues de timestamp)
  Reordenar columnas para que coincida con schema 6

Schema 8 (Dec 2025, 19 cols, snake_case):
  (ya esta en snake_case, mapeo directo) +
  corriente_pv2_a_1 → IGNORAR (duplicada y vacia)

Schema 2 (Mar-May 2026, 22 cols):
  timestamp → timestamp (ya al inicio)
  Voltaje PV1 [V] → voltaje_pv1_v
  ... (mapeo directo, nombres descriptivos)
  Temperatura inversor [C] → temperatura_inversor_c  # sin ° symbol
  Energia PV1 [Wh] → energia_pv1_wh                 # sin acento
  Energia PV2 [Wh] → energia_pv2_wh
  codigo_error → codigo_error

Schema 3 (May 2026, 27 cols):
  (igual que 2) +
  Irradiancia_incidente_SP722 [W/m2] → irradiancia_incidente_sp722
  Irradiancia_reflejada_SP722 [W/m2] → irradiancia_reflejada_sp722
  Detector_incidente_SP722 [mV] → detector_incidente_sp722_mv
  Detector_reflejado_SP722 [mV] → detector_reflejado_sp722_mv
  Albedo_SP722 → albedo_sp722
```

- [ ] Implementar funcion `detectar_schema(header_row) → schema_id`
- [ ] Implementar funcion `mapear_columnas(df, schema_id) → df_estandar`
- [ ] Test: verificar que los 277 archivos se clasifiquen en uno de los 13 schemas

---

## Fase 2: Limpieza de valores (parcialmente requiere info del sitio)

### Paso 4 — Limpiar temperaturas
**Prioridad:** Alta | **Esfuerzo:** Bajo | **Riesgo:** Bajo  
**Dependencia:** Ninguna

- [ ] Reemplazar `temp_vertical == 85.0` → `NULL`
- [ ] Reemplazar `temp_inclinado == 85.0` → `NULL`
- [ ] Reemplazar valores fuera de rango (-10, 70) → `NULL`
- [ ] Interpolar gaps cortos (<=3 registros consecutivos) con `interpolate(method='time')`
- [ ] Dejar como NULL los gaps largos (no interpolar mas de 15 minutos)
- [ ] Registrar: cuantos dias tienen >50% de temperaturas NULL (esos dias no son confiables para PR corregido por temperatura)

### Paso 5 — Limpiar irradiancia (requiere lat/lon)
**Prioridad:** Critica | **Esfuerzo:** Alto | **Riesgo:** Alto  
**Dependencia:** Paso 0.1 (lat/lon y modelo de piranometro)

Fase 5a — Sin calibrar (se puede hacer ya):
- [ ] Reemplazar valores == -38.845008416418494 → 0 (offset nocturno del piranometro)
- [ ] Reemplazar valores negativos → 0
- [ ] Marcar valores > 1500 W/m2 → NULL (si resulta que ya estan en W/m2)
- [ ] Marcar `irradiancia_reflejada > 15000` → NULL (claramente erroneos)

Fase 5b — Calibracion (requiere lat/lon):
- [ ] Calcular irradiancia clear-sky teorica con pvlib (Ineichen model) para la ubicacion
- [ ] Identificar 5-10 dias despejados donde la irradiancia medida deberia coincidir con el clear-sky
- [ ] Comparar picos medidos vs picos teoricos (~1000 W/m2 al mediodia solar)
- [ ] Si los picos medidos son del orden de miles, los datos estan en una escala no calibrada → derivar factor de conversion
- [ ] Si los picos medidos son ~800-1100, ya estan en W/m2 → solo filtrar outliers
- [ ] Validar con datos de NASA POWER para las mismas fechas

Fase 5c — Validacion cruzada con SP722:
- [ ] Para los datos de May 2026 que tienen AMBOS sensores, comparar `irradiancia_incidente` vs `Irradiancia_incidente_SP722`
- [ ] Esto dara el factor de calibracion entre los dos piranometros
- [ ] Extrapolar ese factor hacia atras para corregir datos historicos (si el piranometro original no cambio)

### Paso 6 — Limpiar datos del inversor
**Prioridad:** Media | **Esfuerzo:** Bajo | **Riesgo:** Bajo

- [ ] Valores de potencia negativos → 0 (el inversor no consume)
- [ ] Valores de frecuencia fuera de (59, 61) Hz → NULL
- [ ] Valores de voltaje AC fuera de (100, 280) V → NULL
- [ ] Verificar coherencia: `potencia_pv1_w` deberia ser aprox `voltaje_pv1_v * corriente_pv1_a`
- [ ] `energia_total_wh` debe ser monotonicamente creciente dentro de un dia — si decrece, hay un reset del contador
- [ ] `energia_hoy_wh` debe ser 0 al inicio del dia y crecer — si no, el timestamp del inicio esta mal

---

## Fase 3: Normalizacion temporal

### Paso 7 — Resamplear a intervalo uniforme de 5 minutos
**Prioridad:** Alta | **Esfuerzo:** Medio | **Riesgo:** Medio

- [ ] Unificar timezone (agregar timezone si no existe, confirmar UTC-4)
- [ ] Setear timestamp como indice y ordenar cronologicamente
- [ ] Resamplear a 5 minutos con las siguientes agregaciones:

```
Promediar (mean):
  voltaje_pv1_v, corriente_pv1_a, potencia_pv1_w
  voltaje_pv2_v, corriente_pv2_a, potencia_pv2_w
  potencia_total_wac, frecuencia_hz
  voltaje_vac, corriente_aac
  temperatura_inversor_c
  irradiancia_incidente, irradiancia_reflejada, albedo
  temp_vertical, temp_inclinado
  (SP722 si existen)

Ultimo valor (last):
  energia_hoy_wh, energia_total_wh
  energia_pv1_wh, energia_pv2_wh

Moda o primer valor (first):
  codigo_error
```

- [ ] Agregar columna `intervalo_original_seg` con el intervalo promedio detectado en el archivo fuente (2, 6, 60, 300)
- [ ] Agregar columna `n_muestras` con el numero de filas originales que se promediaron en cada ventana de 5 min

---

## Fase 4: Feature Engineering (requiere info del sitio)

### Paso 8 — Calcular features derivados
**Prioridad:** Media | **Esfuerzo:** Medio  
**Dependencia:** Paso 0.1 (kWp), Paso 5 (irradiancia calibrada)

- [ ] **Clear Sky Index (CSI):** `irradiancia_medida / irradiancia_clearsky_pvlib`
  - Solo calculable si la irradiancia esta calibrada en W/m2
  - Permite comparar dias nublados vs despejados independientemente de la epoca

- [ ] **Performance Ratio (PR):** `(energia_real / kWp) / (irradiancia_medida / 1000)`
  - Requiere kWp instalados
  - Indicador principal de eficiencia del sistema

- [ ] **Specific Yield:** `energia_hoy_wh / kWp_instalados`
  - kWh/kWp por dia

- [ ] **PR corregido por temperatura:**
  - Requiere coeficiente de temperatura del panel (tipicamente -0.4%/C para Si)
  - `PR_tc = PR / (1 + coef_temp * (temp_modulo - 25))`

- [ ] **Produccion estimada PV2 (para Dic 2024 - May 2025):**
  - En ese periodo no hay vpv2/ipv2/pv2_watt
  - Si `pac_total` incluye PV2, se puede estimar: `pv2_estimado = pac_total - pv1_watt`
  - Marcar como estimado, no como medido

---

## Fase 5: Carga a Supabase

### Paso 9 — Disenar schema en Supabase
**Prioridad:** Alta (puede hacerse en paralelo con Fases 1-3) | **Esfuerzo:** Bajo

- [ ] Crear tabla principal `monitoreo_agrovoltaic` con el schema estandar
- [ ] Agregar columnas de metadata: `fuente_archivo`, `schema_original`, `tipo_fila`, `intervalo_original_seg`, `n_muestras`
- [ ] Indices: `timestamp` (primary), `fecha` (para consultas por dia)
- [ ] Considerar particionamiento por mes si la tabla crece mucho

### Paso 10 — Insertar datos limpios
**Prioridad:** Alta | **Esfuerzo:** Bajo (si los pasos anteriores estan hechos)

- [ ] Insertar en orden cronologico
- [ ] Verificar que no haya duplicados de timestamp
- [ ] Validacion final: conteo de filas por mes, % de NULLs por columna, rangos de valores

### Paso 11 — Serie de referencia NASA POWER
**Prioridad:** Baja | **Esfuerzo:** Bajo

- [ ] Descargar datos satelitales de NASA POWER para la ubicacion (GHI, temperatura, viento) para todo el rango Nov 2024 - May 2026
- [ ] Almacenar en tabla separada `referencia_nasa_power`
- [ ] Esto llena los gaps de 126 y 71 dias con datos de referencia (no del sensor, pero si climatologicos)

---

## Fase 6: Validacion

### Paso 12 — Validar datos cargados
**Prioridad:** Alta | **Esfuerzo:** Medio

- [ ] Comparar irradiancia calibrada vs NASA POWER para dias con datos de ambas fuentes — el R2 deberia ser > 0.8
- [ ] Verificar que energia_total_wh sea monotonicamente creciente a lo largo de todo el dataset
- [ ] Verificar que irradiancia sea 0 entre sunset y sunrise (usar pvlib para calcular horas solares)
- [ ] Plot de irradiancia diaria promedio por mes — deberia mostrar patron estacional coherente
- [ ] Verificar coherencia entre los dos piranometros (May 2026) — diferencias > 20% indican problema

---

## Resumen de dependencias

```
Paso 0.1 (info del sitio)
  ├── Paso 5b (calibracion irradiancia)
  │     └── Paso 8 (feature engineering)
  ├── Paso 11 (NASA POWER)
  └── Paso 12 (validacion)

Sin dependencias (pueden empezar ya):
  ├── Paso 1 (eliminar duplicados)
  ├── Paso 2 (separar filas)
  ├── Paso 3 (mapear schemas)
  ├── Paso 4 (limpiar temperaturas)
  ├── Paso 5a (limpiar irradiancia basico)
  ├── Paso 6 (limpiar inversor)
  ├── Paso 7 (resampleo)
  └── Paso 9 (schema Supabase)
```
