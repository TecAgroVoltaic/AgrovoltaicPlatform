"""
Consumo diario del LLM EN EL STORE — tokens, consultas y USD por dia y modelo.

SRP: acumular y leer el consumo en Supabase (`uso_diario`). No decide si cortar
(eso es limites.py), no calcula tarifas (costos.py) ni corre el LLM.

Por que en la DB y no en un JSON del contenedor:
  * El JSON vive DENTRO del contenedor y `forecast-refresh.timer` lo recrea cada
    6 h. El contenedor ademas no tiene volumen: `docker inspect` devuelve
    `Mounts: []`, asi que /app/data se va con la capa escribible. El acumulado
    se perdia hasta 4 veces por dia, el tope nunca llegaba a dispararse y
    `GET /uso` mostraba ceros con 43 consultas reales el mismo dia.
  * El consumo es un hecho del SISTEMA, no de un proceso: con dos instancias,
    dos JSON = el tope se duplica en silencio. Una fila por dia en el store es
    un unico numero para todos.

Por que `modelo` entra en la clave y no en un JSONB: sumar es trivial en el
upsert, la historia queda atribuida cuando se cambie de modelo sin migrar nada,
y el desglose sale con un GROUP BY en vez de con un merge de JSON. Crecimiento
acotado: ~365 filas por año y por modelo.

Politica ante fallo del store: NO bloquear. Si no se puede leer el gasto, se
deja pasar y se loguea — un Supabase caido no debe tumbar el servicio. El
rate-limit sigue cubriendo el escenario de gasto masivo (el bucle).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import psycopg

from pronostico import config

_log = logging.getLogger(__name__)

# El dia se corta en UTC, no en hora local: un unico criterio evita que el tope
# se "reinicie" dos veces segun quien lo mire.
_SQL_SUMAR = """
    INSERT INTO uso_diario (fecha, modelo, n_consultas, requests, input_tokens,
                            output_tokens, cache_read_tokens, cache_write_tokens,
                            web_searches, usd)
    VALUES (%s, %s, 1, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (fecha, modelo) DO UPDATE
       SET n_consultas        = uso_diario.n_consultas        + 1,
           requests           = uso_diario.requests           + EXCLUDED.requests,
           input_tokens       = uso_diario.input_tokens       + EXCLUDED.input_tokens,
           output_tokens      = uso_diario.output_tokens      + EXCLUDED.output_tokens,
           cache_read_tokens  = uso_diario.cache_read_tokens  + EXCLUDED.cache_read_tokens,
           cache_write_tokens = uso_diario.cache_write_tokens + EXCLUDED.cache_write_tokens,
           web_searches       = uso_diario.web_searches       + EXCLUDED.web_searches,
           usd                = uso_diario.usd                + EXCLUDED.usd,
           actualizado_en     = now()
"""
# SUM y no un SELECT directo: con varios modelos en el mismo dia hay varias filas
# y el tope mira el total, no el de un modelo.
_SQL_USD_HOY = "SELECT COALESCE(sum(usd), 0) FROM uso_diario WHERE fecha = %s"
_SQL_ACUMULADO = """
    SELECT modelo,
           sum(n_consultas), sum(requests), sum(input_tokens), sum(output_tokens),
           sum(cache_read_tokens), sum(cache_write_tokens), sum(web_searches),
           sum(usd), min(creado_en)
      FROM uso_diario
     GROUP BY modelo
"""
_SQL_POR_DIA = """
    SELECT fecha, sum(n_consultas), sum(usd)
      FROM uso_diario
     GROUP BY fecha
     ORDER BY fecha
"""


def _hoy() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _entero(d: dict, clave: str) -> int:
    return int(d.get(clave) or 0)


def registrar_consulta(traza: dict) -> bool:
    """Suma UNA consulta del LLM al dia en curso, entera.

    Un solo upsert con todo lo de la traza (tokens, cache, busquedas web y USD):
    dos escrituras sobre la misma fila desde dos modulos distintos era la receta
    para que el conteo se duplicara al refactorizar. Best-effort: nunca lanza.
    """
    usage = traza.get("usage") or {}
    usd = (traza.get("costo") or {}).get("usd_total") or 0.0
    modelo = traza.get("modelo") or "?"
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            conn.execute(_SQL_SUMAR, (
                _hoy(), modelo,
                _entero(usage, "requests"),
                _entero(usage, "input_tokens"),
                _entero(usage, "output_tokens"),
                _entero(usage, "cache_read"),
                _entero(usage, "cache_write"),
                _entero(usage, "web_searches"),
                float(usd),
            ))
        return True
    except Exception:  # noqa: BLE001
        _log.warning("no se pudo registrar el consumo del dia en el store", exc_info=True)
        return False


def usd_hoy() -> float | None:
    """Gasto del dia UTC en curso segun el store.

    None = NO SE SABE (store inaccesible). Es distinto de 0.0 (no se gasto
    nada): quien decide el corte tiene que poder distinguirlos para no bloquear
    por un fallo de infraestructura.
    """
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            fila = conn.execute(_SQL_USD_HOY, (_hoy(),)).fetchone()
        return float(fila[0]) if fila else 0.0
    except Exception:  # noqa: BLE001
        _log.warning("no se pudo leer el gasto del dia del store", exc_info=True)
        return None


def acumulado() -> dict | None:
    """Consumo historico completo, con la forma que sirve `GET /uso`.

    None = store inaccesible; quien llama decide si cae al espejo local. Se
    conservan las claves que ya consumia la consola (`total_*`, `por_modelo`,
    `por_dia`) para no romperla, y se suman las que antes no existian.
    """
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            filas = conn.execute(_SQL_ACUMULADO).fetchall()
            dias = conn.execute(_SQL_POR_DIA).fetchall()
    except Exception:  # noqa: BLE001
        _log.warning("no se pudo leer el consumo acumulado del store", exc_info=True)
        return None

    total = {
        "desde": None, "n_consultas": 0, "total_requests": 0,
        "total_input_tokens": 0, "total_output_tokens": 0, "total_usd": 0.0,
        "cache_read_tokens": 0, "cache_write_tokens": 0, "web_searches": 0,
        "por_modelo": {}, "por_dia": {}, "fuente": "store",
    }
    for (modelo, n, req, ent, sal, cr, cw, web, usd, desde) in filas:
        total["n_consultas"] += int(n or 0)
        total["total_requests"] += int(req or 0)
        total["total_input_tokens"] += int(ent or 0)
        total["total_output_tokens"] += int(sal or 0)
        total["cache_read_tokens"] += int(cr or 0)
        total["cache_write_tokens"] += int(cw or 0)
        total["web_searches"] += int(web or 0)
        total["total_usd"] += float(usd or 0.0)
        if desde and (total["desde"] is None or desde.isoformat() < total["desde"]):
            total["desde"] = desde.isoformat()
        total["por_modelo"][modelo] = {
            "n_consultas": int(n or 0),
            "input_tokens": int(ent or 0),
            "output_tokens": int(sal or 0),
            "usd_total": round(float(usd or 0.0), 6),
        }
    total["total_usd"] = round(total["total_usd"], 6)
    total["por_dia"] = {
        f.isoformat(): {"n_consultas": int(n or 0), "usd": round(float(usd or 0.0), 6)}
        for (f, n, usd) in dias
    }
    return total
