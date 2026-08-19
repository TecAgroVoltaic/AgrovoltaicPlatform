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
`chat()` acepta un **modo**. En `prediccion` las herramientas son las tres de arriba y
**`backtest` no está** — es la única que revela lo medido. Un prompt se puede ignorar; una
herramienta ausente no se puede llamar. `analisis` (el modo por defecto) la conserva, porque
ahí ver el resultado *es* el objetivo. Cubierto por tests que verifican el juego de cada modo
y que ni `predecir` ni los diagnósticos devuelven claves del resultado en ningún nivel.

### Verificado en producción
Pidiéndole las 08:00 del 22-jul: diagnosticó, consultó 7 días, eligió `kt_max=1.2`
argumentando el cielo más cerrado de lo normal, predijo **56,8 W/m² (banda 41,8–71,7)** y
declaró **confianza media** diciendo qué lo haría fallar — todo antes de conocer el
resultado. Frente a los 78,1 de la configuración por defecto, su razonamiento lo acercó al
valor real (32,8).

**Pendiente:** cablear el flujo de dos fases en la consola (el agente predice a ciegas, la
consola revela y puntúa). Hoy funciona por `/chat` con `modo=prediccion`.

Relacionado: [[integracion-visioneflow]], [[capa-agentes]], [[agrodash-esquema]], [[bloqueantes]], [[agrodash]], [[pipeline-tiempo-real]], [[mvp-debugger]].
