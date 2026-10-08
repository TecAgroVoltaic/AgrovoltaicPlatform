"""Clasificacion del dia por kt y VI, y la corrida que la guarda con sus hallazgos."""
from __future__ import annotations

import json
from datetime import date

from historico import config, db
from historico.calidad.cielo.consultas import _SQL_CIELO, _UPSERT_CIELO, _UPSERT_HALLAZGO

# Por encima de esta proporcion de muestras imposibles el dia es GRAVE (calibracion
# rota); por debajo son picos sueltos y queda en aviso.
_PROPORCION_GRAVE = 0.05


def clasificar(kt_medio: float | None, vi: float | None) -> str:
    """Clase del dia a partir de cuanta luz llego (kt) y que tan a saltos (VI)."""
    if kt_medio is None:
        return "sin_datos"
    if vi is not None and vi >= config.VI_VARIABLE:
        return "variable"
    if kt_medio >= config.KT_DESPEJADO:
        return "despejado"
    if kt_medio < config.KT_CUBIERTO:
        return "cubierto"
    return "parcial"


def _fila_cielo(f: dict) -> tuple:
    """La tupla de `cielo_diario` en el orden del UPSERT."""
    return (
        f["fecha"], f["n"], f["kt_medio"], f["kt_mediana"],
        f["frac_despejado"], f["frac_parcial"], f["frac_cubierto"],
        f["vi"], clasificar(f["kt_medio"], f["vi"]), f["energia_medida"], f["energia_cs"],
    )


def _hallazgo_kt(f: dict) -> tuple:
    """La tupla del hallazgo `kt_imposible` de un dia con muestras imposibles."""
    proporcion = f["n_kt_imposible"] / f["n_total"]
    return (
        f["fecha"],
        "grave" if proporcion > _PROPORCION_GRAVE else "aviso",
        f["n_kt_imposible"],
        json.dumps({
            "muestras_imposibles": f["n_kt_imposible"],
            "de": f["n_total"],
            "proporcion": round(proporcion, 4),
            "kt_max": round(f["kt_max"], 2) if f["kt_max"] else None,
            "umbral": config.KT_IMPOSIBLE,
            "nota": "kt sobre 1,2 es mas energia que la de cielo despejado: "
                    "dato invalido o calibracion mal puesta, no una nube",
        }),
    )


def caracterizar(desde: date, hasta: date) -> dict:
    """Calcula el cielo de cada dia de [desde, hasta) y lo guarda. Idempotente.

    De paso deja los hallazgos `kt_imposible`, que son datos invalidos detectados
    por fisica y no por umbral.
    """
    filas = db.query(_SQL_CIELO, (
        desde, hasta, config.CS_MINIMO_WM2,
        config.KT_IMPOSIBLE,          # imposibles: se apartan
        config.KT_IMPOSIBLE,          # rejilla: solo las validas
        config.KT_DESPEJADO,
        config.KT_CUBIERTO, config.KT_DESPEJADO,
        config.KT_CUBIERTO,
    ))

    cielo = [_fila_cielo(f) for f in filas]
    hallazgos = [_hallazgo_kt(f) for f in filas if f["n_kt_imposible"]]

    db.ejecutar_muchos(_UPSERT_CIELO, cielo)
    db.ejecutar_muchos(_UPSERT_HALLAZGO, hallazgos)

    clases: dict[str, int] = {}
    for c in cielo:
        clases[c[8]] = clases.get(c[8], 0) + 1
    return {
        "dias_caracterizados": len(cielo),
        "por_clase": clases,
        "dias_con_kt_imposible": len(hallazgos),
    }
