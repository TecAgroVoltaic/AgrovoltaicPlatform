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


## 2026-08-19 — verificación end-to-end tras el cambio de fuente + instante de referencia

Contexto: la fuente del ETL pasó de Cartago vivo a la **réplica del dump en la EC2**
([[agrodash-local]]). Se verificó la cadena entera contra **producción**, no contra commits.

### `scripts/e2e.py` — la prueba, reproducible
Script nuevo (solo stdlib) que ejercita el servicio REAL por HTTP: salud, contrato de
`/forecast` (2 variables × varios horizontes, banda coherente, 400/422), instante de
referencia, write-back en `predicciones`, `/backtest`, `/serie`, `/anomalias`, y el lazo LLM
(`/preguntar` + las dos modalidades de `/chat` + anti-invención).

    BASE=http://127.0.0.1:18000 python3 scripts/e2e.py     # por el túnel a la EC2
    SIN_LLM=1 …                                            # sin gastar tokens

**Resultado (19-ago, contra la EC2): 74 chequeos · 71 OK · 3 avisos · 0 fallas.** La cadena
fuente→ETL→store→forecaster→LLM sobrevivió el cambio de base. Los 3 avisos son conocidos:
ingesta `stale` (outage SC) ×2 y skill 0 % en humedad (ver abajo).

### El hallazgo que habría hundido la demo
El último dato del store es del **23-jul 02:31, de madrugada**. Como el "ahora" del
pronóstico es ese último dato, la irradiancia daba **0 W/m² siempre** (≤3 h: "es de noche")
o **None** (≥5 h: sin kt* nocturno para persistir). Correcto, pero indemostrable.

**Solución: instante de referencia.** `POST /forecast` acepta `ahora` (ISO) y `run_forecast`
lo pasa como `now` — que ya soportaba internamente. Anclar en un momento con sol devuelve un
número real. La respuesta suma dos metadatos:
- **`ancla`** — `{instante, explicito, tipo: ultimo_dato|instante_de_referencia, rango_datos}`.
  Sin esto un hindcast es indistinguible de una predicción en vivo, que es justo la confusión
  a evitar.
- **`medido`** — lo que registró el sensor en el momento pronosticado (+ `error`). **No es
  fuga**: se consulta DESPUÉS y nunca alimenta el cálculo; la barrera `< now` de
  `get_recent_data` sigue intacta (test por perturbación, con control negativo).

Se audita en `predicciones` con el origen sufijado **`:instante-referencia`**: una
reconstrucción no puede contaminar el análisis predicho-vs-real.

### Tres defectos reales encontrados y corregidos
1. **`SYSTEM_PROMPT` desactualizado** (el de `/preguntar`): decía "solo irradiancia" y
   "datos hasta fin de junio de 2026". Ahora cubre las dos variables, explica el
   congelamiento y por qué un pronóstico nocturno da ~0.
2. **Rango histórico mal en el prompt del chat y en el schema de `backtest`**: decía
   `2026-05-01` para todo, pero el backfill del 14-ago llevó la irradiancia a **2025-11-28**
   → el agente rechazaba fechas que SÍ tenían datos.
3. **Mensaje de error del backtest engañoso**: ante un día sin datos decía siempre "el store
   va del X al Y", sugiriendo cobertura continua. El agente respondía *"esa fecha está fuera
   del rango"* y acto seguido citaba un rango que la contenía. Ahora distingue **fuera de
   rango** de **hueco interno** y sugiere los días con datos más cercanos.

### Cobertura real de la serie (NO es continua)
Días con dato por mes (canal de irradiancia elegido): nov-25 **3** · dic-25 **11** (hasta el
día 11) · ene/feb-26 **0** · mar-26 **13** · abr-26 **28** · may-26 **31** · jun-26 **25**
(hueco 14–18) · jul-26 **22** (falta el 3; termina el 23). Total **133 días**. Humedad de
suelo: solo desde 2026-05-01. Elegir fechas de demo dentro de estos tramos.

### Límite honesto de la humedad de suelo
En el backtest, el método de humedad (`shift(1)` del bucket) **coincide con el baseline
ingenuo** → skill 0 % por construcción, no por mal modelo. Es lo esperable en una variable
lenta y muy autocorrelada. La consola ahora lo muestra como **n/a** con la explicación, en
vez de "+0 %". El valor sigue siendo **crudo del ADC** (sin curva de calibración: sigue en
[[bloqueantes]]) y el prompt obliga a decirlo.

**Desplegado en la EC2** (rsync de `src/` + rebuild del sidecar `forecast-forecast-1`);
respaldo del código anterior en `.rollback-src`. **128 tests** en local.

## 2026-08-19 (tarde) — el agente se hace cargo de su pronóstico

Cambio de criterio pedido por el usuario, y no contradice la regla anterior: son dos cosas
distintas. **Procedencia** (el número sale de una herramienta determinista y auditable, no de
la intuición del modelo) se mantiene intacta. **Responsabilidad** cambia: la predicción es
*del agente*. Antes decía «el método predijo 95»; ahora dice «predije 78, me equivoqué feo».

Por qué importa y no es cosmético: si el valor no es tuyo, no tenés que explicar por qué
falló. La apropiación es lo que obliga al análisis crítico.

`CHAT_SYSTEM` incorpora tres reglas: hablar en primera persona sin despegarse («el algoritmo
dice» está prohibido), **analizar en vez de narrar** (las cifras ya están en pantalla; el
aporte es el mecanismo y la escala del error) y **ser crítico consigo mismo** (si le fue mal,
empezar por ahí; si le fue bien, distinguir mérito de suerte).

### Lo que hizo falta para que el juicio fuera honesto
Un error suelto no permite juzgar: +45 W/m² puede ser excelente a mediodía y catastrófico al
amanecer. `punto_consultado` suma **`error_relativo_pct`** y **`veces_el_error_tipico_del_dia`**,
para que el veredicto salga de una razón y no de una impresión.

### Dos defectos de interpretación cazados en pruebas
1. **El agente invirtió la física.** Con el campo `kt_estrella: 0.054` leyó el nombre «índice
   de cielo despejado», vio un número chico y concluyó *«muy despejado»* — justo al revés:
   0,054 significa que pasó el 5 % de la luz, o sea cielo CERRADO. Se renombró a
   **`pct_del_techo_que_paso: 5.4`**, que no se puede leer al revés, con la escala explicada
   en la nota de la herramienta (cerca de 100 = despejado; cerca de 0 = cerrado).
2. **Explicaba con el número equivocado.** El método persiste la claridad del momento
   ANTERIOR, no la del momento evaluado, y el agente citaba la de este. Se agregó
   **`momento_anterior`** con su hora y su porcentaje.
   También se le prohíbe redondear las razones («1,6 veces» no es «casi dos veces y media»).

## 2026-08-19 — BUG del backtest: el techo se evaluaba en el borde de la franja

Encontrado al documentar las fórmulas. `cs = clear_sky_ghi(s.index)` tomaba el cielo despejado
del **instante inicial** de cada franja en vez del promedio de la franja:

- Con `bucket="D"` ese instante es la **medianoche** → techo 0 → kt* NaN → **`pred = 0` todos
  los días**, con métricas de forma plausible y sentido nulo (skill −26 %). Y `"D"` está en el
  enum que ve el LLM: bastaba pedir «cómo te fue la última semana, por día» para que narrara
  ese disparate.
- Con franjas horarias el sesgo era menor pero real: a las 07:00 usaba el techo del minuto
  cero (386 → antes 264), y por la mañana el techo sube rápido.

Corregido: el techo se calcula a resolución nativa y se **promedia con la misma regla** que la
medida. Comparar media contra media es lo único coherente y funciona en cualquier resolución.
Tras el arreglo, `bucket="D"` da skill **+28 %**. Cambian las cifras publicadas: el MAE del
22-jul pasa de 32,0 a **28,9 W/m²** (`docs/conceptos/anticipacion/` regenerado).

## 2026-08-19 (noche) — el agente pasa de traductor a pronosticador

Planteo del usuario: el modelo solo aportaba una justificación crítica de un número que no
podía cambiar. Un traductor que gasta tokens. Debería poder **intervenir sobre el método**.

### El intento equivocado, y por qué se descartó
Primera versión: una tool `comparar_configuraciones` que probaba perillas y devolvía el error
de cada una, con partición ajuste/reservado para evitar el sobreajuste. **El usuario la
rechazó con un argumento más fuerte que el mío:** el agente NUNCA puede tener la respuesta.
Aunque se parta el periodo, elegir mirando el error no es predecir — es ajustar. Se borró
entera (tool, endpoint y `backtest.comparar`).

### El diseño correcto: hipótesis, no ajuste
El agente elige la configuración **razonando sobre condiciones observables antes del hecho**:

- **`diagnosticar_condiciones`** — cómo venía el cielo en los minutos previos (claridad
  mediana, dispersión, tendencia, saltos bruscos, régimen) + cuánto sube el techo en el
  horizonte (astronómico, lícito) + la **teoría** de qué hace cada perilla y cuándo debería
  ayudar. El corte de datos es `instante − horizonte`.
- **`contexto_historico`** — qué pasó a esa misma hora en los días anteriores y en qué
  régimen viene el sitio. Aporte real: el 22-jul a las 08:00 lo típico de esa hora en 7 días
  era 21,4 % y venía con 11,9 % — por debajo del mínimo de la semana. Sin fuga por
  construcción: un día anterior es anterior al corte.
- **`predecir`** — se compromete con un número usando la configuración elegida.
  **`hipotesis` es obligatoria en el esquema**: si fuera opcional, el modelo pediría el
  número y después inventaría el motivo.

Perillas (en el forecaster REAL, no en el backtest): `lookback_min`, `estadistico`
(mediana/media/último) y `kt_max` (tope al realce por nubes).

### La garantía no es el prompt: es el juego de herramientas
`chat()` acepta un **modo**. En `medicion_oculta` las herramientas son las tres de arriba y
**`backtest` no está**: es la única que revela lo medido. Un prompt se puede ignorar; una
herramienta ausente no se puede llamar. `medicion_visible` (el modo por defecto) la conserva,
porque ahí ver el resultado *es* el objetivo. Cubierto por tests que verifican el juego de cada modo
y que ni `predecir` ni los diagnósticos devuelven claves del resultado en ningún nivel.

### Verificado en producción
Pidiéndole las 08:00 del 22-jul: diagnosticó, consultó 7 días, eligió `kt_max=1.2`
argumentando el cielo más cerrado de lo normal, predijo **56,8 W/m² (banda 41,8–71,7)** y
declaró **confianza media** diciendo qué lo haría fallar — todo antes de conocer el
resultado. Frente a los 78,1 de la configuración por defecto, su razonamiento lo acercó al
valor real (32,8).

**Pendiente:** cablear el flujo de dos fases en la consola (el agente predice a ciegas, la
consola revela y puntúa). Hoy funciona por `/chat` con `modo=medicion_oculta`.

Relacionado: [[integracion-visioneflow]], [[capa-agentes]], [[agrodash-esquema]], [[bloqueantes]], [[agrodash]], [[pipeline-tiempo-real]], [[mvp-debugger]].

## 2026-08-19 (noche) — `GET /arquitectura`: el agente descrito como dato

Endpoint nuevo (`src/pronostico/arquitectura.py`, SRP igual que `salud.py`) que devuelve **el
agente como estructura**: modos, catálogo de herramientas con su `input_schema` completo,
frenos y cobertura de datos. Lo consume la vista de arquitectura de la consola (ver
[[mvp-debugger]]).

**La regla del módulo: no declara, deriva.** Los nombres, los parámetros, los rangos y la
pertenencia a cada modo salen de `agent.MODOS` y de los esquemas reales — los mismos objetos
que se le mandan al modelo. No hay una segunda lista que mantener sincronizada, así que la vista
no puede quedar desfasada del código. Que `backtest` aparezca marcada como exclusiva de
`medicion_visible` no lo escribió nadie: se deduce de dónde está.

Tres decisiones que valen la pena:
- **El horizonte se lee del esquema**, no de `_MIN_SEG`/`_MAX_SEG`. Si alguna vez discreparan,
  manda lo que el modelo tiene enfrente. (Es el mismo criterio que ya usaba `api.py`.)
- **`_rango_datos` se promovió a `data.rango_datos(variable)`**: era privada en
  `forecast_tool.py` y ahora hay una sola fuente del rango, con `n` de filas.
- **El bloque `datos` no puede tumbar el endpoint**: si el store está caído devuelve
  `{"error": ...}` por variable y el resto responde 200. La arquitectura del agente no depende
  de que hoy haya datos.

No expone el texto de los prompts: cada modo viaja con una frase de intención escrita en el
módulo. Auth y frenos como `/salud/panel` (`x-api-key` + límite de datos).

**Pruebas**: `tests/test_arquitectura.py` (13). Casi todas comparan contra `agent.MODOS` /
`limites` / los esquemas en vez de literales — un test con los nombres a mano se desincronizaría
igual que el archivo estático que el endpoint vino a evitar. Cubren también que ninguna
herramienta del modo ciego acepte un parámetro con el resultado, que el store caído degrade solo
su bloque, y el 401 sin clave. **159 tests en total.**

**Desplegado en la EC2** (rsync de `src/` y `scripts/` + rebuild de `forecast-forecast-1`;
respaldo en `.rollback-src`). **e2e contra producción: 72 chequeos, 0 fallas**, 3 avisos
conocidos (ingesta congelada desde el 2026-07-23, skill 0 % de humedad por construcción). El
bloque 6 del e2e es nuevo y verifica desde afuera que el modo `medicion_oculta` no publique `backtest`
ni búsqueda web.

## 2026-08-19 (noche) — el acumulado de `/uso` vivía en un lugar efímero

**Síntoma:** la vista «Costo y uso» mostraba US$0 y 0 consultas el mismo día en que
`/salud/panel` reportaba US$0,342846 gastados. La vista no mentía: `/uso` devolvía ceros.

**Causa.** El acumulado se guardaba en `DATA_DIR/uso.json`, dentro del contenedor. Y el
contenedor **no tiene volumen**: `docker inspect forecast-forecast-1` devuelve `Mounts: []`,
así que `/app/data` vive en la capa escribible y se va con ella. `forecast-refresh.timer`
recrea el contenedor **cada 6 h**, o sea que el acumulado se borraba hasta 4 veces por día.

Lo revelador es que el problema ya estaba diagnosticado en el repo: el docstring de `gasto.py`
lo describía palabra por palabra. Se había resuelto para el **tope de presupuesto** (moviéndolo
al store) y se había dejado atrás para `/uso`. Dos registros del mismo evento en dos lugares
distintos, uno durable y otro no.

### Tabla `uso_diario`: una fila por (día UTC, modelo)

Reemplaza a `gasto_diario`, que solo tenía `usd` y `n_consultas`. Suma tokens de entrada y
salida, tokens de cache leídos y escritos, `requests` (llamadas a la API, ≥ consultas por el
lazo de tools), búsquedas web y USD.

**Por qué `modelo` en la clave y no un JSONB:** sumar es trivial en el `UPSERT`, el desglose
sale con un `GROUP BY` en vez de con un merge de JSON, y al cambiar de modelo la historia queda
atribuida sin migrar nada. Crecimiento acotado (~365 filas por año y modelo), que importa
estando al 79 % del Free tier ([[cuota-store-supabase]]).

**Por qué NO en VisioneFlow** (fue la propuesta inicial): el presupuesto ya vive en Supabase y
partir el registro del mismo evento en dos bases reproduce el bug que se está arreglando;
VisioneFlow es otro producto con migraciones propias; es un *consumidor* del agente, no su
dueño (el agente también responde desde la consola y desde curl, y eso quedaría sin contar); y
el sidecar no tiene credenciales de esa base.

### Un solo escritor

`api._registrar_uso` hacía dos escrituras por consulta (`uso.registrar` al JSON y
`gasto.registrar` al store). Ahora es una: `uso.registrar(traza)` escribe primero el store con
un `UPSERT` que lleva todo, y después el espejo local. Dos escritores sobre la misma fila es la
receta para contar doble al refactorizar; hay una prueba que lo fija.

El JSON local queda como **espejo**: si el store no responde, `/uso` cae a él y lo **declara**
en un campo `fuente` (`store` / `espejo-local`). Un número más chico de lo real sin su
procedencia al lado es peor que no tenerlo.

## 2026-08-19 (noche) — el panel de salud dice de dónde vienen los datos

El panel mostraba «ETL corrió hace 11 min» y la ingesta en `stale`, sin explicar por qué esas
dos cosas conviven. Faltaba el hecho central: **la fuente es una réplica de un dump**, así que
el ETL puede correr verde para siempre y no entrar una sola fila.

Módulos nuevos:
- **`fuente.py`** — identidad legible del origen, derivada de `config.conninfo()`. Clasifica por
  host: loopback → `replica_dump` (`es_snapshot: true`), hosts conocidos de la tailnet →
  `base_viva` / `replica_remota`, cualquier otro → `desconocido` con `es_snapshot: null`.
  **Falla hacia «no sé», nunca hacia una afirmación falsa**, y viaja el `criterio` en texto
  porque es una inferencia, no algo que la base declare. Solo host, puerto y base: nunca
  usuario, clave ni la URL entera (hay una prueba que serializa el dict y lo verifica).
- **`etl_estado.py`** — última corrida con `ok`, `filas_leidas`, `filas_insertadas`, duración y
  desglose por variable, más `etl_fallando` (true cuando el último error es **posterior** a la
  última corrida completa, que es el caso que engaña: la fuente cae, el ETL revienta antes de
  registrar la corrida, y la última «verde» queda vieja).

La distinción que ordena todo: **«corrió bien» y «trajo datos» son cosas distintas.** Hoy
`ok: true` con `insertadas: 0`, y el panel ahora lo dice con esas palabras.

`/salud/panel` dejó de responder 503 por infraestructura: degrada bloque a bloque y el de
`fuente` sobrevive, que es justo cuando más hace falta saber a qué base se apuntaba.

**La vista** (`SaludView.tsx`) se reordenó alrededor de eso: arriba un diagnóstico que se lee
como titular («No entran datos nuevos desde hace 27,5 días» + por qué no pueden entrar), después
fuente y store lado a lado (se confunden todo el tiempo), y recién ahí las tablas.

**Hallazgo abierto:** `/salud/ingesta` es público y devuelve `ultimo_error_etl.error` crudo, que
hoy incluye un fragmento de `COPY` con un UUID y el nombre de una caja. Preexistente; suma a
[[superficie-expuesta]]. El arreglo limpio es truncar el mensaje solo en la ruta pública.

## 2026-08-19 (noche) — por qué el panel de salud tardaba, medido

Reporte: «la sección de salud dura 3 segundos cargando». Medido antes de tocar nada:

| Camino | Antes |
|---|---|
| `panel()` dentro del contenedor, caliente | 225 ms |
| endpoint por el túnel SSH | 450 ms |
| **primera llamada tras recrear el contenedor** | **2.080 ms** |

O sea: el endpoint nunca fueron 3 s. Los 3 s son la **primera** llamada, y el contenedor se
recrea cada 6 h (`forecast-refresh.timer`), así que el primero que abre la consola después de
cada recreate los paga. A eso se suma, **solo en local**, `reactStrictMode: true` (React monta
los efectos dos veces en dev, o sea dos peticiones) y la compilación de `next dev`. Nada de eso
existe en Amplify.

### Dos problemas reales que sí aparecieron

**1. El mismo número pedido dos veces, y podían contradecirse.** `observabilidad._presupuesto()`
llamaba a `gasto.usd_hoy()` una vez dentro de `limites.presupuesto_agotado()` y otra para el
flag `medido`. Además de duplicar el viaje al store, si el store fallaba **entre las dos**, el
panel podía mostrar un número del espejo local rotulado como medido, o un número bueno rotulado
como no medido. Ahora se lee una sola vez y se pasa: `presupuesto_agotado(gastado_hoy=...)`,
con centinela porque `None` es un valor legítimo («el store no respondió»), no «no me lo
pasaron».

**2. Un `count(*)` sobre 885.606 filas en el camino caliente.** La vista `v_salud_ingesta`
resolvía `max(ts)` y `count(*)` de una pasada: 172 ms de índice recorrido entero, y **crece con
la tabla**. Se separaron porque no cuestan ni valen lo mismo:
- `max(ts)` **decide** el estado y sale del índice `(variable, ts)` en **0,7 ms** por variable.
  Siempre fresco. Las variables salen del dominio, no de un `DISTINCT` (que también recorría todo).
- `filas` es contexto para el lector, no dispara ninguna alerta. Se cachea 5 min: solo cambia
  cuando el ETL inserta, y el ETL corre cada ~6 min.

| Camino | Después |
|---|---|
| `panel()` dentro de la EC2, caliente | **85 ms** (era 225) |
| endpoint por el túnel, caliente | **190 ms** (era 450) |

**En la vista:** el último panel queda cacheado a nivel de módulo, así que volver a la sección
lo muestra al instante y refresca por detrás en vez de arrancar en blanco. Y si el refresco
falla, ya no borra lo que había: avisa y deja la última lectura buena.

## 2026-08-19 (noche): el pronóstico de irradiancia estaba sesgado, y la causa no era desconocida

**Reporte:** «cada vez que hago pruebas el valor predicho está muy lejos del real,
por causa desconocida». Medido sobre los 78 días de la serie cacheada (2026-05-01 a
2026-07-23, 19.731 lecturas): no era un desajuste, eran **tres omisiones
estructurales del método**, todas medibles y reproducibles con
`agente-pronostico/scripts/calibrar.py`.

### Lo que se descartó primero, para no gastar tiempo ahí

| Sospecha | Veredicto | Evidencia |
|---|---|---|
| Timezone / fase del clear-sky | sano | pico medido mediana 11,73 h vs clear-sky 11,62 h |
| Altitud (600 m) | **no era el problema** | a 170 m el techo empeora; Open-Meteo reporta 629 m en esa celda |
| Modelo Ineichen | sano | días claros con elevación > 30°: p95 de kt\* entre 0,97 y 1,04 |
| Calibración del sensor | sana | offset nocturno −0,3 W/m², pico 1.147, envolvente coherente |

### Los tres defectos reales

1. **El método ignoraba el ciclo diurno de nubosidad.** kt\* medio por hora local:
   0,44 (6 h) → 0,58 (11 h) → **0,35 (16 h)**: convección tropical de tarde,
   sistemática y estable. Persistir la mañana hacia la tarde daba, a 3 h de
   anticipación, **−27 % de sesgo a las 11 h y +37 % a las 16 h**. No era
   dispersión: era sesgo con signo predecible por la hora.
2. **La persistencia no se amortiguaba.** Autocorrelación de kt\*: 0,90 (5 min) ·
   0,52 (1 h) · 0,31 (3 h) · **0,13 (6 h)**. A 6 h se conservaba el 100 % de la
   anomalía cuando solo el 13 % estaba justificado.
3. **La banda mentía y no crecía con el horizonte.** Cobertura empírica de la
   banda ±1σ (debería rondar 68 %): **43 % a 30 min y 25 % a 6 h**, con el ancho
   clavado en ~150 W/m² mientras el RMSE real iba de 154 a 229.

Dos hallazgos más, de estructura: **el backtest evaluaba un método distinto del que
predecía** (`backtest._kt_a_persistir` vs `persistence.smart_persistence`, con
juegos de perillas diferentes, y `damping` existía solo en el camino que NO
predice), y **`kt_max` es cosmética** (moverla entre 1,2 y 2,0 cambia el error menos
de 0,5 W/m², pero `diagnostico.TEORIA` se la presentaba al agente como una decisión
relevante).

### Qué se hizo

Módulos nuevos, una idea por archivo:

- **`forecasters/climatologia.py`**: qué es normal en este sitio a esta hora y a
  este horizonte. Ventana móvil de 30 días por hora del día, definida como
  Σ(medida)/Σ(techo) para que sea comparable con el kt\* por franja del backtest.
  Corte llevado al inicio del día (`normalize()`): **más estricto que `< now`**, el
  día en curso no entra en «lo típico».
- **`forecasters/estimador.py`**: **única fuente de verdad del método**, escalar y
  vectorizada. Lo comparten el forecaster en vivo y el backtest, y hay un test que
  los obliga a coincidir.
- **`physics.mezcla_convexa`**: `clima_objetivo + peso × (reciente − clima_reciente)`.
  Dos correcciones separables: el **ajuste diurno** (los dos climas) y la
  **contracción** (el peso).
- **`forecasters/uncertainty.banda_empirica`**: cuantiles 16/50/84 del error real
  del método a ese horizonte. El 50 corrige el punto (contraer hacia un promedio,
  en un sitio donde lo normal es estar tapado, corre el pronóstico hacia arriba).

Tres decisiones que vale registrar:

- **El peso se DERIVA, no se declara**: es la autocorrelación medida al lag pedido.
  Mismo criterio que `arquitectura.py`; si el sitio cambia, el número se mueve solo.
- **Rampa en vez de umbral.** Contraer no conviene siempre: a 30 min cuesta ~10 W/m²
  de MAE y apenas mejora el sesgo; a 6 h gana en todo. El cruce cae cerca de las 2 h,
  y el peso se interpola entre 1 h y 3 h en vez de saltar (un corte duro haría que
  7199 s y 7201 s dieran pronósticos distintos por un segundo de diferencia).
  **Los dos límites salen de 78 días y NO son constantes de la física.**
- **Calibración offline, con partición fija, congelada en el código.** El agente no
  elige nada mirando el error al predecir. Misma línea que al borrar
  `comparar_configuraciones`.

### Resultado, fuera de muestra (`scripts/calibrar.py`)

Segunda mitad de la serie, con climatología día por día como corre en producción:

| Horizonte | MAE antes → ahora | RMSE antes → ahora | Sesgo antes → ahora | Cobertura antes → ahora |
|---|---|---|---|---|
| 30 min | 101,3 → **97,1** | 153,7 → **144,8** | −7,5 → −7,1 | 43 % → **73 %** |
| 1 h | 113,8 → **111,4** | 167,5 → **160,9** | −12,1 → −12,8 | 40 % → **75 %** |
| 2 h | 138,3 → **131,5** | 199,2 → **176,9** | −23,2 → −12,1 | 34 % → **76 %** |
| 3 h | 157,8 → 158,6 | 221,9 → **203,0** | −38,3 → **−6,1** | 30 % → **68 %** |
| 6 h | 160,5 → **153,7** | 228,8 → **202,8** | −54,5 → **−4,1** | 25 % → **65 %** |

Amplitud del sesgo a lo largo del día (3 h de anticipación): **64 puntos → 24**.

**Límite conocido, medido y no tapado:** a las 16 h queda −19 % de sesgo, que en
W/m² son −19 sobre un real medio de 101 (el error absoluto más chico del día; el
MAE de esa hora bajó de 71 a 42). El criterio de aceptación se deja como estaba en
vez de aflojarlo: cambiarlo después de ver el resultado es el error que el arnés
existe para evitar. Y el error relativo se queda en 35-45 % aunque todo salga bien:
**ese es el techo del sitio** (kt\* mediano 0,44), no del código.

### El addon opcional: modelos numéricos (`forecasters/nwp.py`)

Pedido explícito: probarlo **sin depender de él**. Apagado por defecto
(`NWP_HABILITADO`); si Open-Meteo no responde, todo sigue igual.

Lo que se midió antes de construirlo:

- `shortwave_radiation` del modelo: correlación 0,23 en kt\* y **+93 W/m² de sesgo**.
  El modelo global no resuelve la nubosidad convectiva local.
- **API de satélite: devuelve `nan` para estas coordenadas.** SARAH3, Himawari y MTG
  no cubren Centroamérica, y Open-Meteo **no ha integrado GOES** todavía.
- **`cloud_cover` SÍ tiene señal**: correlación −0,33 y monótona (0-25 % de nubes →
  kt\* 0,72; 75-100 % → 0,46). Es lo que se usa.
- **Cinco modelos, no uno**: ninguno solo pasa de R² 0,13 (icon 0,129 · gem 0,121 ·
  meteofrance 0,125 · ecmwf 0,119 · gfs 0,076); juntos llegan a **0,25** fuera de
  muestra. Sale gratis.

Con el peso de mezcla derivado por mínimos cuadrados **a resolución nativa** (por
hora le quitaba al método propio su ventaja de corto plazo) y la misma rampa:

| Horizonte | peso modelos | MAE sin → con | RMSE sin → con |
|---|---|---|---|
| ≤ 1 h | 0,00 | sin cambio | sin cambio |
| 2 h | 0,27 | 131,5 → 132,5 | 176,9 → **175,5** |
| 3 h | 0,60 | 158,6 → **155,8** | 203,0 → **199,6** |
| 6 h | 0,86 | 153,7 → **141,1** | 202,8 → **187,7** |

**Pendiente que vale la pena:** NSRDB de NREL (PSM v4, GOES Full Disc) da GHI
satelital a 4 km / 30 min **desde 1998 y sí cubre Costa Rica**, gratis con registro.
No sirve para pronosticar (es histórico), pero resolvería el límite de fondo de la
climatología: hoy se arma con 78 días y no cubre un ciclo estacional. También
serviría para validar el sensor de forma independiente.

**Pruebas: 236** (`test_climatologia.py` 15, `test_nwp.py` 12, más las de siempre).
La anti-fuga se extendió a las dos superficies nuevas (climatología y calibración
del addon), con control negativo en las dos.

## 2026-08-19 (noche): riesgo de nubes, cuantificar lo que no se puede anticipar

Planteo del usuario: saber si hay nubes, o la probabilidad de que haya, debería
tener impacto grande en el agente. Antes de construir la tool medí si el dato
existe y si es predecible, porque una "probabilidad de nubes" que solo repita la
climatología no aporta nada que el método ya no use.

### Lo que dijeron los datos (78 días, mitad reservada)

**La hora más nublada no es la más peligrosa.** A las 16 h el cielo está tapado
(65 % bloqueado) pero **estable**, y eso el método lo maneja. A las 10-11 h está
más despejado (44 %) pero es cuando **más se mueve** (22 % de saltos bruscos). Son
dos fenómenos que se venían tratando como uno.

**El error se concentra en los cambios, pero solo a horizonte corto.** A 1 h, el
28 % del tiempo produce el **52 % del error** (MAE 58 → 280 W/m², casi 5×). A 3 h
eso se aplana (39 % → 43 %), porque ahí el método ya se apoya en la climatología.

**El error es asimétrico y la dirección es predecible por hora.**

| | MAE | Sesgo | Relativo |
|---|---|---|---|
| Se tapó (entró nube) | 184 | **+181** sobre-estima | 84 % |
| Se abrió (salió sol) | 233 | **−233** sub-estima | 48 % |

Mañana (6-10 h) el riesgo dominante es que **se abra** (20 % vs 10 %); tarde
(11-15 h), que **se tape** (23 % vs 12 %). Es el ciclo convectivo del sitio.

**Y el hallazgo que decidió el diseño: anticipar el cambio no se puede.** La
turbulencia reciente predice la futura con r = 0,24 (1 h), 0,17 (3 h) y **0,08
(6 h)**, y la nubosidad de los modelos numéricos no predice el cambio en absoluto
(r ≈ 0). Una tool que dijera "probabilidad de nube" para mover el valor central
estaría vendiendo una certeza que los datos no respaldan.

### Lo que sí funciona: la banda estaba mal calibrada por régimen

| A 1 hora | Antes (banda única) | Ahora (por régimen) |
|---|---|---|
| cielo calmo | 83 % (demasiado ancha) | **77 %** |
| medio | 74 % | 71 % |
| turbulento | **64 %** (demasiado angosta) | **69 %** |
| ancho medio | 307 W/m² | **289 W/m²** |

La dispersión cae de **19 puntos a 8**, con banda más angosta. A 3 h no cambia
nada, exactamente como predecía la medición de predictibilidad. Eso es coherencia
entre el diagnóstico y el resultado, no casualidad.

### Qué se construyó

- **`forecasters/riesgo.py`**: régimen actual (terciles **derivados del sitio**,
  no umbrales quemados), frecuencia de cambio fuerte por hora **separada por
  dirección**, y la lectura de qué implica. `clasificar_serie` vectorizada porque
  la escalar hacía inviable el backtest.
- **`tools/riesgo_tool.py`**: `riesgo_de_nubes`, en los **dos modos**. Entra al
  modo ciego, así que le aplica el mismo contrato que a `predecir`: no puede
  devolver nada del instante objetivo, y hay una prueba recursiva que lo verifica.
- **La banda se condiciona al régimen** (`cuantiles_error(..., regimen=)`), con
  respaldo a la banda global si un régimen no junta muestras.

**Defecto real encontrado y corregido durante el trabajo:** la primera versión de
`regimen_actual` medía la ventana alrededor del **instante objetivo** en vez del
corte. Con la tool eso habría leído datos posteriores al corte, o sea la fuga que
todo el sistema evita. Ahora la firma toma un solo instante (el corte) para que no
haya forma de confundirlos, y hay una prueba por perturbación que lo fija. Además
`climatologia._marco` devolvía un índice numérico cuando no había historia, y
comparar eso contra una fecha reventaba: se le puso un `DatetimeIndex` vacío
tz-aware.

**249 tests.** La vista de arquitectura tomó la tool nueva sola, sin tocarla: eso
es lo que se ganó al derivar el mapa de `agent.MODOS` en vez de declararlo.

## 2026-08-19 (noche): el registro del agente, los ejemplos literales se copian

Reporte del usuario: «siempre dice lo mismo, y muy informal: *me equivoqué feo*».

**Causa exacta**, en `agent/prompts.py`: la frase estaba escrita literal en el
prompt como ejemplo (`--"predije 95 W/m2", "me pase por 62", "erre feo"--`). Los
ejemplos entrecomillados en un system prompt no se leen como "algo así": se copian
tal cual. Informalidad y repetición no eran dos problemas, eran uno.

Se quitaron todos los ejemplos de SALIDA entrecomillados y se reemplazaron por una
descripción del registro (profesional y sobrio) más una instrucción explícita de
redactar cada respuesta sin plantilla. Se conservó intacta la **apropiación** (la
predicción es del agente) y la **autocrítica**, que fueron decisiones previas del
usuario: lo que cambió es el registro, no de quién es el número.

**Segundo defecto, encontrado al verificar contra el modelo real:** decía *"medí
32,8 W/m²"*. El agente no mide, mide el sensor; la regla de apropiación se le fue
de rango. Se agregó la distinción explícita, y en la verificación siguiente pasó a
decir *"el sensor registró"*.

Verificado con llamadas reales a Haiku, no solo por lectura del archivo.

## 2026-08-19 — Un solo nombre por cosa: los modos se llaman `medicion_visible` y `medicion_oculta`

La misma cosa tenía cuatro nombres y nadie podía saber cuáles eran lo mismo. El servicio decía
`analisis` / `prediccion`; el chip de la consola decía «modo backtest» / «predicción a ciegas»;
el botón decía «Analizar» / «Predecir a ciegas»; el código decía `ciego`. Y «modo backtest» era
directamente falso: el endpoint `/backtest` dibuja el gráfico en **los dos** modos, así que ese
nombre no distinguía nada.

**El eje real es uno solo: qué puede ver el agente.** De ahí salen los dos nombres, y se usan
idénticos en el servicio, en el mapa de arquitectura y en la consola:

| modo | ve lo medido | herramientas | para qué sirve |
|---|---|---|---|
| `medicion_visible` | sí | `forecast`, `backtest`, `riesgo_de_nubes` + web | juzgar el método después del hecho |
| `medicion_oculta` | no | `diagnosticar_condiciones`, `contexto_historico`, `riesgo_de_nubes`, `predecir` | pronosticar de verdad |

`backtest` vuelve a ser lo que siempre fue: **una herramienta y un endpoint**, nunca un modo.

**Dos arreglos de fondo que aparecieron al renombrar:**

1. **`MODOS.get(modo) or MODOS["analisis"]` era una fuga.** Un typo en el nombre del modo no
   fallaba: caía al modo **permisivo**, o sea que quien pedía pronosticar a ciegas recibía el
   juego **con** `backtest`. Ahora `api.py` valida con `Literal[...]` (un modo inválido es 422)
   y el respaldo de `agent.chat` cae al **restrictivo**. Dos pruebas nuevas lo fijan.
2. **Un solo lugar donde se escriben las etiquetas.** `mvp-debugger/app/components/console/modos.ts`
   es dueño del vocabulario del frontend (id, etiqueta, verbo del botón, ayuda del chip) y lo leen
   `PredView`, `LecturaAgente`, `ArqView` y `Lienzo`. Los ids son los mismos strings que
   `agent.MODOS`, así que no hay traducción que mantener.

Los prompts pasaron a llamarse `PROMPT_CON_RESPUESTA` y `PROMPT_A_CIEGAS` (antes `CHAT_SYSTEM` y
`PREDICCION_SYSTEM`, que tampoco decían el eje).

Relacionado: [[mvp-debugger]].

## 2026-08-20 — Los modos se llaman `medicion_visible` y `medicion_oculta`

Segundo (y último) renombre. El par anterior, «con la respuesta» / «a ciegas», era **informal
para una vista que se muestra fuera del equipo**, y «a ciegas» además sugiere que falta el dato.
La medición existe siempre; lo único que cambia es si el agente la ve, y eso es exactamente lo
que los nombres nuevos dicen.

| modo | ve la medición | herramientas | para qué |
|---|---|---|---|
| `medicion_visible` | sí | `forecast`, `backtest`, `riesgo_de_nubes` + web | evaluar el método |
| `medicion_oculta` | no | `diagnosticar_condiciones`, `contexto_historico`, `riesgo_de_nubes`, `predecir` | pronosticar de verdad |

Etiquetas: **«Medición visible»** / **«Medición oculta»**. Botones: **«Evaluar»** / **«Predecir»**
(antes «Juzgar con la respuesta» / «Predecir a ciegas»). Los prompts pasaron a
`PROMPT_MEDICION_VISIBLE` y `PROMPT_MEDICION_OCULTA`.

Barrido completo, que es lo que pidió Izack: servicio (`agent.py`, `api.py`, `prompts.py`,
`arquitectura.py`), pruebas, consola (`modos.ts` y los cuatro componentes que lo leen), clases CSS
del grafo, fichas del catálogo y documentación. **Desplegado y verificado en producción:** el mapa
publica los dos nombres nuevos y `a_ciegas`, `con_respuesta` y `prediccion` responden **422**, no
una caída silenciosa al modo permisivo.

Relacionado: [[mvp-debugger]].
