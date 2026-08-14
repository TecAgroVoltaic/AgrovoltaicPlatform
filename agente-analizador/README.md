# Analizador PV — Q&A sobre el histórico de San Carlos

Agente LLM que **responde preguntas** sobre los datos fotovoltaicos de San Carlos
(la Supabase de AgroVoltaic). El LLM **solo orquesta**: entiende la pregunta, llama
a una herramienta de análisis y redacta la respuesta. **Nunca calcula** — los
números salen de consultas SQL de solo-lectura sobre las vistas ya limpias.

## Diseño (responsabilidad simple)

Una tool = un archivo = una pregunta específica. El LLM **compone** varias para
preguntas compuestas.

```
src/analizador/
  config.py            # solo configuración (DB por URL, modelo)
  db.py                # solo: conexión read-only + query parametrizada
  periodo.py           # solo: normalizar [desde, hasta)
  tools/
    energia.py         # energía por arreglo (integral de potencia)
    performance.py     # Performance Ratio por arreglo (bifacial)
    irradiancia.py     # GHI / kt* / insolación (con QC)
    temperatura.py     # temperatura por arreglo
    cobertura.py       # qué datos hay (rango + conteos)
    catalogo.py        # diccionario de variables
    __init__.py        # registro (schemas + dispatch), sin lógica
  agent/
    agent.py           # lazo tool-use genérico (el LLM orquesta)
    prompts.py         # system prompt
  cli.py               # Q&A por terminal
```

## Uso

```bash
cp .env.example .env              # completá ANTHROPIC_API_KEY (la DB toma la del repo)
pip install -e ".[dev,service]"   # dev = pytest+httpx · service = fastapi+uvicorn
analizador                        # o: python -m analizador.cli
```

Como servicio HTTP (es lo que consume la consola y VisioneFlow):

```bash
uvicorn analizador.api:app --host 127.0.0.1 --port 8010
```

| Ruta | Para qué | Clave |
|---|---|---|
| `GET /health` · `/tools` | ping y esquemas de las tools | no |
| `POST /tool/<nombre>` | ejecutar una tool directo, sin LLM | sí |
| `POST /preguntar` · `/chat` | el lazo del LLM completo, con traza | sí |
| `GET /datos/*` | peek read-only de las relaciones permitidas | sí |

La clave se exige solo si `ANALIZADOR_API_KEY` está definida (header `x-api-key`).

Tests:

```bash
pytest -q      # 24 tests, sin red ni DB
```

Los endpoints `/datos/*` interpolan nombres de tabla en el SQL, así que la **allowlist**
de `datos.py` es el borde de seguridad: agregar una relación es agregarla ahí, nunca
pasar el nombre desde afuera. Hay tests que fijan esa regla.

Ejemplos de preguntas: *"¿cuánta energía generó cada arreglo?"*, *"¿cuál arreglo
tiene mejor Performance Ratio?"*, *"¿cómo estuvo la irradiancia en abril 2026?"*,
*"¿qué datos hay disponibles?"*.

Los datos son **históricos** (no en vivo). Para preguntas de pronóstico futuro está
el otro agente (`agente-pronostico/`).
