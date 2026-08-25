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

La clave se exige solo si `HISTORICO_API_KEY` está definida (header `x-api-key`).

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
el otro agente (`agente-predictivo/`).
