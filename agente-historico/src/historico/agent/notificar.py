"""Reporte de fallas del sistema: el punto unico por donde sale toda falla a reportar.

Hoy escribe en el log estructurado del servicio y guarda las ultimas en memoria para
que se puedan consultar. El destino definitivo (el sistema de notificaciones de la
consola) se conecta ACA y solo aca: quien reporta no sabe ni le importa adonde va.

Nunca levanta: un reporte que falla no puede tumbar la respuesta al usuario.
"""
from __future__ import annotations

import logging
import threading
from collections import deque
from datetime import datetime, timezone

_log = logging.getLogger("historico.fallas")
MAX_RECIENTES = 200
_RECIENTES: deque[dict] = deque(maxlen=MAX_RECIENTES)
_CANDADO = threading.Lock()


def reportar(falla: dict) -> bool:
    """Registra la falla. Devuelve True si quedo reportada."""
    try:
        registro = {**falla, "momento": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        with _CANDADO:
            _RECIENTES.append(registro)
        _log.warning("falla %s en %s: %s", registro.get("tipo"), registro.get("herramienta"),
                     registro.get("detalle"))
        return True
    except Exception:  # noqa: BLE001 — reportar jamas rompe la respuesta
        return False


def recientes(limite: int = 50) -> list[dict]:
    """Las ultimas fallas reportadas, la mas nueva primero."""
    with _CANDADO:
        return list(reversed(_RECIENTES))[:limite]
