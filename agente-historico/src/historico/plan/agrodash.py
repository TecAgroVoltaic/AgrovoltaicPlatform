"""Remuestreo de AgroDash via su API (`paso` = ancho del bucket).

`/readings` etiqueta cada bucket con su CENTRO: el inicio del intervalo es la
etiqueta menos medio paso (y se lleva al borde de la rejilla por si la API redondea).
Por caja se combinan sus sensores de ese tipo (promedio pesado por `n`, min de los
min, max de los max, suma = promedio x n). El SITIO (formato ancho) es el promedio
de las cajas; para min y max, el min y el max de las cajas.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from historico import agrodash_api
from historico.analitica.climatologia.agrodash import MARCA_CAJA_DE_PRUEBA
from historico.catalogo_datos.agrodash import REGION_DE_FUENTE
from historico.plan.modelo import MAXIMO, MINIMO, SUMA, ColumnaPlan
from historico.plan.rejilla import inicio_intervalo


def sensores(c: ColumnaPlan) -> list[dict]:
    """Sensores de ese tipo en las cajas del sitio de la columna, sin cajas de prueba
    (la misma regla que la climatologia: no describen el sitio)."""
    region = REGION_DE_FUENTE[c.variable.fuente]
    return [s for s in agrodash_api.sensores({"sensor_tipo": [c.variable.sensor_tipo]})
            if agrodash_api.region_de(s["caja"]) == region
            and MARCA_CAJA_DE_PRUEBA not in str(s["caja"])]


def _buckets(s: dict, inicio: datetime, fin: datetime, paso_s: int) -> list[tuple[datetime, dict]]:
    medio = timedelta(seconds=paso_s / 2)
    out = []
    for b in agrodash_api.lecturas(s["sensor_id"], inicio, fin, paso_s):
        if b.get("value") is None:
            continue
        t = datetime.fromisoformat(b["bucket"])
        out.append((inicio_intervalo(t - medio, paso_s) if paso_s else t, b))
    return out


def _por_sensor(c: ColumnaPlan, inicio: datetime, fin: datetime, paso_s: int):
    sens = sensores(c)
    with ThreadPoolExecutor(max_workers=max(1, min(agrodash_api.SENSORES_PARALELO, len(sens)))) as pool:
        return list(zip(sens, pool.map(lambda s: _buckets(s, inicio, fin, paso_s), sens)))


def _campo(b: dict, campo: str) -> float:
    return float(b[campo] if b.get(campo) is not None else b["value"])


def _valor_caja(agg: str, acc: list[dict]) -> float:
    if agg == MINIMO:
        return min(_campo(b, "min") for b in acc)
    if agg == MAXIMO:
        return max(_campo(b, "max") for b in acc)
    total = sum(float(b["value"]) * int(b.get("n") or 1) for b in acc)
    if agg == SUMA:
        return total
    return total / sum(int(b.get("n") or 1) for b in acc)


def por_caja(c: ColumnaPlan, inicio: datetime, fin: datetime, paso_s: int
             ) -> dict[tuple[datetime, str], float]:
    """(intervalo, caja) -> valor agregado de los sensores de esa caja."""
    acc: dict[tuple[datetime, str], list[dict]] = {}
    for s, buckets in _por_sensor(c, inicio, fin, paso_s):
        for t, b in buckets:
            acc.setdefault((t, s["caja"]), []).append(b)
    return {k: _valor_caja(c.agregacion, bs) for k, bs in acc.items()}


def sitio(c: ColumnaPlan, inicio: datetime, fin: datetime, paso_s: int) -> dict[datetime, float]:
    """intervalo -> valor del sitio (formato ancho)."""
    por_t: dict[datetime, list[float]] = {}
    for (t, _), v in por_caja(c, inicio, fin, paso_s).items():
        por_t.setdefault(t, []).append(v)
    if c.agregacion == MINIMO:
        return {t: min(vs) for t, vs in por_t.items()}
    if c.agregacion == MAXIMO:
        return {t: max(vs) for t, vs in por_t.items()}
    return {t: sum(vs) / len(vs) for t, vs in por_t.items()}


def largo(c: ColumnaPlan, inicio: datetime, fin: datetime, paso_s: int) -> list[tuple]:
    """(t, caja, v) ordenado. Crudo (paso 0): cada lectura de cada sensor."""
    if paso_s:
        return sorted((t, caja, v) for (t, caja), v in por_caja(c, inicio, fin, paso_s).items())
    filas = [(t, s["caja"], float(b["value"]))
             for s, buckets in _por_sensor(c, inicio, fin, 0) for t, b in buckets]
    return sorted(filas, key=lambda f: (f[0], f[1]))


def conteo_crudo(c: ColumnaPlan, inicio: datetime, fin: datetime) -> tuple[int, bool]:
    """(lecturas, es_cota). Exacto hasta MAX_SENSORES_CONTEO sensores; si no, ~1/min."""
    sens = sensores(c)
    if len(sens) <= agrodash_api.MAX_SENSORES_CONTEO:
        return sum(agrodash_api.conteos(sens, inicio, fin)), False
    return len(sens) * int((fin - inicio).total_seconds() // 60), True
