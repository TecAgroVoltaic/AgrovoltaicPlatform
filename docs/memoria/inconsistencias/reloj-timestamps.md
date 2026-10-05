---
name: reloj-timestamps
description: Las fuentes mezclan convenciones de reloj (PV = hora local etiquetada +00; store ambiental = UTC real; DB AgroDash = naive UTC; API AgroDash = hora local); cómo se detectó y cómo lo trata la exportación
categoria: inconsistencias
---

# Reloj de los timestamps: tres convenciones en las bases

**Detectado el 2026-09-11** al implementar la exportación por rango (ver [[mvp-debugger]]). La
sesión de Supabase corre en `TimeZone = UTC`.

| Dónde | Tipo | Qué guarda realmente | Evidencia |
|---|---|---|---|
| Supabase PV: `monitoreo_sc_electrico`, `radiacion_sc_15s`, `radiacion_sc_clearsky`, vistas… (`timestamp`) | `timestamptz` | **Reloj local CR etiquetado +00** (el ETL de CSV volcó la hora local naive y quedó marcada como UTC) | pico de `potencia_total_wac` por hora "UTC" en mayo 2026: **11–12 h** (solar → es local) |
| Supabase store ambiental: `lecturas_ambientales_sc.ts` | `timestamptz` | **UTC real** | pico de irradiancia por hora UTC: **17 h** = 11 h local |
| AgroDash DB: `readings.created_at` | `timestamp` (naive) | **UTC** (de ahí salió el store vía el ETL del pronóstico) | el DDL lo declara naive; el comentario del schema del store dice "hora local", pero los datos dicen UTC |
| AgroDash **API** (`/readings`, `/readings/last`, `/time-range`) | texto ISO naive | **Hora local CR** (la API convierte UTC→local al salir y espera local al entrar) | `/readings/last` = la hora local actual; los valores coinciden 1:1 con el store convertido a local; pedir la ventana "UTC" devuelve otros datos |

**Consecuencias:**
- Comparar `timestamp >= '2026-05-10'` (naive) en las tablas PV filtra por día local (correcto por
  accidente); en el store ambiental filtra por día UTC (6 h corrido) salvo que el límite lleve zona.
- Convertir las tablas PV a `America/Costa_Rica` **corre todo 6 horas** (error que tuvo la primera
  versión de la exportación). Cualquier código nuevo que use `astimezone` sobre las tablas PV se
  equivoca.
- Las herramientas existentes (`datos.serie`, tools del analizador, ReconView) tratan el reloj como
  local sin convertir, así que son consistentes con la realidad de las tablas PV.

**Tratamiento en la exportación** (`agente-analizador/src/analizador/exportar.py`): cada dataset
declara `reloj` (`local`|`utc`) y `tcol_tz`; todo se emite en **hora local CR sin sufijo** y los
límites del rango se adaptan (PV: naive; store: con `-06:00`; API AgroDash: local naive). Tests fijan
las convenciones. Ojo: el ETL del pronóstico lee la **DB** de AgroDash (UTC), no la API (local).

**Pendiente de decidir (equipo):** normalizar en la base (re-etiquetar las tablas PV a
`America/Costa_Rica`, o guardar UTC real en todas) para que una sola convención valga en todo el
esquema. Mientras no se haga, documentarlo en el diccionario de variables.

Relacionado: [[muestreo-variable]], [[implementacion]], [[pipeline-tiempo-real]].
