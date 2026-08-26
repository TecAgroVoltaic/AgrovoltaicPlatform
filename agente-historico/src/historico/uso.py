"""Uso acumulado del agente — tokens, costo y nº de consultas a nivel proceso.

SRP: acumular el consumo de TODAS las consultas y persistirlo en un JSON para que
sobreviva reinicios. No calcula tarifas (eso es costos.py) ni corre el LLM. El
servicio (api.py) llama registrar() por cada /preguntar; el lazo del agente queda
puro (no sabe de acumulados).

Es el "nodo extraíble" del consumo general: GET /uso devuelve resumen().
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from historico import config

# Archivo de persistencia (no se versiona: ver .gitignore -> .uso/). Override por env.
_RUTA = Path(os.environ.get("HISTORICO_USO_STORE")
    or os.environ.get("HISTORICO_USO_STORE")   # nombre anterior, respaldo
    or str(config.ROOT / ".uso" / "uso.json"))
_LOCK = threading.Lock()  # las tools corren en el threadpool de FastAPI -> serializar la escritura

_VACIO = {
    "desde": None,
    "n_consultas": 0,
    "total_requests": 0,
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "total_usd": 0.0,
    "por_modelo": {},
    # Gasto por dia (clave = fecha UTC ISO). Existe para poder TOPAR el gasto y no
    # solo contarlo: un acumulado desde el principio de los tiempos no sirve de
    # freno, porque nunca baja.
    "por_dia": {},
}

# Cuantos dias de detalle diario se conservan. El acumulado total no se toca; lo
# que se poda es el desglose, que solo se usa para el tope del dia en curso.
DIAS_RETENIDOS = 60


def _leer() -> dict:
    if _RUTA.exists():
        try:
            return {**_VACIO, **json.loads(_RUTA.read_text())}
        except Exception:  # archivo corrupto: arranca de cero en vez de romper
            return dict(_VACIO)
    return dict(_VACIO)


def _escribir(d: dict) -> None:
    _RUTA.parent.mkdir(parents=True, exist_ok=True)
    tmp = _RUTA.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2))
    tmp.replace(_RUTA)  # replace es atómico -> nunca deja el JSON a medias


def registrar(traza: dict) -> dict:
    """Suma una consulta (usage + costo de la traza) al acumulado y persiste."""
    usage = traza.get("usage") or {}
    costo = traza.get("costo") or {}
    modelo = traza.get("modelo", "?")
    usd = costo.get("usd_total")
    with _LOCK:
        d = _leer()
        if d["desde"] is None:
            d["desde"] = datetime.now(timezone.utc).isoformat()
        d["n_consultas"] += 1
        d["total_requests"] += int(usage.get("requests", 0) or 0)
        d["total_input_tokens"] += int(usage.get("input_tokens", 0) or 0)
        d["total_output_tokens"] += int(usage.get("output_tokens", 0) or 0)
        if usd is not None:
            d["total_usd"] = round(d["total_usd"] + float(usd), 6)
        pm = d["por_modelo"].setdefault(
            modelo, {"n_consultas": 0, "input_tokens": 0, "output_tokens": 0, "usd_total": 0.0})
        pm["n_consultas"] += 1
        pm["input_tokens"] += int(usage.get("input_tokens", 0) or 0)
        pm["output_tokens"] += int(usage.get("output_tokens", 0) or 0)
        if usd is not None:
            pm["usd_total"] = round(pm["usd_total"] + float(usd), 6)
        if usd is not None:
            hoy = _hoy()
            dia = d["por_dia"].setdefault(hoy, {"n_consultas": 0, "usd": 0.0})
            dia["n_consultas"] += 1
            dia["usd"] = round(dia["usd"] + float(usd), 6)
            if len(d["por_dia"]) > DIAS_RETENIDOS:
                for viejo in sorted(d["por_dia"])[:-DIAS_RETENIDOS]:
                    del d["por_dia"][viejo]
        _escribir(d)
        return d


def _hoy() -> str:
    """La fecha UTC de hoy. El tope es por dia natural, no por ventana movil."""
    return datetime.now(timezone.utc).date().isoformat()


def usd_hoy() -> float:
    """Cuanto se lleva gastado HOY. Es lo que mira el tope de presupuesto."""
    with _LOCK:
        return float((_leer()["por_dia"].get(_hoy()) or {}).get("usd", 0.0))


def resumen() -> dict:
    """Acumulado actual (para GET /uso). Lectura consistente bajo el lock."""
    with _LOCK:
        return _leer()
