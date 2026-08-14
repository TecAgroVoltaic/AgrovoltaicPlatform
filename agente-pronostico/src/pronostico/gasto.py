"""
Gasto diario del agente EN EL STORE — fuente de verdad del tope de presupuesto.

SRP: acumular y leer el gasto por dia en Supabase. No decide si cortar (eso es
limites.py), no calcula tarifas (costos.py) ni guarda el detalle por modelo
(uso.py, que sigue siendo el JSON local de `/uso`).

Por que en la DB y no en el JSON local:
  * El JSON vive DENTRO del contenedor y `forecast-refresh.timer` lo recrea cada
    6 h -> el acumulado del dia se perdia 3 veces por dia y el tope nunca
    llegaba a dispararse.
  * El presupuesto es un hecho del SISTEMA, no de un proceso: con dos instancias,
    dos JSON = el tope se duplica en silencio. Una fila por dia en el store es
    un unico numero para todos.

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

# El dia se corta en UTC (igual que uso.py), no en hora local: un unico criterio
# evita que el tope se "reinicie" dos veces segun quien lo mire.
_SQL_SUMAR = """
    INSERT INTO gasto_diario (fecha, usd, n_consultas)
    VALUES (%s, %s, 1)
    ON CONFLICT (fecha) DO UPDATE
       SET usd            = gasto_diario.usd + EXCLUDED.usd,
           n_consultas    = gasto_diario.n_consultas + 1,
           actualizado_en = now()
"""
_SQL_LEER = "SELECT usd FROM gasto_diario WHERE fecha = %s"


def _hoy() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def registrar(usd: float | None) -> bool:
    """Suma el costo de una consulta al dia en curso. Best-effort: True si se
    escribio. Nunca lanza — el pronostico no debe caerse porque el store falle."""
    if not usd:
        return False
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            conn.execute(_SQL_SUMAR, (_hoy(), float(usd)))
        return True
    except Exception:  # noqa: BLE001
        _log.warning("no se pudo registrar el gasto del dia en el store", exc_info=True)
        return False


def usd_hoy() -> float | None:
    """Gasto del dia UTC en curso segun el store.

    None = NO SE SABE (store inaccesible). Es distinto de 0.0 (no se gasto
    nada): quien decide el corte tiene que poder distinguirlos para no bloquear
    por un fallo de infraestructura.
    """
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            fila = conn.execute(_SQL_LEER, (_hoy(),)).fetchone()
        return float(fila[0]) if fila else 0.0
    except Exception:  # noqa: BLE001
        _log.warning("no se pudo leer el gasto del dia del store", exc_info=True)
        return None
