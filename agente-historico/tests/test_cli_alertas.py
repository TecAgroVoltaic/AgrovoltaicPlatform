"""`historico todo` deja las alertas para el final; `historico alertas` corre solo.

El orden es la regla de `docs/memoria/decisiones/regla-post-carga.md`: cada paso
escribe el denominador del siguiente, y las alertas derivan de los hallazgos.

Estructura Given-When-Then.
"""
from __future__ import annotations

import pytest

from historico import cli, db
from historico.alertas import evaluar
from historico.calidad import barrido, cielo, reporte, sol

RANGO = ["--desde", "2026-08-01", "--hasta", "2026-09-01"]


@pytest.fixture
def pasos(monkeypatch) -> list[str]:
    corridos: list[str] = []

    def anotar(nombre, salida):
        return lambda *a, **k: corridos.append(nombre) or salida

    monkeypatch.setattr(sol, "poblar", anotar("sol", 0))
    monkeypatch.setattr(barrido, "barrer", anotar("barrido", {}))
    monkeypatch.setattr(cielo, "caracterizar", anotar("cielo", {}))
    monkeypatch.setattr(reporte, "generar", anotar("reporte", ""))
    monkeypatch.setattr(evaluar, "evaluar", anotar("alertas", {}))
    monkeypatch.setattr(db, "cerrar", lambda: None)
    monkeypatch.setattr(db, "uno", lambda *a, **k: {"d0": "2026-08-01", "d1": "2026-08-31"})
    return corridos


def test_todo_corre_las_alertas_al_final(pasos):
    # When
    assert cli.main(["todo", *RANGO]) == 0

    # Then
    assert pasos == ["sol", "barrido", "cielo", "reporte", "alertas"]


def test_alertas_corre_solo_el_generador(pasos):
    assert cli.main(["alertas", *RANGO]) == 0
    assert pasos == ["alertas"]
