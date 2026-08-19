"""
Panel operativo: una sola respuesta que contesta "¿esto está sano?".

SRP: COMPONER lo que ya saben otros módulos (identidad de la fuente, frescura de
ingesta, estado del ETL, errores recientes, gasto del día) en un único dict para
el panel del debugger. No consulta la serie, no pronostica y no decide cortes.

Por que existe: `agente_log` registra los eventos desde siempre, pero nadie lo
mira. El 2026-08-14 se descubrio que el ETL llevaba 9 dias fallando cada 15 min
y la unica forma de enterarse era entrar por SSH a la EC2 y correr
`systemctl status`. Esto pone esos hechos donde alguien los ve.

Contrato de robustez: este panel NUNCA lanza por un fallo de infraestructura. Un
panel de salud que se cae cuando algo anda mal no sirve para nada; cada bloque
degrada con su propio `error` y el resto responde igual.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import psycopg

from pronostico import config, fuente, gasto, limites, salud

_log = logging.getLogger(__name__)

# Cuantos errores recientes se devuelven. Suficiente para ver un patron
# (¿falla siempre lo mismo?) sin volcar la tabla entera al browser.
LIMITE_ERRORES = 10

_SQL_ERRORES = """
    SELECT ts, componente, evento, error
    FROM v_agente_errores
    LIMIT %s
"""
# Un componente ruidoso puede llenar los ultimos N errores y esconder que otra
# pieza tambien esta rota: esta consulta garantiza una linea por componente.
_SQL_ERROR_POR_COMPONENTE = """
    SELECT DISTINCT ON (componente) componente, ts, evento, detalle->>'error'
    FROM agente_log
    WHERE nivel = 'error'
    ORDER BY componente, ts DESC
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


def _errores_por_componente(conn: psycopg.Connection) -> dict:
    return {
        comp: {"ts": ts.isoformat(), "evento": ev, "error": err}
        for comp, ts, ev, err in conn.execute(_SQL_ERROR_POR_COMPONENTE)
    }


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


def _ingesta() -> dict:
    """Frescura de la ingesta, o el motivo por el que no se pudo consultar.

    Degrada igual que el bloque `datos` de `arquitectura`: el resto del panel
    (de que fuente se lee, que limites rigen) sigue siendo cierto y util aunque
    el store no conteste — de hecho es cuando MAS hace falta verlo.
    """
    try:
        return salud.estado_ingesta()
    except Exception as exc:  # noqa: BLE001
        _log.warning("no se pudo consultar la salud de la ingesta", exc_info=True)
        return {"estado": salud.ESTADO_DESCONOCIDO,
                "error": f"{type(exc).__name__}: {exc}"}


def _presupuesto() -> dict:
    """Gasto del dia contra el tope. Conserva la forma aunque falle: `medido`
    False ya significa "este numero no es confiable"."""
    try:
        # UNA sola lectura del store. Antes se pedia `usd_hoy()` dos veces (una
        # dentro de presupuesto_agotado y otra para `medido`), lo que ademas de
        # duplicar el viaje permitia que se CONTRADIJERAN: si el store fallaba
        # entre las dos, el panel mostraba un numero del espejo local rotulado
        # como medido, o al reves.
        del_store = gasto.usd_hoy()
        agotado, gastado, tope = limites.presupuesto_agotado(gastado_hoy=del_store)
        return {
            "gastado_hoy_usd": round(gastado, 6),
            "tope_usd": tope,
            "agotado": agotado,
            # None = el store no respondio; el panel debe poder decirlo en vez de
            # mostrar un 0 que parece "no se gasto nada".
            "medido": del_store is not None,
        }
    except Exception as exc:  # noqa: BLE001
        _log.warning("no se pudo calcular el presupuesto del dia", exc_info=True)
        return {"gastado_hoy_usd": None, "tope_usd": limites.PRESUPUESTO_DIARIO_USD,
                "agotado": False, "medido": False,
                "error": f"{type(exc).__name__}: {exc}"}


def panel(limite_errores: int = LIMITE_ERRORES) -> dict:
    """Estado operativo completo: de dónde salen los datos y cómo va la ingesta.

    Orden de lectura pensado para el panel: primero QUÉ fuente se está leyendo
    (desde el 2026-08-14 es una réplica de un dump, no la base viva), después si
    esa ingesta avanza, y recién ahí los errores y el gasto.
    """
    ingesta = _ingesta()
    errores: list[dict] = []
    por_componente: dict = {}
    ultima: dict | None = None
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            errores = _errores(conn, limite_errores)
            por_componente = _errores_por_componente(conn)
            ultima = _ultima_prediccion(conn)
    except Exception:  # noqa: BLE001
        _log.warning("no se pudieron leer errores/predicciones del store", exc_info=True)

    return {
        "estado": ingesta["estado"],
        "consultado_en": datetime.now(timezone.utc).isoformat(),
        "fuente": fuente.fuente(),
        "store": fuente.store(),
        "ingesta": ingesta,
        "errores_recientes": errores,
        "ultimos_errores_por_componente": por_componente,
        "presupuesto": _presupuesto(),
        "ultima_prediccion": ultima,
        "limites": {
            "llm_por_min": limites.LIMITE_LLM_POR_MIN,
            "datos_por_min": limites.LIMITE_DATOS_POR_MIN,
        },
    }
