"""
Write-back de predicciones al store (tabla `predicciones`) + logs del agente.

Se llama desde el borde HTTP (api.py) DESPUES de run_forecast: cada pronostico
servido deja una fila de auditoria en `predicciones`, sin importar quien llamo
(webhook, schedule de VisioneFlow, prueba). Es BEST-EFFORT: si la escritura falla,
NO rompe la respuesta del pronostico (el store puede estar caido; el forecast no
debe caerse por eso). Base del analisis predicho-vs-real ([[capa-agentes]]).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import psycopg

from pronostico import config

# Nombre del modelo por variable (para el audit).
_MODELO = {
    "irradiancia": "persistencia_kt",
    "humedad_suelo": "persistencia_mediana",
}

_SQL_PRED = """
    INSERT INTO predicciones
        (variable, ts_origen, ts_objetivo, horizonte_seg, valor_esperado,
         banda_bajo, banda_alto, unidad, modelo, frescura_seg, n_muestras,
         latencia_ms, origen, contexto)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id
"""


def registrar_prediccion(res: dict, origen: str = "api",
                         latencia_ms: int | None = None) -> int | None:
    """Inserta una fila en `predicciones` desde el dict de run_forecast.

    Best-effort: devuelve el id insertado, o None si no hay STORE_URL o la
    escritura falla (nunca lanza). `frescura_seg` = antiguedad del dato de origen
    (ts_origen) respecto al reloj real -> mide cuan vieja es la fuente (util con
    la ingesta SC congelada).
    """
    store = config.STORE_URL
    if not store:
        return None
    try:
        ts_origen = datetime.fromisoformat(res["ahora"])
        frescura = int((datetime.now(timezone.utc) - ts_origen).total_seconds())
        contexto = res.get("contexto", {}) or {}
        with psycopg.connect(store, autocommit=True) as conn:
            row = conn.execute(_SQL_PRED, (
                res["variable"],
                res["ahora"],
                res["momento_pronosticado"],
                res["horizonte_segundos"],
                res["valor_esperado"],
                res["banda"]["bajo"],
                res["banda"]["alto"],
                res["unidad"],
                _MODELO.get(res["variable"]),
                frescura,
                contexto.get("muestras_recientes"),
                latencia_ms,
                origen,
                json.dumps(contexto, default=str),
            )).fetchone()
        return row[0] if row else None
    except Exception:                                   # noqa: BLE001 (best-effort)
        return None


def log_evento(componente: str, nivel: str, evento: str,
               detalle: dict | None = None) -> None:
    """Escribe un evento en `agente_log`. Best-effort (no lanza)."""
    store = config.STORE_URL
    if not store:
        return
    try:
        with psycopg.connect(store, autocommit=True) as conn:
            conn.execute(
                "INSERT INTO agente_log (componente, nivel, evento, detalle) "
                "VALUES (%s, %s, %s, %s)",
                (componente, nivel, evento, json.dumps(detalle or {}, default=str)),
            )
    except Exception:                                   # noqa: BLE001
        return
