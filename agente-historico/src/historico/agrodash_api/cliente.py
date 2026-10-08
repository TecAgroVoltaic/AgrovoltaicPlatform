"""Configuracion, transporte HTTP y catalogo de cajas/sensores de AgroDash."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

URL_BASE = os.environ.get("AGRODASH_API_URL", "https://agrodash.nm.35-208-114-233.nip.io/api/v1").rstrip("/")
ORIGIN = os.environ.get("AGRODASH_API_ORIGIN") or URL_BASE.split("/api/")[0]
TIMEOUT_SEG = float(os.environ.get("AGRODASH_API_TIMEOUT", "60"))

# Medido el 2026-09-11: el servidor devuelve como maximo ~5000 buckets POR LLAMADA (sin
# importar el rango) y cada llamada cuesta ~0.6-0.9 s casi fijo (500 o 8000 puntos da
# igual). 12 llamadas simultaneas terminan en 1.5 s. Los sensores leen cada 1-3 min.
# Por eso 'crudo' es ADAPTATIVO: una llamada gruesa por sensor da el conteo exacto de
# lecturas (suma de `n`), con eso se decide en cuantas ventanas partir para que cada
# bucket tenga una sola lectura, y se piden en paralelo.
MAX_PUNTOS_LLAMADA = 4500    # bajo el tope observado (~5000)
OBJETIVO_CRUDO = 2500        # lecturas por ventana en crudo (margen: la cadencia no es uniforme)
MAX_PROFUNDIDAD = 8          # bisecciones maximas si una ventana sigue mezclando lecturas
PASOS_SEG = (0, 60, 300, 900, 3600, 86400)   # 0 = crudo
# Concurrencia: SENSORES_PARALELO sensores a la vez x PARALELO tramos por sensor.
SENSORES_PARALELO = int(os.environ.get("AGRODASH_API_SENSORES_PARALELO", "4"))
PARALELO = int(os.environ.get("AGRODASH_API_PARALELO", "4"))
MAX_SENSORES_CONTEO = 24     # hasta aca `estimar` cuenta exacto (una llamada por sensor)


class AgroDashNoDisponible(RuntimeError):
    """La API no responde o respondio con error: la fuente queda deshabilitada."""


def _get(ruta: str, **params) -> object:
    q = ("?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})) if params else ""
    req = urllib.request.Request(f"{URL_BASE}/{ruta}{q}", headers={"Origin": ORIGIN, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEG) as r:
            return json.load(r)
    except urllib.error.HTTPError as exc:
        cuerpo = exc.read(200).decode("utf-8", "replace") if exc.fp else ""
        raise AgroDashNoDisponible(f"AgroDash respondio {exc.code} en /{ruta}: {cuerpo}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AgroDashNoDisponible(f"AgroDash inaccesible ({URL_BASE}): {exc}") from exc


def cajas() -> list[dict]:
    """[{id, name, sensors:[{id, sensor_number, type}]}] tal cual la API."""
    datos = _get("boxes")
    if not isinstance(datos, list):
        raise AgroDashNoDisponible("respuesta inesperada de /boxes")
    return datos


def rango_disponible() -> dict:
    """{first, last} en hora local CR naive (texto). `first` es 2011 (historico)."""
    r = _get("readings/time-range")
    return r if isinstance(r, dict) else {}


def sensores(filtros: dict[str, list[str]] | None = None) -> list[dict]:
    """Sensores aplanados: caja, sensor_numero, sensor_tipo, sensor_id. Filtra por
    `caja` y `sensor_tipo` (listas; vacias = todo). Orden estable: caja, numero, tipo."""
    f = filtros or {}
    quiere_cajas = set(f.get("caja") or [])
    quiere_tipos = set(f.get("sensor_tipo") or [])
    out = []
    for caja in cajas():
        if quiere_cajas and caja.get("name") not in quiere_cajas:
            continue
        for s in caja.get("sensors", []):
            if quiere_tipos and s.get("type") not in quiere_tipos:
                continue
            out.append({"caja": caja.get("name"), "sensor_numero": s.get("sensor_number"),
                        "sensor_tipo": s.get("type"), "sensor_id": s.get("id")})
    out.sort(key=lambda s: (str(s["caja"]), int(s["sensor_numero"] or 0), str(s["sensor_tipo"])))
    return out
