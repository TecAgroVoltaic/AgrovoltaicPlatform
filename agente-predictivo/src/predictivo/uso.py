"""Uso acumulado del agente: tokens, costo y numero de consultas.

SRP: acumular el consumo de TODAS las consultas y servirlo por `GET /uso`. No
calcula tarifas (eso es costos.py) ni corre el LLM. El servicio (api.py) llama
registrar() por cada consulta; el lazo del agente queda puro.

DONDE VIVE EL ACUMULADO. La fuente de verdad es el store (`gasto.py`, tabla
`uso_diario`). Este JSON local quedo como ESPEJO: sirve de respaldo cuando el
store esta caido, y nada mas. Antes era al reves, y estaba mal: el contenedor no
tiene volumen (`docker inspect` -> `Mounts: []`) y `forecast-refresh.timer` lo
recrea cada 6 h, asi que el acumulado se borraba hasta 4 veces por dia. La
consola mostraba 0 consultas y US$0 el mismo dia que se habian hecho 43.
"""
from __future__ import annotations

import copy
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from predictivo import config, gasto

# Archivo de persistencia (no se versiona). Override por env.
#
# Cuelga de DATA_DIR y NO de ROOT: instalado con pip, `config.ROOT` apunta a la
# raiz del interprete (site-packages), que en el contenedor NO es escribible —
# el acumulado fallaba con PermissionError y api.py se tragaba el error, asi que
# /uso reportaba 0.0 para siempre y el tope diario nunca podia dispararse.
# DATA_DIR ya viene apuntado al volumen en la imagen (ENV DATA_DIR=/app/data).
_RUTA = Path(os.environ.get("PREDICTIVO_USO_STORE", str(config.DATA_DIR / "uso.json")))
_LOCK = threading.Lock()  # /preguntar corre en el threadpool de FastAPI -> serializar la escritura

_VACIO = {
    "desde": None,
    "n_consultas": 0,
    "total_requests": 0,
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "total_usd": 0.0,
    "por_modelo": {},
    # Gasto por dia (UTC): habilita el tope diario sin tener que consultar la
    # DB ni recalcular sobre el acumulado historico. Ver limites.py.
    "por_dia": {},
}

# Cuantos dias de historial diario se conservan. El acumulado total nunca se
# pierde; esto solo acota el detalle por dia para que el JSON no crezca sin fin.
DIAS_HISTORIAL = 90


def _hoy() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _podar(por_dia: dict) -> dict:
    """Conserva solo los ultimos DIAS_HISTORIAL dias."""
    if len(por_dia) <= DIAS_HISTORIAL:
        return por_dia
    recientes = sorted(por_dia)[-DIAS_HISTORIAL:]
    return {d: por_dia[d] for d in recientes}


def _vacio() -> dict:
    """Copia PROFUNDA del acumulado vacio.

    `dict(_VACIO)` es copia superficial: los dicts anidados (`por_modelo`,
    `por_dia`) quedarian compartidos con la constante del modulo y se
    contaminarian entre lecturas — con el archivo ausente, dos "arranques de
    cero" veian el mismo estado acumulado.
    """
    return copy.deepcopy(_VACIO)


def _leer() -> dict:
    if _RUTA.exists():
        try:
            return {**_vacio(), **json.loads(_RUTA.read_text())}
        except Exception:  # archivo corrupto: arranca de cero en vez de romper
            return _vacio()
    return _vacio()


def _escribir(d: dict) -> None:
    _RUTA.parent.mkdir(parents=True, exist_ok=True)
    tmp = _RUTA.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2))
    tmp.replace(_RUTA)  # replace es atómico -> nunca deja el JSON a medias


def registrar(traza: dict) -> dict:
    """Suma una consulta al acumulado: primero al store, despues al espejo local.

    El store es el que importa; el JSON local se escribe igual para que el
    respaldo siga siendo util si Supabase se cae justo despues. Ninguna de las
    dos escrituras puede tumbar la respuesta del agente.
    """
    gasto.registrar_consulta(traza)
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
        dia = d["por_dia"].setdefault(_hoy(), {"n_consultas": 0, "usd": 0.0})
        dia["n_consultas"] += 1
        if usd is not None:
            dia["usd"] = round(dia["usd"] + float(usd), 6)
        d["por_dia"] = _podar(d["por_dia"])
        _escribir(d)
        return d


def usd_hoy() -> float:
    """Gasto acumulado del dia UTC en curso. Insumo del tope diario."""
    with _LOCK:
        return float(_leer()["por_dia"].get(_hoy(), {}).get("usd", 0.0))


def resumen() -> dict:
    """Acumulado actual (para GET /uso).

    Prefiere el store, que es lo unico que sobrevive a que se recree el
    contenedor. Si no responde, cae al espejo local y lo DICE en `fuente`: un
    numero mas chico de lo real es peor que un numero con su procedencia al lado.
    """
    del_store = gasto.acumulado()
    if del_store is not None:
        return del_store
    with _LOCK:
        return {**_leer(), "fuente": "espejo-local"}
