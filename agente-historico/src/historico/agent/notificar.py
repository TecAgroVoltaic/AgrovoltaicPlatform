"""Reporte de fallas del sistema: el punto unico por donde sale toda falla a reportar.

Destino: la seccion Alertas (decision del usuario, 2026-10-12), como `falla_sistema`
con UNA alerta abierta por causa (`alertas.fallas`). Ademas queda en el log del
servicio y en memoria, asi una base caida no deja la falla sin rastro.

Dos garantias:
- Nunca levanta ni demora: la escritura en la base va en un hilo aparte, y un
  reporte que falla no puede tumbar la respuesta al usuario.
- No inunda: una misma causa se escribe como mucho una vez cada `INTERVALO_SEG`.
"""
from __future__ import annotations

import logging
import os
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone

_log = logging.getLogger("historico.fallas")
MAX_RECIENTES = 200
INTERVALO_SEG = 600
_RECIENTES: deque[dict] = deque(maxlen=MAX_RECIENTES)
_ULTIMA_ESCRITURA: dict[str, float] = {}
_CANDADO = threading.Lock()


def _a_alertas_activo() -> bool:
    """La base local de desarrollo ES la de produccion: los tests nunca escriben, y
    `FALLAS_A_ALERTAS=0` apaga la escritura en una prueba local."""
    return os.environ.get("FALLAS_A_ALERTAS", "1") == "1" and "pytest" not in sys.modules


def _toca_escribir(clave: str) -> bool:
    ahora = time.monotonic()
    with _CANDADO:
        if ahora - _ULTIMA_ESCRITURA.get(clave, -INTERVALO_SEG) < INTERVALO_SEG:
            return False
        _ULTIMA_ESCRITURA[clave] = ahora
        return True


def _a_alertas(falla: dict) -> None:
    from historico.alertas import fallas as alertas_fallas   # perezoso: evita un ciclo
    from historico.analitica.resumen import hoy_en_sitio
    try:
        alertas_fallas.registrar(falla, hoy_en_sitio())
    except Exception:  # noqa: BLE001 — queda en el log; nunca sube
        _log.exception("no se pudo registrar la falla en Alertas")
        with _CANDADO:
            _ULTIMA_ESCRITURA.pop(alertas_fallas.clave(falla), None)


def reportar(falla: dict) -> bool:
    """Registra la falla (log, memoria y Alertas). True si quedo reportada."""
    try:
        registro = {**falla, "momento": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        registro.setdefault("origen", registro.get("herramienta", "desconocido"))
        with _CANDADO:
            _RECIENTES.append(registro)
        _log.warning("falla %s en %s: %s", registro.get("tipo"), registro.get("herramienta"),
                     registro.get("detalle"))
        from historico.alertas.fallas import clave
        if _a_alertas_activo() and _toca_escribir(clave(registro)):
            threading.Thread(target=_a_alertas, args=(registro,), daemon=True).start()
        return True
    except Exception:  # noqa: BLE001 — reportar jamas rompe la respuesta
        return False


def recientes(limite: int = 50) -> list[dict]:
    """Las ultimas fallas reportadas, la mas nueva primero."""
    with _CANDADO:
        return list(reversed(_RECIENTES))[:limite]
