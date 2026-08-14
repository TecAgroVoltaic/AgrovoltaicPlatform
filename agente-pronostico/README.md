# Agente de pronóstico de irradiancia (MVP)

Un **agente LLM con herramientas** que pronostica irradiancia solar a partir de la
serie histórica de AgroDash, para compararlo más adelante contra un **modelo
estadístico convencional**.

## Principio de diseño (lo más importante)

> **El LLM nunca toca los números.**

El modelo de lenguaje (Claude) hace solo cuatro cosas: (1) entiende la pregunta en
lenguaje natural, (2) traduce el horizonte a segundos, (3) **llama a una herramienta**
que hace el cálculo físico, y (4) redacta la respuesta en español con su incertidumbre.
Los números salen de una herramienta con anclaje físico (descomposición por cielo
despejado + persistencia sobre kt\*), no de la "intuición" del modelo. Así la parte
numérica es **auditable y reproducible**, y el LLM aporta lo suyo: orquestación,
ruteo y explicabilidad.

```
   Pregunta en español
   "¿cuánta irradiancia en 2 horas?"
            │
            ▼
   ┌─────────────────┐   decide llamar        ┌────────────────────────┐
   │  Claude (LLM)   │ ─── forecast(...) ───▶ │  Herramienta física    │
   │  orquestador    │                        │  clear-sky + kt*       │
   │                 │ ◀── {ghi, banda} ───── │  (los números reales)  │
   └─────────────────┘   redacta en español   └────────────────────────┘
            │
            ▼
   "Alrededor de 540 W/m² (entre 410 y 660);
    hay nubosidad variable, así que…"
```

## Estructura del proyecto (y por qué)

Modular, con **responsabilidad única** por módulo y **dependencias en una sola
dirección** (las capas de abajo no conocen a las de arriba). Cada archivo hace una
cosa; se puede probar, entender y sustituir por separado.

```
agente-pronostico/
├── README.md                      ← este archivo
├── .env.example                   ← plantilla de credenciales (copiá a .env)
├── pyproject.toml                 ← metadatos + dependencias
├── src/pronostico/
│   ├── config.py                  ← ÚNICA fuente de verdad: geo del sitio, tz,
│   │                                 DSN de la DB (desde el entorno), modelo, umbrales
│   ├── domain.py                  ← tipos puros (Variable, Pronostico) — sin lógica
│   ├── data.py                    ← repositorio AgroDash SOLO-LECTURA + caché parquet;
│   │                                 get_recent_data(now, lookback) = BARRERA ANTI-FUGA
│   │                                 (solo devuelve lecturas con timestamp < now)
│   ├── physics.py                 ← clear_sky_ghi, clear_sky_index (kt*), reconstruct_ghi
│   ├── forecasters/
│   │   ├── base.py                ← interfaz Forecaster: forecast(variable, h_seg, now)
│   │   ├── persistence.py         ← smart_persistence (kt* reciente × cielo futuro)
│   │   │                             y naive_persistence (rival tonto)
│   │   └── uncertainty.py         ← banda heurística (±σ); conformal en fase 2
│   ├── nlu/
│   │   └── horizon.py             ← parse_horizon("en 2 horas", now) → segundos
│   │                                 (determinista y testeable, sin LLM)
│   ├── tools/
│   │   └── forecast_tool.py       ← esquema JSON + run_forecast(): la herramienta
│   │                                 que el LLM invoca (traduce args → forecaster → dict)
│   ├── agent/
│   │   ├── prompts.py             ← system prompt en español (las 4 reglas)
│   │   └── agent.py               ← lazo manual de tool-use con la API de Claude
│   └── cli.py                     ← punto de entrada: `python -m pronostico.cli "¿…?"`
├── tests/                         ← horizon, physics, forecast_tool (sin red, sin LLM)
├── scripts/
│   ├── validar_fisica.py          ← de-riesgo físico (overlay clear-sky, kt*)
│   └── hindcast_demo.py           ← backtest walk-forward (reloj simulado, sin fuga)
└── data/                          ← caché parquet (no se versiona)
```

**Flujo de dependencias:** `config` → `domain` → {`data`, `physics`} →
`forecasters` → `tools` → `agent` → `cli`. Nadie importa "hacia arriba".

### Por qué cada capa

- **`config`** — un solo lugar para lat/lon, timezone, credenciales y modelo. Cambiar
  el sitio o el modelo es tocar un archivo, no diez.
- **`data`** — aísla la base de datos. Contiene la **barrera anti-fuga**
  (`get_recent_data`): el pronosticador solo ve el pasado, nunca "espía" el futuro.
- **`physics`** — la descomposición por cielo despejado (kt\*), independiente de la
  fuente de datos y del pronosticador.
- **`forecasters`** — modelos de pronóstico detrás de una **interfaz común**
  (`forecast(variable, horizon_seconds, now)`). Hoy: persistencia inteligente. Mañana:
  AutoARIMA / ML, sin cambiar nada aguas arriba.
- **`tools`** — adapta el forecaster al formato que el LLM entiende (esquema JSON +
  dict de salida). El único punto de contacto entre el LLM y los números.
- **`agent`** — el lazo conversacional. No sabe de física; solo orquesta.

## Puesta en marcha

```bash
cd agente-pronostico
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,service]"   # dev = pytest+httpx · service = fastapi+uvicorn

cp .env.example .env              # completá ANTHROPIC_API_KEY y las dos DBs
```

Dos bases, con roles distintos —no confundirlas es lo que evita mezclar regiones:

| Variable | Qué es | Acceso |
|---|---|---|
| `DATABASE_URL` | **fuente**: AgroDash (región Cartago) de donde se ingiere | solo lectura |
| `STORE_URL` | **store**: la Supabase de AgroVoltaic donde se escribe y se lee | lectura/escritura |

Con Cartago caído, `DATABASE_URL` apunta a una réplica del dump. Para levantarla local:

```bash
./scripts/agrodash_local.sh       # cluster en :5433, restaura el dump si falta
```

## Uso

```bash
# Preguntar al agente (necesita ANTHROPIC_API_KEY):
python -m pronostico.cli "¿cuánta irradiancia va a haber en 2 horas?"

# De-riesgo físico (genera imágenes en docs/):
python scripts/validar_fisica.py

# Backtest walk-forward (reloj simulado, sin fuga):
python scripts/hindcast_demo.py

# Tests (deterministas, sin red ni LLM):
pytest

# Servicio HTTP — para VisioneFlow, la consola u otro cliente. Docker: ver Dockerfile.
uvicorn pronostico.api:app --host 127.0.0.1 --port 8000

# Ingesta AgroDash -> store (idempotente e incremental)
python -m pronostico.etl                              # incremental
python -m pronostico.etl --full --variable irradiancia  # backfill de una sola variable
```

### Endpoints

| Ruta | Para qué | Clave |
|---|---|---|
| `GET /health` | ping | no |
| `GET /salud/ingesta` | antigüedad de los datos; **503** si están viejos | no |
| `GET /salud/panel` | ingesta + errores + gasto del día + última predicción | sí |
| `POST /forecast` | pronóstico a un horizonte | sí |
| `POST /anomalias` | detección determinista de anomalías | sí |
| `POST /preguntar` · `/chat` | el lazo del LLM completo, con traza | sí |
| `GET /serie` · `/backtest` · `/uso` | datos y consumo | sí |

`/health` y `/salud/ingesta` quedan abiertos a propósito: son para monitoreo automático
y no exponen datos de la serie.

### Frenos de consumo

Sin esto, un bucle o un scraper dispara el costo del LLM sin tope:

| Variable | Default | Qué hace |
|---|---|---|
| `RATE_LIMIT_LLM_POR_MIN` | 12 | tope por identidad en los endpoints que gastan tokens |
| `RATE_LIMIT_DATOS_POR_MIN` | 120 | ídem en los deterministas (solo protege CPU) |
| `PRESUPUESTO_DIARIO_USD` | 5 | gasto diario máximo; `0` desactiva |
| `INGESTA_STALE_HORAS` | 6 | a partir de cuándo la ingesta se reporta vieja |

El gasto se acumula en la tabla `gasto_diario` del store, no en un archivo local: así
sobrevive a que se recree el contenedor y no se duplica si hay más de una instancia.

## Producción (EC2)

El servicio corre como sidecar Docker y la ingesta la dispara systemd. Los units están
versionados en `deploy/systemd/` — instalación, verificación y diagnóstico en su README.

```bash
systemctl list-timers 'forecast-*' --no-pager   # próxima y última corrida
journalctl -t forecast-etl -n 50                # log de la ingesta
```

## Notas de seguridad

- **AgroDash es SOLO LECTURA.** Toda conexión fija `SET SESSION CHARACTERISTICS AS
  TRANSACTION READ ONLY`; solo se ejecutan `SELECT`.
- **Credenciales solo por entorno** (`.env`, ignorado por git). Nunca en el código.
- **No se usa** la Supabase fotovoltaica de San Carlos (reservada para otro agente).

## Estado

- **Fase 0-1 (este MVP):** lazo del agente + backtest. La física está validada y el
  pronosticador de persistencia inteligente le gana al ingenuo en todo horizonte
  (skill +0,13 a 30 min → +0,48 a 3 h). Ver `docs/pronostico/` en el repo.
- **Multi-variable:** irradiancia + humedad de suelo, ambas vivas, leyendo del store.
- **Operación:** ingesta automática, salud, frenos de consumo y observabilidad
  (ver `docs/memoria/proyecto/pipeline-tiempo-real.md`).
- **Límite actual:** la fuente de San Carlos está congelada desde el 2026-07-23, así que
  todo corre sobre histórico. Cuando el equipo la restaure, el ETL backfillea solo.
- **Siguiente:** forecaster serio (AutoARIMA / ML) + incertidumbre conformal (MAPIE).
