# Contratos compartidos: Asistente analítico y Alertas

**Fecha:** 2026-10-06 · **Estado:** vigente para las cuatro ramas `feat/asistente-*` y `feat/alertas-*`.

Este documento es la frontera entre backend (`agente-historico/`) y frontend (`mvp-debugger/`).
Cada rama implementa su lado contra lo que dice acá y prueba con fixtures que lo cumplan. Si una
rama necesita cambiarlo, lo cambia **acá primero** y avisa; nadie adivina el otro lado.

Principio rector: **el asistente no tiene funcionalidades propias.** Consume las mismas funciones
puras que ya sirven a las vistas (`analitica/*`) y a Descargas (`exportar.py`). Las alertas
**derivan** de hallazgos que ya existen en `hallazgos_calidad`; no re-detectan.

---

## 1. `ChartSpec` — lo que devuelve la tool `graficar`

La tool `graficar` deja de devolver `{tipo:"linea", x, series}` y devuelve un `ChartSpec` cuyo
`datos` es **exactamente** el tipo de datos de una de las seis primitivas de
`mvp-debugger/app/components/charts` (claves en inglés, tal como las exportan `options/*.ts`).
El frontend valida con zod y pinta con la primitiva; no transforma.

```jsonc
{
  "version": 1,
  "tipo": "serie" | "barras" | "cajas" | "carpeta" | "dispersion" | "crestas",
  "titulo": "Irradiancia global (GHI)",
  "subtitulo": "2026-08-01 a 2026-08-31 · media diaria",   // opcional
  "unidad": "W/m2",
  "datos": { /* ver tabla */ }
}
```

| `tipo` | `datos` = tipo del frontend | Algoritmo backend que lo produce |
|---|---|---|
| `serie` | `TimeSeriesData` `{lines:[{id,label,points:[{timestamp,value}],trend?,movingAverage?,deviationBand?}], unit}` | `analitica/series.py` |
| `barras` | `BarsData` `{categories, series:[{id,label,values,valueLabels?}], unit, orientation?}` | `analitica/energia.py` (cierre diario de `energia_hoy_wh`/`energia_pv1_wh`/`energia_pv2_wh`, sumado por bucket), `distribucion.irradiacion_mensual` (irradiancias W/m2 → kWh/m2 por mes), `series.py` (media por bucket del resto) |
| `cajas` | `BoxPlotData` `{boxes:[{label,min,q1,median,q3,max,count,outliers?}], unit}` | `analitica/distribucion.py` |
| `carpeta` | `CalendarHeatmapData` `{columns, rows, cells:[{column,row,value}], unit, min?, max?}` | `analitica/carpeta.py` |
| `dispersion` | `ScatterFitData` `{points:[{x,y,label?}], fit:{slope,intercept,r2}|null, xUnit, yUnit}` | `analitica/correlacion.py` |
| `crestas` | `RidgelineData` `{curves:[{id,label,x,density,tailProbability?}], unit, threshold?}` | `analitica/crestas.py` |

- `timestamp` en `serie` es ISO en hora local del sitio **sin sufijo de zona** (igual que
  `/analitica/series`). El frontend lo trata con `app/lib/tiempo.ts`.
- `value` nulo = hueco; nunca 0 en lugar de nulo.
- Tope de puntos por serie: **2.000** (el backend agrega a una granularidad mayor si se pasa,
  y lo dice en `subtitulo`). En `serie` y `barras` el tope efectivo es 1.500, el que ya impone
  `analitica/fuente.py`. En `carpeta` el tope es de columnas (días, máx. 1.200 por el algoritmo).
- *(2026-10-06, rama asistente-backend)* `barras` no tiene datos de PR mensual: el PR no es una
  variable del catálogo. `energia_total_wh` se rechaza en `barras` (contador de vida, no cierra
  por día). Sin `hasta`, la ventana del gráfico cierra en hoy del sitio (no en 2100).
- `cajas` no manda `outliers` (el algoritmo cuenta atípicos, no guarda sus valores). Un mes sin
  dato viaja con `count: 0` y ceros, igual que `BoxesFigure.tsx`.
- `crestas` normaliza `density` al pico común de todas las curvas; `tailProbability` es `null`
  mientras la tool no reciba umbral.

### Salida completa de la tool

```jsonc
{
  "resumen": { /* lo que el LLM lee: n, min, max, media por serie, periodo, granularidad */ },
  "_grafico": { /* ChartSpec */ },
  "nota": "Grafico de datos reales. Comenta la tendencia; no repitas los numeros."
}
```

El lazo del chat (`agent.py`) ya quita `_grafico` del payload que ve el LLM y lo deja en `pasos`.
Eso no cambia.

### Entrada de la tool (`input_schema`)

```jsonc
{
  "tipo":        "serie|barras|cajas|carpeta|dispersion|crestas",   // requerido
  "variables":   ["irradiancia_incidente_wm2"],                       // claves de analitica/catalogo.py; requerido
  "desde": "2026-08-01", "hasta": "2026-09-01",                       // ISO, hasta exclusivo; opcional
  "granularidad": "hora|dia|semana|mes",                              // solo serie/barras; opcional
  "variable_x": "irradiancia_incidente_wm2"                           // solo dispersion (variables[0] es y)
}
```

Las variables válidas y si son graficables salen de `analitica/catalogo.py` (`GET /analitica/variables`).
Una variable desconocida es `ValueError` con lista de opciones (patrón existente en las tools).

---

## 2. `DescargaSpec` — lo que devuelve la tool `exportar_datos`

La tool **no genera el archivo**. Valida los parámetros con `exportar._ds/_seleccion`, estima con
`exportar.estimar` y devuelve una ficha. El archivo lo sirve el mismo `GET /datos/exportar` de siempre,
y en el navegador lo baja el mismo `descargar()` que usa la vista Descargas (extraído a un hook
compartido). El LLM nunca ve bytes.

```jsonc
{
  "resumen": { "tabla", "fuente", "formato", "filas_estimadas", "cota", "primero", "ultimo", "columnas": ["..."] },
  "_descarga": {
    "version": 1,
    "tabla": "radiacion_calibrada",
    "fuente": "supabase" | "agrodash",
    "formato": "csv" | "dat" | "mat",
    "desde": "2026-08-01", "hasta": "2026-08-31",   // hasta INCLUSIVO, como el endpoint
    "columnas": ["timestamp", "irradiancia_incidente_wm2"],
    "filtros": { "caja": [], "sensor_tipo": [] },
    "paso": 0,
    "filas_estimadas": 8640,
    "cota": false,
    "nombre_sugerido": "radiacion_calibrada_2026-08-01_2026-08-31.csv",
    "url": "/datos/exportar?tabla=radiacion_calibrada&formato=csv&desde=2026-08-01&hasta=2026-08-31&columnas=timestamp,irradiancia_incidente_wm2"
  },
  "nota": "Ofrecele la descarga al usuario; el boton lo pinta la interfaz."
}
```

- `url` es relativa al servicio histórico; el frontend antepone `/api/historico`.
- Si `formato = mat` y `filas_estimadas > max_filas_mat`, la tool devuelve `resumen` con
  `"error": "demasiado grande para .mat; usa csv o acota el rango"` y **sin** `_descarga`.
- `_descarga` se quita del payload del LLM igual que `_grafico`.

Entrada: `{tabla, formato, desde?, hasta?, columnas?, fuente?, caja?, sensor_tipo?, paso?}`, con las
mismas reglas que `GET /datos/exportar`. Las tablas y columnas válidas salen de `exportar.catalogo()`.

*(2026-10-06, rama asistente-backend)* **`hasta`:** en la entrada de la tool es **exclusivo**, como en
todas las tools (el ejemplo de arriba pidió `hasta: "2026-09-01"`). `GET /datos/exportar` toma una
fecha `hasta` como **inclusiva**, así que la tool resta un día y `_descarga.hasta` y la `url` llevan
el inclusivo (`2026-08-31`). Con hora (`2026-09-01T12:00`) es exclusivo en los dos y viaja tal cual.
`desde`/`hasta` son obligatorios en las tablas con columna de tiempo (el error lo da `exportar`).
`columnas` solo va en la `url` si se pidió un subconjunto; `_descarga.columnas` lista siempre las
que saldrán (la temporal primero).

---

## 3. `POST /chat/stream` — eventos SSE

Mismo cuerpo que `POST /chat` (`{mensajes:[{rol,texto}], contexto?}`), mismas dependencias
(`_verificar_api_key`, `_frenar_consumo`), mismo registro de uso al final.
Respuesta `text/event-stream`, un evento por línea `event:` + `data:` (JSON) + línea en blanco.

| `event` | `data` | Cuándo |
|---|---|---|
| `inicio` | `{modelo}` | al abrir |
| `tool_inicio` | `{id, nombre, input}` | antes de ejecutar una tool (la UI muestra "consultando…") |
| `paso` | igual a un elemento de `pasos` de `/chat`: `{tipo:"modelo"|"tool"|"web", ...}` | al cerrar cada paso |
| `texto` | `{delta}` | fragmentos del texto final del asistente (streaming del SDK) |
| `fin` | **el mismo objeto que devuelve `/chat`** `{respuesta, modelo, pasos, usage, costo, ms_total}` | al terminar |
| `error` | `{mensaje, codigo?}` | ante cualquier fallo; cierra el stream |

*(2026-10-06, rama asistente-backend)* Precisiones:
- Los `texto` son los deltas de **todos** los turnos del modelo: el SDK no avisa antes si un turno
  terminará pidiendo una tool. Cada turno cierra con un `paso` `{tipo:"modelo", stop_reason}`; si
  `stop_reason` es `"tool_use"`, el texto acumulado hasta ahí era intermedio. `fin.respuesta` es la
  versión autoritativa del texto final.
- `error.codigo` ∈ `llm_limite` (rate limit del modelo), `llm_no_disponible` (otro error de la API
  de Anthropic), `error_interno`. `mensaje` es genérico y en castellano; el detalle queda en el log.
  Un error antes de abrir (401, 429 de `_frenar_consumo`) sigue siendo HTTP, no SSE.
- Un error dentro de una tool **no** es `error`: sale como `paso` con `error: true` y el lazo sigue.
- El turno del usuario que recibe el modelo empieza con `[Hoy en el sitio: aaaa-mm-dd]` (también en
  `/chat`), para que traduzca fechas relativas a rangos.

`/chat` sigue existiendo sin cambios (lo usa el `ChatWidget` de `/consola`). El proxy Next
(`app/api/historico/[...path]/route.ts`) ya reenvía el cuerpo como stream; la rama de frontend verifica
que `chat/stream` pase la puerta de `app/lib/agentes.ts` y que no se bufferice.

Modelo del asistente: `ANTHROPIC_MODEL_ASISTENTE` (por defecto `claude-sonnet-5-5`). `/chat` y
`/preguntar` conservan `ANTHROPIC_MODEL` (Haiku). Las tarifas van en `costos.py`.

---

## 4. Alertas

### 4.1 Tablas (migración `agente-historico/sql/004_alertas.sql`)

```sql
CREATE TABLE IF NOT EXISTS alertas (
  id               BIGSERIAL PRIMARY KEY,
  clave            TEXT NOT NULL,            -- "{tipo}:{fuente}:{variable}"; agrupa ocurrencias
  tipo             TEXT NOT NULL,            -- ver 4.3
  severidad        TEXT NOT NULL CHECK (severidad IN ('aviso','grave')),
  estado           TEXT NOT NULL CHECK (estado IN ('nueva','reconocida','en_seguimiento','resuelta','descartada')) DEFAULT 'nueva',
  titulo           TEXT NOT NULL,
  descripcion      TEXT NOT NULL,            -- en castellano, para la ficha
  fuente           TEXT NOT NULL,
  variable         TEXT NOT NULL,            -- '*' = día entero
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,            -- última fecha con ocurrencia (inclusive)
  ocurrencias      INT  NOT NULL DEFAULT 1,  -- días en que se vio la condición
  evidencia        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- cifras y refs a hallazgos
  proxima_revision DATE,
  creada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_ocurrencia_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_abierta_por_clave
  ON alertas (clave) WHERE estado IN ('nueva','reconocida','en_seguimiento');
CREATE INDEX IF NOT EXISTS idx_alertas_estado ON alertas (estado, severidad, fecha_fin DESC);

CREATE TABLE IF NOT EXISTS alertas_eventos (
  id         BIGSERIAL PRIMARY KEY,
  alerta_id  BIGINT NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('creada','ocurrencia','reconocida','seguimiento','nota','resuelta','descartada','reabierta')),
  nota       TEXT,
  autor      TEXT NOT NULL DEFAULT 'consola',
  datos      JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_eventos_alerta ON alertas_eventos (alerta_id, creado_en);
-- RLS + GRANT SELECT a joshua_ro, igual que hallazgos_calidad (ver sql/001).
```

**Agregado en la rama `feat/alertas-backend`** (ver `sql/004_alertas.sql`):
- tabla `alertas_evaluaciones (id, desde, hasta, creadas, actualizadas, revisadas, notas, evaluada_en)`,
  una fila por corrida del generador. Es de donde sale `ultima_evaluacion` del resumen: sin ella,
  "nada nuevo" y "el generador no corrió" se ven igual;
- `CHECK (fecha_fin >= fecha_inicio)` y `CHECK (ocurrencias >= 1)` en `alertas`.

### 4.2 Ciclo de vida (seguimiento)

```
nueva ──reconocer──▶ reconocida ──seguimiento──▶ en_seguimiento ──resolver──▶ resuelta
  │                     │                             │                          │
  └──descartar──▶ descartada ◀──────────────────────┘        reabrir ◀──────────┘
```

- **Reconocer** ("aprobar" en la UI): alguien vio la alerta y la da por válida.
- **Seguimiento**: nota obligatoria + `proxima_revision` opcional. Cada seguimiento es un evento;
  la ficha muestra la línea de tiempo completa.
- **Resolver**: nota opcional. **Descartar** ("olvidar" en la UI): la saca de la lista por defecto;
  no se borra físicamente, queda en el historial filtrable.
- **Re-evaluación automática** (`historico alertas`, y al final de `historico todo`): el generador
  recorre los hallazgos del rango. Para cada regla y día:
  - si hay una alerta **abierta** con la misma `clave`: `ocurrencias += 1`, `fecha_fin = fecha`,
    evento `ocurrencia` (idempotente: no suma dos veces el mismo día; la evidencia guarda las fechas).
  - si no hay abierta: crea una `nueva` con evento `creada`. Una alerta cerrada (resuelta/descartada)
    **no** se reabre sola: una ocurrencia posterior a su `fecha_fin` abre una alerta nueva.
  - Si una alerta `en_seguimiento` lleva **7 días** sin ocurrencias nuevas, el generador registra un
    evento `nota` "sin ocurrencias desde {fecha}; se puede resolver" (una sola vez). No cambia el estado.

**Precisiones de implementación** (`alertas/ciclo.py`, `alertas/evaluar.py`):

| Acción | Desde | Hacia | Evento |
|---|---|---|---|
| reconocer | nueva | reconocida | `reconocida` |
| seguimiento | reconocida, en_seguimiento | en_seguimiento | `seguimiento` (se repite) |
| resolver | en_seguimiento | resuelta | `resuelta` |
| descartar | nueva, reconocida, en_seguimiento | descartada | `descartada` |
| reabrir | resuelta, **descartada** | **reconocida** | `reabierta` |

- `reabrir` también desde `descartada` ("olvidar" por error se puede deshacer) y lleva a `reconocida`.
  Si ya hay otra alerta abierta con la misma `clave`, responde **409** `alerta_abierta_existente`.
- `proxima_revision`: el seguimiento la fija (o la borra si no viene), resolver y descartar la borran.
- Los eventos que escribe el generador llevan `autor = "generador"`. Un evento `ocurrencia` por día nuevo
  con `datos = {fecha}`; `creada` con `datos = {fechas}`; la nota con `datos = {sin_ocurrencias_desde}`.
- Los 7 días se cuentan hasta el **último día que cubrió el barrido** (`max(fecha)` de
  `hallazgos_calidad`, acotado por `hasta`), no hasta hoy: si la carga se atrasa, no tener hallazgos
  no significa que el problema se fue. La nota sale una vez por cada `fecha_fin`.

### 4.3 Tipos de alerta v1 (`alertas/reglas.py`)

| `tipo` | Deriva de (`hallazgos_calidad.tipo`) | Severidad | Título |
|---|---|---|---|
| `inversor_parado_con_sol` | `inversor_sin_acoplar` con severidad `grave` | grave | "Inversor sin generar con sol pleno" |
| `sensor_temperatura_saturado` | `saturado_85` | aviso | "Sensor DS18B20 saturado en 85 °C" |
| `irradiancia_imposible` | `kt_imposible`, `sobre_maximo_fisico` sobre `irradiancia_*` | aviso | "Irradiancia físicamente imposible" |
| `incongruencia_temp_irradiancia` | `incongruencia_temp_irradiancia` (prueba **nueva**, ver 4.4) | grave | "Temperatura de módulo no responde a la irradiancia" |

`evidencia` guarda al menos `{fechas:[...], hallazgos:[{fecha,fuente,variable,tipo}], cifras:{...}}`.
En la implementación cada referencia lleva además `severidad`, y `cifras` trae `lecturas_afectadas`
(suma de `n_afectadas`) más el máximo de los campos del `detalle` que importan por tipo
(`ghi_max_wm2`, `lecturas_en_85`, `kt_max`/`peor`, `temp_max`/`ghi_max`).

**Precisiones de implementación:**
- La explicación de cada **tipo de alerta** vive en `alertas/reglas.DEFINICIONES[tipo].que_es`, no en
  `tools/hallazgos.QUE_ES`: ese diccionario es el `enum` de tipos de **hallazgo** y un test prohíbe
  que tenga tipos que ningún detector escribe. El tipo de hallazgo nuevo
  `incongruencia_temp_irradiancia` sí está en `QUE_ES`.
- `inversor_parado_con_sol` usa `variable = '*'`: las tres variables AC del mismo apagón son UNA alerta.
- `irradiancia_imposible` usa la clave del **catálogo** (`irradiancia_incidente_wm2`) aunque
  `kt_imposible` guarde el nombre crudo: el mismo sensor no abre dos alertas.
- `incongruencia_temp_irradiancia` solo toma los hallazgos `grave` (los `info` son días sin juzgar).

### 4.4 Prueba nueva `incongruencia_temp_irradiancia` (`calidad/pruebas/entre_sensores.py`)

Sexta familia: **consistencia entre sensores**. Patrón a copiar: `ContextoDisponibilidad` en
`disponibilidad.py` (irradiancia emparejada por bin de 5 min, nunca por timestamp exacto).

Regla inicial, **pendiente de validación por Hugo** (los umbrales van en `umbrales.py` con esa marca):

- Serie: `temp_inclinado` o `temp_vertical` (fuente eléctrica), emparejada con `irradiancia_incidente_wm2`
  por bin de 5 min dentro de la ventana solar del día (`ventana_solar`).
- Solo se evalúa un día si tiene **≥ 2 h** de lecturas emparejadas con GHI ≥ 300 W/m² y la temperatura
  **no** está saturada en 85 (ese caso ya lo cubre `saturado_85`).
- Es incongruente si se cumple **cualquiera**:
  1. correlación de Pearson temp~GHI del día **< 0,3** (el sensor no sigue al sol);
  2. temperatura máxima del día **< 25 °C** con GHI máximo **≥ 700 W/m²** (módulo frío a pleno sol);
  3. temperatura **> 60 °C** sostenida (≥ 30 min) con GHI **< 150 W/m²** en esos mismos bins (caliente sin sol).
- Un hallazgo por día y variable, `detalle` con `{r, temp_max, ghi_max, bins_evaluados, motivo: 1|2|3}`,
  severidad `grave`.
- Estado `sin_fuente` si falta la irradiancia del día (no se calla: patrón `sin_irradiancia`).

**Precisiones de implementación** (`calidad/pruebas/entre_sensores.py`):
- El `sin_fuente` es un hallazgo `info` del mismo tipo con `detalle = {estado:"sin_fuente",
  motivo:"sin_irradiancia"|"sin_ventana_solar"}`. `info` no toca el veredicto. `sin_ventana_solar`
  cubre el día que `ventana_solar` no tiene (el fallo de `regla-post-carga.md`).
- Un día con **cualquier** lectura en 85 no se evalúa. Un día nublado (menos de 2 h emparejadas con
  GHI ≥ 300) tampoco, y no deja hallazgo.
- `detalle` trae además `motivos` (lista, si se cumple más de uno; `motivo` es el primero),
  `minutos_con_sol`, `minutos_caliente_sin_sol`, `emparejamiento` y `origen`. `r` es `null` si la
  temperatura no varía (y eso dispara el motivo 1).
- `n_afectadas` = lecturas emparejadas del día (motivos 1 y 2) o las de la racha (solo motivo 3).
  El hallazgo grave **sí** entra al veredicto de calidad de `temp_*`: juzga el dato, no el equipo.

### 4.5 Endpoints (`APIRouter` en `historico/alertas/api.py`, montado en `api.py` bajo `/alertas`)

Todos con `_verificar_api_key`.

| Método y ruta | Entrada | Salida |
|---|---|---|
| `GET /alertas` | `estado?` (csv; por defecto `nueva,reconocida,en_seguimiento`), `severidad?`, `tipo?`, `q?` (busca en título/variable), `desde?`, `hasta?`, `limite=20 (1..100)`, `offset=0` | `{total, pagina:{offset,limite,hay_mas,siguiente_offset}, alertas:[Alerta]}` |
| `GET /alertas/resumen` | — | `{por_estado:{nueva,reconocida,en_seguimiento,resuelta,descartada}, abiertas_graves, abiertas_total, ultima_evaluacion}` |
| `GET /alertas/{id}` | — | `{alerta: Alerta, eventos:[Evento], que_es: str, enlaces:{calidad:"/calidad?desde&hasta", series:"/series?variables=..&desde&hasta"}}` |
| `POST /alertas/{id}/reconocer` | `{nota?, autor?}` | `{alerta}` |
| `POST /alertas/{id}/seguimiento` | `{nota (req), proxima_revision?, autor?}` | `{alerta}` |
| `POST /alertas/{id}/resolver` | `{nota?, autor?}` | `{alerta}` |
| `POST /alertas/{id}/descartar` | `{nota?, autor?}` | `{alerta}` |
| `POST /alertas/{id}/reabrir` | `{nota?, autor?}` | `{alerta}` |
| `POST /alertas/evaluar` | `{desde?, hasta?}` | `{creadas, actualizadas, revisadas, rango}` |

Transición inválida (p. ej. resolver una descartada) → **409** con `{codigo:"transicion_invalida", de, a}`.
Id inexistente → 404.

`Alerta` = todas las columnas de la tabla con fechas ISO. `Evento` = `{id, tipo, nota, autor, datos, creado_en}`.

**Precisiones de implementación:**
- Todo error trae `{detail, codigo}` más sus datos: 409 `transicion_invalida` `{de, a}`,
  409 `alerta_abierta_existente` `{id, abierta_id}`, 404 `alerta_inexistente` `{id}`,
  400 `parametro_invalido` (estado/severidad/tipo desconocido), 400 `fecha_ilegible`. Un cuerpo
  inválido (seguimiento sin nota o con nota en blanco, nota > 2000, autor > 80, fecha ilegible en
  `/evaluar`) es **422** de validación de FastAPI.
- `GET /alertas`: `desde`/`hasta` filtran por solapamiento (`fecha_fin >= desde`, `fecha_inicio < hasta`).
  `q` busca en `titulo` o `variable` sin distinguir mayúsculas. Orden: graves primero, `fecha_fin`
  descendente, `id` descendente.
- `GET /alertas/resumen`: `ultima_evaluacion` es el `timestamptz` ISO de la última corrida
  (un instante real, con zona) o `null` si nunca corrió.
- `GET /alertas/{id}`: `enlaces` usan `hasta = fecha_fin + 1` (exclusivo). Las variables de `series`
  dependen del tipo: inversor → `voltaje_vac,potencia_total_wac,irradiancia_incidente_wm2`;
  incongruencia → `{variable},irradiancia_incidente_wm2`; las demás → `{variable}`.
- `POST /alertas/evaluar`: sin rango toma lo que cubre `hallazgos_calidad`. Devuelve además `notas`
  (notas de 7 días escritas) y `referencia_sin_ocurrencias`. `revisadas` = claves con candidatos en
  el rango. Con `hallazgos_calidad` vacío devuelve ceros, `rango: null` y `advertencia`.

### 4.6 Frontend `/alertas`

- Sección nueva en `sections.ts` (etiqueta "Alertas") con icono propio y **contador** de abiertas
  graves en el menú (lee `/alertas/resumen`; se refresca al volver a la vista, sin polling agresivo).
- Lista compacta: una línea por alerta (severidad, título, variable, rango de fechas, ocurrencias,
  estado), filtros por estado/severidad/tipo, búsqueda, paginación. Por defecto solo abiertas.
- Estado de la vista en la query, junto al rango: `estado` (csv de estados; ausente = abiertas),
  `severidad`, `tipo`, `q`, `offset` y `alerta` (id de la ficha abierta, para compartirla).
- Ficha (cajón lateral; pantalla completa en móvil): descripción (`que_es`), evidencia con cifras, enlaces
  a Calidad y Series con el rango de la alerta, línea de tiempo de eventos, acciones según estado
  (reconocer, seguimiento con nota y próxima revisión, resolver, descartar, reabrir).
- Toda acción muestra progreso y error en pantalla; nunca un botón mudo.
- La vista **no calcula nada**: todo número sale del backend.

---

## 5. Frontend `/asistente`

- Sección nueva en `sections.ts` (etiqueta "Asistente"). Chat a pantalla completa, hilos en
  `localStorage` (como el widget), rango de la URL como contexto inicial.
- Consume `POST /chat/stream` por `/api/historico/chat/stream`. Mientras corre: la lista de pasos
  en vivo ("Consultando irradiancia…", "Armando gráfico…"), botón cancelar (`AbortController`).
- Un `ChartSpecRenderer` (zod + las seis primitivas) pinta cada `_grafico` de los pasos. Ese mismo
  componente reemplaza el SVG viejo en `ChatWidget` (una sola forma de dibujar un gráfico del agente).
- Una `DescargaCard` pinta cada `_descarga` con formato, filas estimadas y botón que llama al hook
  `useDescarga` (extraído de `DescargasView.descargar()`: fetch con abort, contador de bytes, blob,
  `<a download>`). `DescargasView` pasa a usar ese hook; no se duplica.
- Cada mensaje del asistente con gráfico ofrece "Descargar estos datos" → envía al chat un mensaje
  que pide `exportar_datos` con las mismas variables y rango (no hay lógica paralela en el cliente).

---

## 6. Reglas comunes a las cuatro ramas

- Sin emojis en código, UI ni commits. Sin atribuciones a Claude en commits ni PRs.
- Identificadores en inglés en el frontend de análisis, textos de UI en castellano; backend en
  castellano como el resto del paquete.
- Frontend: `npx tsc --noEmit`, `npm test`, `npm run lint` y `node scripts/smoke-zona-horaria.mjs`
  en verde. Nada de `getHours`/`toLocaleString` fuera de `app/lib/tiempo.ts`.
- Backend: `pytest -q` en verde, sin red ni base en los tests.
- Responsive: funciona a 360, 768 y 1280 px sin desplazamiento lateral.
- Conflictos conocidos y aceptados: `sections.ts` e `Iconos.tsx` (una entrada por rama),
  `tools/__init__.py` y `api.py` (una línea de registro/`include_router` por rama).
