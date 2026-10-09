"""Medias diarias de temperatura y humedad del aire de San Carlos, pedidas a AgroDash.

AgroDash no da cuartiles: solo crudo o buckets con su promedio. Por eso la
climatologia se arma sobre MEDIAS DIARIAS (un bucket de 86.400 s por sensor y dia)
y los cuartiles se calculan aca. Pedir crudo para un rango de meses serian miles de
llamadas por sensor; el bucket diario es una sola.

Los buckets diarios se alinean con la medianoche LOCAL porque la API recibe y
devuelve hora local de Costa Rica sin zona, y `/readings` etiqueta cada bucket con su
CENTRO: el dia del bucket es su etiqueta menos medio paso.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from typing import Iterable

from historico import agrodash_api
from historico.analitica.ventana import Ventana

PASO_DIARIO_SEG = 86_400
# Techo de llamadas simultaneas a AgroDash: es un servidor ajeno y compartido.
MAX_LLAMADAS_SIMULTANEAS = 4
# `Caja ESP32 Prueba SC` es un banco de pruebas (un solo dia, 2026-07-01, con valores
# redondos de 20,0 a 34,9 C): no describe el clima del sitio.
MARCA_CAJA_DE_PRUEBA = "Prueba"
_MEDIO_BUCKET = timedelta(seconds=PASO_DIARIO_SEG / 2)


def sensores_climaticos(tipos: Iterable[str]) -> list[dict]:
    """Sensores de San Carlos de los tipos pedidos, sin las cajas de prueba."""
    return [s for s in agrodash_api.sensores({"sensor_tipo": list(tipos)})
            if agrodash_api.es_san_carlos(s["caja"])
            and MARCA_CAJA_DE_PRUEBA not in str(s["caja"])]


def _medias_de_sensor(sensor: dict, desde: datetime, hasta: datetime) -> list[tuple[date, float]]:
    medias = []
    for bucket in agrodash_api.lecturas(sensor["sensor_id"], desde, hasta, PASO_DIARIO_SEG):
        if bucket.get("value") is None:
            continue
        dia = (datetime.fromisoformat(bucket["bucket"]) - _MEDIO_BUCKET).date()
        medias.append((dia, float(bucket["value"])))
    return medias


def medias_diarias(v: Ventana, tipos: tuple[str, ...]) -> dict[str, dict]:
    """`{tipo: {"cajas_sensor": [...], "medias": [(dia, valor), ...]}}` de la ventana.

    `cajas_sensor` lista las cajas que TIENEN un sensor de ese tipo, midan o no en la
    ventana. Levanta `AgroDashNoDisponible` si la API no responde.
    """
    sensores = sensores_climaticos(tipos)
    desde = datetime.combine(v.desde, time.min)
    hasta = datetime.combine(v.hasta, time.min)
    with ThreadPoolExecutor(max_workers=MAX_LLAMADAS_SIMULTANEAS) as pool:
        por_sensor = list(pool.map(lambda s: _medias_de_sensor(s, desde, hasta), sensores))
    salida: dict[str, dict] = {tipo: {"cajas_sensor": [], "medias": []} for tipo in tipos}
    for sensor, medias in zip(sensores, por_sensor):
        grupo = salida[sensor["sensor_tipo"]]
        if sensor["caja"] not in grupo["cajas_sensor"]:
            grupo["cajas_sensor"].append(sensor["caja"])
        grupo["medias"].extend(medias)
    return salida
