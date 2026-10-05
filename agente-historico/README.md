# Agente Histórico

Responde **qué pasó** en el sistema fotovoltaico de San Carlos, y **si el dato en que
se apoya la respuesta sirve**. Su par es el **Predictivo** (`agente-predictivo`), que
responde qué va a pasar; entre los dos cubren pasado y futuro y son los dos únicos
agentes del proyecto.

El LLM (Haiku) **solo orquesta**: entiende la pregunta, elige herramientas, encadena
y redacta. **Nunca calcula.** Los números salen de consultas SQL de solo lectura.

Diseño completo y por qué de cada decisión:
[`docs/referencia/arquitectura-agente-historico.md`](../docs/referencia/arquitectura-agente-historico.md).

## Dos familias de herramientas, y la relación entre ellas

| | Responde | Herramientas |
|---|---|---|
| **Análisis** | qué pasó | energía, performance ratio, irradiancia, temperatura, tendencia, cobertura, catálogo, graficar |
| **Calidad** | si el dato sirve | `calidad_periodo`, `hallazgos_calidad`, `cielo_periodo` |

**La primera depende de la segunda, y por eso no están sueltas.** Toda herramienta de
análisis que agregue sobre un período incrusta un bloque `confianza` en su propia
respuesta:

```
energia_pv1_inclinado_wh: 98411.7
confianza:
  dias_utilizables: 0 / 31
  por_variable:
    potencia_pv1_w      31 días
    potencia_pv2_w      31 días
    potencia_total_wac   0 días
  advertencia: "las variables NO van juntas..."
```

El modelo **no puede** reportar el número sin ver su fiabilidad, porque viajan juntos.
No depende de que el prompt se lo recuerde. Es la misma idea que los modos del
Predictivo, dicha al revés: allá la garantía es que la herramienta que revela la
respuesta **no está** en la lista; acá, que el dato que relativiza el número **sí está**
en el payload.

Ese ejemplo es real: en enero 2026 la energía DC de PV1 y PV2 es impecable y la AC no
existe porque la columna no vino en el CSV. Antes de esto, la herramienta devolvía los
tres números como si valieran lo mismo.

## Dos garantías estructurales

- **Las herramientas no pueden escribir en la base.** Su pool de conexiones es de solo
  lectura (`db.query`), y el que escribe (`db.ejecutar`) lo usa únicamente el barrido.
  No es un permiso que el prompt pueda pedir.
- **El barrido escribe, las herramientas leen.** Recorrer los 274 días es caro y el
  resultado no depende de quién pregunte: si la detección corriera dentro de una
  herramienta, cada pregunta la repetiría y dos personas podrían obtener veredictos
  distintos del mismo día.

## Uso

```bash
historico                      # Q&A por terminal
historico todo                 # el barrido: sol + calidad + cielo + reporte
historico reporte              # solo el informe legible
python -m uvicorn historico.api:app --port 8010
```

`GET /arquitectura` devuelve el agente como estructura, **derivada** de las herramientas
reales: si alguien agrega una tool o cambia un umbral, el mapa cambia solo.

## Diseño (responsabilidad simple)

Una tool = un archivo = una pregunta específica. El LLM **compone** varias para
preguntas compuestas.

```
src/historico/
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
analizador                        # o: python -m historico.cli
```

Como servicio HTTP (es lo que consume la consola y VisioneFlow):

```bash
uvicorn historico.api:app --host 127.0.0.1 --port 8010
```

| Ruta | Para qué | Clave |
|---|---|---|
| `GET /health` · `/tools` | ping y esquemas de las tools | no |
| `POST /tool/<nombre>` | ejecutar una tool directo, sin LLM | sí |
| `POST /preguntar` · `/chat` | el lazo del LLM completo, con traza | sí |
| `GET /datos/*` | peek read-only de las relaciones permitidas | sí |
| `GET /datos/exportables` · `/datos/exportar/estimar` · `/datos/exportar` | exportar un rango de fechas como `csv` / `dat` / `mat` (descarga) | sí |

La clave se exige solo si `HISTORICO_API_KEY` está definida (header `x-api-key`).

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
el otro agente (`agente-predictivo/`).
