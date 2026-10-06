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
| `barras` | `BarsData` `{categories, series:[{id,label,values,valueLabels?}], unit, orientation?}` | `analitica/irradiacion.py`, `energia.py`, `rendimiento.py` (mensual) |
| `cajas` | `BoxPlotData` `{boxes:[{label,min,q1,median,q3,max,count,outliers?}], unit}` | `analitica/distribucion.py` |
| `carpeta` | `CalendarHeatmapData` `{columns, rows, cells:[{column,row,value}], unit, min?, max?}` | `analitica/carpeta.py` |
| `dispersion` | `ScatterFitData` `{points:[{x,y,label?}], fit:{slope,intercept,r2}|null, xUnit, yUnit}` | `analitica/correlacion.py` |
| `crestas` | `RidgelineData` `{curves:[{id,label,x,density,tailProbability?}], unit, threshold?}` | `analitica/crestas.py` |

- `timestamp` en `serie` es ISO en hora local del sitio **sin sufijo de zona** (igual que
  `/analitica/series`). El frontend lo trata con `app/lib/tiempo.ts`.
- `value` nulo = hueco; nunca 0 en lugar de nulo.
- Tope de puntos por serie: **2.000** (el backend agrega a una granularidad mayor si se pasa,
  y lo dice en `subtitulo`).

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
    "desde": "2026-08-01", "hasta": "2026-09-01",
    "columnas": ["timestamp", "irradiancia_incidente_wm2"],
    "filtros": { "caja": [], "sensor_tipo": [] },
    "paso": 0,
    "filas_estimadas": 8640,
    "cota": false,
    "nombre_sugerido": "radiacion_calibrada_2026-08-01_2026-09-01.csv",
    "url": "/datos/exportar?tabla=radiacion_calibrada&formato=csv&desde=2026-08-01&hasta=2026-09-01&columnas=timestamp,irradiancia_incidente_wm2"
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

### 4.2 Ciclo de vida (seguimiento)

```
nueva ──reconocer──▶ reconocida ──seguimiento──▶ en_seguimiento ──resolver──▶ resuelta
  │                     │                             │                          │
  └──descartar──▶ descartada ◀──────────────────────┘        reabrir ◀──────────┘
```

Tabla de transiciones que **ofrece la UI** (lectura del diagrama hecha por `feat/alertas-frontend`,
en `mvp-debugger/app/lib/alertas/transitions.ts`). El backend es la autoridad: si acepta o rechaza
algo distinto, se corrige esta tabla y ese archivo juntos.

| Estado actual | Acciones ofrecidas |
|---|---|
| `nueva` | reconocer, descartar |
| `reconocida` | seguimiento, descartar |
| `en_seguimiento` | seguimiento (otro evento), resolver, descartar |
| `resuelta` | reabrir |
| `descartada` | reabrir |

El estado al que lleva `reabrir` lo decide el backend; la UI solo pinta la `alerta` que devuelve.

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

### 4.3 Tipos de alerta v1 (`alertas/reglas.py`)

| `tipo` | Deriva de (`hallazgos_calidad.tipo`) | Severidad | Título |
|---|---|---|---|
| `inversor_parado_con_sol` | `inversor_sin_acoplar` con severidad `grave` | grave | "Inversor sin generar con sol pleno" |
| `sensor_temperatura_saturado` | `saturado_85` | aviso | "Sensor DS18B20 saturado en 85 °C" |
| `irradiancia_imposible` | `kt_imposible`, `sobre_maximo_fisico` sobre `irradiancia_*` | aviso | "Irradiancia físicamente imposible" |
| `incongruencia_temp_irradiancia` | `incongruencia_temp_irradiancia` (prueba **nueva**, ver 4.4) | grave | "Temperatura de módulo no responde a la irradiancia" |

`evidencia` guarda al menos `{fechas:[...], hallazgos:[{fecha,fuente,variable,tipo}], cifras:{...}}`.
Cada tipo tiene su entrada en `QUE_ES` (un test ya exige que todo tipo la tenga).

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
`de` es el estado **actual** de la alerta y `a` el destino pedido, ambos con los valores de `estado`.
El frontend acepta el objeto suelto o envuelto en `detail` (lo que produce
`HTTPException(409, detail={...})` de FastAPI). Id inexistente → 404.

`GET /alertas` filtra por `desde`/`hasta` cuando vienen; el frontend **siempre** los manda (el rango
del cascarón). Se asume que una alerta entra si su `[fecha_inicio, fecha_fin]` se solapa con
`[desde, hasta)`; si el backend usa otro criterio, documentarlo acá.

`Alerta` = todas las columnas de la tabla con fechas ISO. `Evento` = `{id, tipo, nota, autor, datos, creado_en}`.

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
