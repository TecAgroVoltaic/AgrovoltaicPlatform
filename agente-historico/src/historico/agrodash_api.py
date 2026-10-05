"""Cliente de la API publica de AgroDash (dashboard de sensores, Rust/Axum) — SOLO LECTURA.

Responsabilidad unica: hablar HTTP con AgroDash y devolver filas planas para la
exportacion. Es la segunda fuente de `exportar.py`. Se eligio la API y no la DB
porque esta expuesta en internet (sin autenticacion; solo exige el header Origin)
y por tanto funciona desde cualquier maquina, no solo desde la EC2.

Lo que la API da (verificado en vivo el 2026-09-11; el PDF de referencia de abril
quedo viejo en dos puntos):
- `GET /boxes`                          cajas con sus sensores (id, sensor_number, type)
- `GET /readings/time-range`            {first, last} de toda la tabla de lecturas
- `GET /readings?sensor_id&from&to&points`  buckets: {bucket, value(prom), n, min, max, std}
  * `from`/`to` y `bucket` van en HORA LOCAL de Costa Rica, naive ("2026-09-09T06:00:00");
    con "Z" responde 400. (El PDF decia UTC: hoy la API convierte a local. Verificado
    cruzando valores con el store de Supabase, que si guarda UTC real.)
  * El servidor emite hasta ~5000 buckets por llamada aunque se pidan mas.
  * Un bucket con n=0 (sin lecturas) trae value=None: se descarta.
  * Con buckets mas finos que la cadencia del sensor, cada bucket tiene n=1 -> dato crudo.
- `GET /readings/last?sensor_id`        ultima lectura del sensor.

No hay endpoint de lecturas crudas ni de exportacion: la exportacion se arma
pidiendo buckets finos por sensor y por tramos del rango.
"""
from __future__ import annotations

import json
import math
import os
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from itertools import islice
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Iterator

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


def _parse_bucket(texto: str) -> datetime:
    return datetime.fromisoformat(texto)   # hora local naive, a veces con fraccion (.500)


def tramos(desde: datetime, hasta: datetime, paso_seg: int) -> list[tuple[datetime, datetime, int]]:
    """Parte [desde, hasta) en tramos (ini, fin, puntos) de <= MAX_PUNTOS_LLAMADA buckets
    de `paso_seg` cada uno (para resoluciones fijas, no para crudo)."""
    ancho = timedelta(seconds=paso_seg * MAX_PUNTOS_LLAMADA)
    out, ini = [], desde
    while ini < hasta:
        fin = min(ini + ancho, hasta)
        out.append((ini, fin, max(1, math.ceil((fin - ini).total_seconds() / paso_seg))))
        ini = fin
    return out


def ventanas(desde: datetime, hasta: datetime, k: int) -> list[tuple[datetime, datetime]]:
    """Parte [desde, hasta) en k ventanas iguales, contiguas."""
    k = max(1, k)
    total = (hasta - desde) / k
    cortes = [desde + total * i for i in range(k)] + [hasta]
    return [(cortes[i], cortes[i + 1]) for i in range(k)]


def _tramo(sensor_id: str, ini: datetime, fin: datetime, puntos: int) -> list[dict]:
    datos = _get("readings", sensor_id=sensor_id, **{"from": ini.isoformat(timespec="seconds"),
                                                      "to": fin.isoformat(timespec="seconds")},
                 points=puntos)
    return [b for b in (datos or []) if b and b.get("n")]     # descarta buckets vacios (n=0)


def _map_ventana(pool: ThreadPoolExecutor, fn, items, ventana: int):
    """Como pool.map (en orden) pero con a lo sumo `ventana` tareas en vuelo: no lanza
    todo de golpe (una vista previa de 5 filas no debe disparar 491 sensores)."""
    it = iter(items)
    pend: deque = deque(pool.submit(fn, x) for x in islice(it, ventana))
    while pend:
        f = pend.popleft()
        nxt = next(it, None)
        if nxt is not None:
            pend.append(pool.submit(fn, nxt))
        yield f.result()


def conteo(sensor_id: str, desde: datetime, hasta: datetime) -> int:
    """Cantidad EXACTA de lecturas del sensor en el rango: una llamada gruesa, suma de `n`."""
    return sum(int(b.get("n") or 0) for b in _tramo(sensor_id, desde, hasta, MAX_PUNTOS_LLAMADA))


def _crudo_ventana(sensor_id: str, ini: datetime, fin: datetime, profundidad: int = 0) -> list[dict]:
    """Lecturas crudas de una ventana: si algun bucket mezcla >1 lectura, biseca (secuencial,
    es raro: solo pasa cuando la cadencia es muy irregular)."""
    buckets = _tramo(sensor_id, ini, fin, MAX_PUNTOS_LLAMADA)
    if profundidad >= MAX_PROFUNDIDAD or all((b.get("n") or 0) <= 1 for b in buckets):
        return buckets
    mitad = ini + (fin - ini) / 2
    return (_crudo_ventana(sensor_id, ini, mitad, profundidad + 1)
            + _crudo_ventana(sensor_id, mitad, fin, profundidad + 1))


def _crudo(sensor_id: str, desde: datetime, hasta: datetime) -> list[dict]:
    """Crudo adaptativo: 1) llamada gruesa -> conteo exacto N; si ya vino sin mezclas, listo.
    2) k = ceil(N / OBJETIVO_CRUDO) ventanas iguales en paralelo; 3) bisecar las que mezclen."""
    gruesa = _tramo(sensor_id, desde, hasta, MAX_PUNTOS_LLAMADA)
    if all((b.get("n") or 0) <= 1 for b in gruesa):
        return gruesa
    n_total = sum(int(b.get("n") or 0) for b in gruesa)
    k = max(2, math.ceil(n_total / OBJETIVO_CRUDO))
    vs = ventanas(desde, hasta, k)
    with ThreadPoolExecutor(max_workers=min(PARALELO, k)) as pool:
        partes = list(pool.map(lambda v: _crudo_ventana(sensor_id, v[0], v[1], 1), vs))
    return [b for parte in partes for b in parte]


def lecturas(sensor_id: str, desde: datetime, hasta: datetime, paso_seg: int) -> Iterator[dict]:
    """Buckets de UN sensor en [desde, hasta) (hora local naive), en orden temporal.
    paso_seg=0 -> crudo adaptativo (cada bucket = una lectura); >0 -> buckets de ese ancho,
    pedidos por tramos en paralelo."""
    if not paso_seg:
        yield from _crudo(sensor_id, desde, hasta)
        return
    lista = tramos(desde, hasta, paso_seg)
    if len(lista) <= 1:
        for ini, fin, puntos in lista:
            yield from _tramo(sensor_id, ini, fin, puntos)
        return
    with ThreadPoolExecutor(max_workers=min(PARALELO, len(lista))) as pool:
        for buckets in pool.map(lambda t: _tramo(sensor_id, *t), lista):
            yield from buckets


def filas(sel_nombres: list[str], desde: datetime, hasta: datetime,
          filtros: dict[str, list[str]] | None, paso_seg: int, limite: int | None = None
          ) -> Iterator[tuple]:
    """Filas planas (tuplas en el orden de `sel_nombres`) de todos los sensores que
    pasan los filtros: por sensor (SENSORES_PARALELO a la vez, en orden) y luego por
    tiempo. Campos: ts (datetime naive local CR), caja, sensor_numero, sensor_tipo,
    sensor_id, valor (promedio del bucket; = la lectura en crudo), n, minimo, maximo, desvio."""
    def por_sensor(s: dict) -> list[tuple]:
        out = []
        for b in lecturas(s["sensor_id"], desde, hasta, paso_seg):
            fila = {"ts": _parse_bucket(b["bucket"]), **s,
                    "valor": b.get("value"), "n": b.get("n"),
                    "minimo": b.get("min"), "maximo": b.get("max"), "desvio": b.get("std")}
            out.append(tuple(fila[c] for c in sel_nombres))
        return out

    emitidas = 0
    pool = ThreadPoolExecutor(max_workers=SENSORES_PARALELO)
    try:
        for filas_sensor in _map_ventana(pool, por_sensor, sensores(filtros), SENSORES_PARALELO):
            for f in filas_sensor:
                yield f
                emitidas += 1
                if limite and emitidas >= limite:
                    return
    finally:
        # Si quien consume corto (vista previa satisfecha, cliente desconectado), no
        # esperar a los sensores en cola: se cancelan; los en vuelo terminan solos.
        pool.shutdown(wait=False, cancel_futures=True)


def conteos(sensores_: list[dict], desde: datetime, hasta: datetime) -> list[int]:
    """Conteo exacto de lecturas por sensor, en paralelo (para `estimar`)."""
    with ThreadPoolExecutor(max_workers=min(SENSORES_PARALELO * PARALELO, max(1, len(sensores_)))) as pool:
        return list(pool.map(lambda s: conteo(s["sensor_id"], desde, hasta), sensores_))


def filas_sensores(sel_nombres: list[str], filtros: dict[str, list[str]] | None) -> Iterator[tuple]:
    """Catalogo de sensores como filas planas (dataset sin tiempo)."""
    for s in sensores(filtros):
        yield tuple(s[c] for c in sel_nombres)
