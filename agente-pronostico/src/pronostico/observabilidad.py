"""
Panel operativo: una sola respuesta que contesta "¿esto está sano?".

SRP: COMPONER lo que ya saben otros módulos (frescura de ingesta, errores
recientes, gasto del día) en un único dict para el panel del debugger. No
consulta la serie, no pronostica y no decide cortes.

Por que existe: `agente_log` registra los eventos desde siempre, pero nadie lo
mira. El 2026-08-14 se descubrio que el ETL llevaba 9 dias fallando cada 15 min
y la unica forma de enterarse era entrar por SSH a la EC2 y correr
`systemctl status`. Esto pone esos hechos donde alguien los ve.
"""
from __future__ import annotations

import logging

import psycopg

from pronostico import config, gasto, limites, salud

_log = logging.getLogger(__name__)

# Cuantos errores recientes se devuelven. Suficiente para ver un patron
# (¿falla siempre lo mismo?) sin volcar la tabla entera al browser.
LIMITE_ERRORES = 10

_SQL_ERRORES = """
    SELECT ts, componente, evento, error
    FROM v_agente_errores
    LIMIT %s
"""
_SQL_ULTIMA_PREDICCION = """
    SELECT creado_en, variable, valor_esperado, unidad, modelo
    FROM predicciones
    ORDER BY creado_en DESC
    LIMIT 1
"""


def _errores(conn: psycopg.Connection, limite: int) -> list[dict]:
    return [
        {"ts": ts.isoformat(), "componente": comp, "evento": ev, "error": err}
        for ts, comp, ev, err in conn.execute(_SQL_ERRORES, (limite,))
    ]


def _ultima_prediccion(conn: psycopg.Connection) -> dict | None:
    fila = conn.execute(_SQL_ULTIMA_PREDICCION).fetchone()
    if fila is None:
        return None
    creado_en, variable, valor, unidad, modelo = fila
    return {
        "creado_en": creado_en.isoformat(),
        "variable": variable,
        "valor_esperado": valor,
        "unidad": unidad,
        "modelo": modelo,
    }


def _presupuesto() -> dict:
    agotado, gastado, tope = limites.presupuesto_agotado()
    return {
        "gastado_hoy_usd": round(gastado, 6),
        "tope_usd": tope,
        "agotado": agotado,
        # None = el store no respondio; el panel debe poder decirlo en vez de
        # mostrar un 0 que parece "no se gasto nada".
        "medido": gasto.usd_hoy() is not None,
    }


def panel(limite_errores: int = LIMITE_ERRORES) -> dict:
    """Estado operativo completo: ingesta + errores + gasto + última predicción.

    Si el store no responde, `estado_ingesta` ya lanza; el borde HTTP lo traduce
    a 503. Los bloques opcionales (errores, predicción) degradan a vacío antes
    que tumbar todo el panel.
    """
    reporte = salud.estado_ingesta()
    errores: list[dict] = []
    ultima: dict | None = None
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            errores = _errores(conn, limite_errores)
            ultima = _ultima_prediccion(conn)
    except Exception:  # noqa: BLE001
        _log.warning("no se pudieron leer errores/predicciones del store", exc_info=True)

    return {
        "estado": reporte["estado"],
        "ingesta": reporte,
        "errores_recientes": errores,
        "presupuesto": _presupuesto(),
        "ultima_prediccion": ultima,
        "limites": {
            "llm_por_min": limites.LIMITE_LLM_POR_MIN,
            "datos_por_min": limites.LIMITE_DATOS_POR_MIN,
        },
    }
