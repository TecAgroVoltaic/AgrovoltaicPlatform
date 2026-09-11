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
| `GET /datos/exportables` · `/datos/exportar/estimar` · `/datos/exportar` | exportar un rango de fechas como `csv` / `dat` / `mat` (descarga) | sí |

La clave se exige solo si `ANALIZADOR_API_KEY` está definida (header `x-api-key`).

Tests:

```bash
pytest -q      # 60 tests, sin red ni DB
```

### Exportar datos por rango (`exportar.py`)

```
GET /datos/exportables                      # catálogo por fuente: datasets, columnas, cobertura, cajas
GET /datos/exportar/estimar?...             # filas del rango antes de bajar
GET /datos/exportar/previa?...&n=8          # primeras filas, tal como saldrán
GET /datos/exportar?fuente=supabase&tabla=electrico_corregido&formato=csv&desde=2026-03-01&hasta=2026-03-31[&columnas=a,b]
GET /datos/exportar?fuente=agrodash&tabla=lecturas&formato=dat&desde=...&hasta=...&caja=Caja%20B&sensor_tipo=humedad&paso=300
```

- **Dos fuentes:** `supabase` (vía SQL: la PV de San Carlos, las 9 relaciones de `datos.py` +
  `ambiental_crudo` = `lecturas_ambientales_sc`) y `agrodash` (vía **API pública** de AgroDash,
  `agrodash_api.py`, sin credenciales; datasets `lecturas` —filtrable por `caja` y `sensor_tipo`, con
  `paso` = ancho del intervalo en segundos, 0 = crudo— y `sensores`). Si la API no responde, el
  catálogo la marca `disponible: false` y el resto sigue. La API no cuenta filas: `estimar` da una cota.
- `desde`/`hasta`: `YYYY-MM-DD`, ambos **inclusivos** por día **local** (con hora, `hasta` es exclusivo).
- `formato`: `csv` (coma, nulo vacío) · `dat` (tabulador, nulo `NaN`, booleano 1/0, columna
  `<tiempo>_unix`) · `mat` (MATLAB: una variable por columna, `<tiempo>_unix`, `<tiempo>_datenum`
  y struct `meta`; tope de 500.000 filas porque se arma en memoria → 413).
- CSV y DAT se emiten por lotes con un cursor de servidor (`db.iterar`), sin tope.
- **Horas:** todas salen en hora local de Costa Rica sin sufijo. Las fuentes mezclan convenciones
  (PV = reloj local etiquetado +00; store ambiental = UTC real; API de AgroDash = hora local naive)
  y cada dataset declara la suya (`reloj`, `tcol_tz`); ver el docstring de `exportar.py`.

Ejemplos de preguntas: *"¿cuánta energía generó cada arreglo?"*, *"¿cuál arreglo
tiene mejor Performance Ratio?"*, *"¿cómo estuvo la irradiancia en abril 2026?"*,
*"¿qué datos hay disponibles?"*.

Los datos son **históricos** (no en vivo). Para preguntas de pronóstico futuro está
el otro agente (`agente-pronostico/`).
