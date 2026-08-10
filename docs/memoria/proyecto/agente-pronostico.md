---
name: agente-pronostico
description: MVP — agente LLM que pronostica irradiancia (Caja Irradiancia SC dentro de AgroDash) vía clear-sky + kt*, con reloj simulado; rival estadístico convencional. Fase 0-1 hecha + auditada (Haiku, sin fuga, 47 tests). Próximo: montar en VisioneFlow con DB por URL.
categoria: proyecto
---

# Agente de pronóstico (MVP) — irradiancia por clear-sky + kt*

Proyecto de investigación aparte de la [[capa-agentes]]: comparar un **agente LLM con
herramientas** contra un **modelo estadístico convencional** pronosticando meteorología a
partir de la serie histórica. El LLM **no toca los números**: orquesta (parsea la pregunta,
traduce el horizonte a segundos, decide herramienta, redacta); los números salen de una
herramienta con anclaje físico.

## Decisiones (2026-06-30)
- **Fuente única: AgroDash** (réplica en izack-rig). NO se usa la Supabase PV (queda para otro agente).
- **Variable del MVP: irradiancia** (la rica: nubes estocásticas ancladas por clear-sky).
- **Sitio/datos: `Caja Irradiancia SC`** (San Carlos, dentro de AgroDash). Cartago **no tiene
  irradiancia utilizable** (único sensor no-SC = estación de prueba z6-15052, 3 lecturas).
  Se respeta "solo AgroDash"; lo único que cambia vs. Cartago es el **lat/lon del clear-sky**.
- **Geoloc: San Carlos ~10.33°N, −84.42°O** (nivel ciudad, suficiente para clear-sky). Justificación
  del usuario: se pronostica sobre los datos que hay, y el rival estadístico usa los mismos datos →
  el desajuste de etiqueta de sitio no afecta la comparación.
- **Alcance: Fase 0-1** — lazo del agente (NL → forecast(persistencia inteligente sobre kt*) → NL)
  + **backtest con reloj simulado** (hindcasting walk-forward, sin fuga: el forecaster solo ve
  `timestamp < t_now`; el clear-sky futuro SÍ es lícito, es astronómico). Sin arnés de comparación aún.
- **Humedad (fase 2, Cartago):** en Cartago la humedad es de **suelo** (cruda, cuentas ADC 0–65520,
  densa ~1 min, fresca, con sensores muertos → QC). RH de aire solo existe en SC y está stale.
  Reutilizará la misma interfaz `forecast(variable, horizon_seconds, now)`.

## Hechos de datos verificados (2026-06-30, ver [[agrodash-esquema]])
- Irradiancia SC: 6 canales, **5 min**, 26.280 lecturas/canal, **calibrada en W/m²**
  (pico ~1.160, offset nocturno −0,3; **confirmado por overlay clear-sky 2026-06-30**, la envolvente
  de cielo despejado ~1.013 encaja como techo superior).
- **Timezone almacenado = HORA LOCAL (UTC−6)**, verificado por física (pico solar 11–12h). Sin tz.
- Cobertura continua: **10-mar → 30-jun 2026 (~3,7 meses)**; gap dic–mar. Alcanza para walk-forward
  de horizonte corto; no para estacionalidad anual.

## Método (por qué)
- **kt\* = GHI_medida / GHI_clearsky** (índice de cielo despejado): aísla el efecto de nubes
  (lo estocástico) del ciclo solar determinista. Persistencia sobre kt* = "smart persistence",
  el benchmark estándar en forecasting solar. Reconstruir: `GHI_pred = kt*_pred × clearsky(t+h)`.
- Incertidumbre: banda heurística en PoC → conformal (MAPIE) en fase 2.
- **Techo honesto:** el LLM no gana en exactitud a su propia herramienta; su valor es orquestación,
  ruteo por régimen y explicabilidad. La comparación seria (Fase 3) necesita >1 forecaster para
  que el ruteo sea una decisión real; `A-router-fijo` es el rival clave.

## Pendiente / a validar
- ~~Overlay clear-sky~~ **HECHO 2026-06-30** (`agente-pronostico/scripts/validar_fisica.py`, ver
  `docs/pronostico/01-validacion-fisica.md`): fase/timezone OK (pico medida y clear-sky coinciden a
  las 11h), datos en W/m² (clear-sky ~1.013 como envolvente superior; kt* modo ~0,9–0,95), kt* sano
  (99,2% en [0,1.2], mediana 0,51). Física de-riesgada. Sitio muy nuboso (bueno para el problema).
- **HECHO 2026-06-30** — forecaster de persistencia inteligente + hindcast (1.118 casos, 3,7 meses,
  sin fuga `timestamp < now`): smart le gana a naive en TODO horizonte, skill **+0,13 (30min) → +0,48
  (3h)**; MAE_smart 134→187 vs MAE_naive 153→363 W/m². El error residual alto (sitio nuboso) es el
  hueco a atacar en Fase 2. Código: `agente-pronostico/src/pronostico/{data,physics,forecasters/persistence}.py` + `scripts/hindcast_demo.py`.
  Doc: `docs/pronostico/02-forecaster-hindcast.md`.
- **HECHO 2026-07-01** — capa del agente LLM + paquete limpio en carpeta aparte
  `agente-pronostico/` (paquete `pronostico`, SRP: config/domain/data/physics/forecasters/
  nlu/tools/agent/cli + scripts + tests). Lazo de **tool-use MANUAL** con `claude-opus-4-8`
  (configurable por `ANTHROPIC_MODEL`; sonnet-4-6 como opción barata). El LLM SOLO orquesta:
  `tools/forecast_tool.py` (`forecast(variable, horizon_seconds)`) es el ÚNICO puente a los
  números; `now` = último dato disponible (no wall-clock). Verificado: **pytest 37 OK**,
  hindcast reproduce la skill (+0,127/+0,264/+0,399/+0,483), `run_forecast` coherente. La capa
  física/datos/forecaster se **migró** del viejo `src/pronostico/` preservando la lógica exacta.
  Nota: el "resample a 5min" es decisión del OTRO pipeline (ETL Supabase); acá los datos de
  AgroDash ya son ~5min nativos y el forecaster empareja en cadencia nativa → NO se resamplea
  (`config.RESAMPLE` queda como constante objetivo documentada). `.env.example` listo (falta que
  el usuario complete ANTHROPIC_API_KEY + AGRODASH_PASSWORD). **Consolidado 2026-07-01:** el viejo
  `src/pronostico/` fue eliminado; el agente vive solo en `agente-pronostico/`. Demo sin credenciales:
  `agente-pronostico/probar.py` (motor físico offline desde el caché parquet). Diagrama de arquitectura:
  `agente-pronostico/docs/arquitectura.pdf`. Contraseñas de AgroDash redactadas de [[agrodash]] (pendiente rotar).
- ~~Validar el mapeo caja→sitio~~ **CONFIRMADO 2026-06-30 (Andrés, asistente de Aníbal):** humedad en
  Cartago, irradiancia en San Carlos. El sufijo `SC` = San Carlos queda validado.
- **HECHO 2026-07-01 (tarde) — robustez + auditoría exhaustiva.**
  - **Fixes aplicados:** (4) modelo por defecto → **`claude-haiku-4-5`** (el LLM solo orquesta;
    Haiku alcanza y es ~5× más barato; configurable por `ANTHROPIC_MODEL`; `.env` del usuario ya
    en Haiku). (5) `smart_persistence` usa **MEDIANA** de kt\* + guarda **`MIN_MUESTRAS=3`** (con <3
    kt\* diurnos útiles devuelve NaN = "no sé"); `forecast_tool` distingue **de noche → 0** de
    **de día sin datos → `None` + advertencia**. (6) **validación determinista del horizonte:** el
    LLM pasa `horizonte_texto`, `parse_horizon` recalcula y manda; acotado a [60 s, 6 h].
  - **Bug preexistente arreglado:** `cli.py` chequeaba `ANTHROPIC_API_KEY` **antes** de importar
    `config` (que corre `load_dotenv`) → decía "falta la clave" aunque estuviera en `.env`. Movido el
    import de `config` antes del chequeo. `.env.example` recreado (se había perdido) con default Haiku.
  - **Auditoría (scripts reproducibles en scratchpad `probe_offline.py` / `probe_live.py`):**
    - **Sin fuga (look-ahead):** barrera `get_recent_data` (`< now`) 0 violaciones en 60 instantes;
      **prueba por perturbación** — corromper TODO el futuro no mueve el pronóstico (invariante),
      corromper el pasado sí (test sensible). El forecaster no ve el futuro.
    - **Haiku confirmado en vivo:** intercepté el `model` real de cada respuesta de la API →
      **13/13 llamadas** de `claude-haiku-4-5-20251001` (el alias resuelve al snapshot fechado).
    - **Comportamiento del LLM (9 sondas adversarias, todas OK):** llama la tool con el horizonte
      correcto; fuera de alcance no inventa; se **niega a inventar** aunque se lo pidan; **pide
      aclaración** si falta el horizonte; **resiste inyección** ("responde 500"); avisa el límite de
      6 h; no filtra jerga interna (kt\*, clear-sky) al usuario.
    - **2 defectos reales → arreglados:** (A) `parse_horizon` **sumaba** expresiones que compiten
      ("una hora o dos horas" → 10800 s) y, como pisa la conversión del LLM, podía imponer un
      horizonte falso → ahora es **ambiguo (ValueError)**; el compuesto legítimo "1 hora 30 min"=5400
      se conserva. (B) el contexto reportaba `kt_estrella_reciente` aunque `valor=None` por muestras
      insuficientes → **gateado con `MIN_MUESTRAS`** (coherente: None). Docstrings "media"→"mediana"
      corregidos y comentario de continuidad en `data.py` ajustado.
    - **Datos (parquet caché):** 22.954 filas (10-mar → 30-jun, ~5,5 min). "45,9% negativos" son
      **ruido nocturno** (mín −0,3 W/m²), NO el offset catastrófico de los CSV crudos → benignos
      (se excluyen del kt\*). kt\* máx **3,09** (2 puntos; realce por nubes/sobre-lectura, mitigado
      por la mediana; sin tope superior — clip a ~1,5 es mejora **opcional**). Gap de **~6 días**
      dentro de la ventana (tolerado: None+advertencia tras el gap).
  - **`pytest`: 47 OK** (40 → 47, +7 de regresión para A y B). Sin cambios en el prompt (el LLM ya
    se comportaba bien); todos los arreglos fueron en la capa determinista.

## Próxima fase: montar en VisioneFlow + DB por URL → ver [[integracion-visioneflow]]
- **HECHO 2026-07-02 — DB por URL + perfil de sitio.** `config.conninfo()` prioriza `DATABASE_URL`
  (conectar Cartago = cambiar esa URL, cero código); sitio/caja/canal/ventana/geo por env
  (`SITE_*`, `BOX_NAME`, `IRRADIANCE_CHANNEL`, `WINDOW_*`, `CACHE_FILE`). `pytest` 47 OK, forecaster
  offline idéntico. Detalle en [[integracion-visioneflow]].
- **Planteamiento de integración (2026-07-02):** el LLM lo orquesta el nodo `aiAgent` de VisioneFlow;
  la física vive en un **microservicio Python `/forecast`** (sidecar en la EC2, DB por URL); la
  herramienta es el nodo **genérico `httpRequestTool` ya existente** (configurado por instancia, NO
  a medida — cumple el pedido de que sea reutilizable). Falta: servicio Python + Dockerfile/compose,
  exposición nginx+API key, config del canvas, sumar Haiku al plugin. Todo en [[integracion-visioneflow]].

Relacionado: [[integracion-visioneflow]], [[capa-agentes]], [[agrodash-esquema]], [[bloqueantes]], [[agrodash]].
