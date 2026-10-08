"""El cruce por bin de la familia 6: temperatura media por bin, r de Pearson y rachas.

Calculo PURO sobre bins de `umbrales.BIN_DE_EMPAREJAMIENTO_SEG`, el mismo
emparejamiento que usa `disponibilidad`. Se usa desde `entre_sensores`.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import StatisticsError, correlation

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import Serie, es_valor
from historico.calidad.pruebas.disponibilidad import bin_de_emparejamiento

_BIN = timedelta(seconds=umbrales.BIN_DE_EMPAREJAMIENTO_SEG)
_MINUTOS_POR_BIN = umbrales.BIN_DE_EMPAREJAMIENTO_SEG / 60


def _temperatura_por_bin(serie: Serie, indices, amanecer: datetime,
                         atardecer: datetime) -> dict[datetime, tuple[float, int]]:
    """{bin: (temperatura media, lecturas)} dentro de la ventana solar del dia.

    Media y no primera lectura: en los tramos a 2 s caen decenas por bin.
    """
    temps: dict[datetime, list[float]] = {}
    for i in indices:
        marca, valor = serie.marcas[i], serie.valores[i]
        if es_valor(valor) and amanecer <= marca < atardecer:
            temps.setdefault(bin_de_emparejamiento(marca), []).append(valor)
    return {b: (sum(v) / len(v), len(v)) for b, v in sorted(temps.items())}


def _pearson(temps: list[float], ghis: list[float]) -> float | None:
    """r de Pearson, o None si una de las dos series no varia (no hay relacion)."""
    try:
        return correlation(temps, ghis)
    except StatisticsError:
        return None


def _racha_mas_larga_min(bins: list[datetime]) -> float:
    """Minutos de la racha mas larga de bins CONSECUTIVOS (separados por un bin)."""
    mas_larga = actual = 0
    previo = None
    for ventana in sorted(bins):
        actual = actual + 1 if previo is not None and ventana - previo == _BIN else 1
        mas_larga = max(mas_larga, actual)
        previo = ventana
    return mas_larga * _MINUTOS_POR_BIN
