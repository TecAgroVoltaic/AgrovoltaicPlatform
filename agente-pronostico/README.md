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
pip install -e .

cp .env.example .env          # y completá ANTHROPIC_API_KEY y AGRODASH_PASSWORD
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

# Servicio HTTP (/health, POST /forecast) — para VisioneFlow u otro cliente.
# Instalar el extra: pip install -e ".[service]". API key opcional por
# FORECAST_API_KEY (header x-api-key). Docker: ver Dockerfile.
uvicorn pronostico.api:app --host 127.0.0.1 --port 8000
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
- **Fase 2:** forecaster serio (AutoARIMA / ML) + incertidumbre conformal (MAPIE),
  y humedad de suelo (Cartago) reutilizando la misma interfaz.
- **Fase 3:** arnés de comparación LLM-vs-estadístico con ruteo multi-herramienta.
