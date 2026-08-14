"""
Tests del panel operativo — composición, sin DB real.

Lo que fijan: que el panel siga siendo útil aunque partes del store fallen (un
panel de salud que se cae cuando algo anda mal no sirve para nada), y que
distinga "no se gastó nada" de "no se pudo medir el gasto".
Estructura Given-When-Then.
"""
from datetime import datetime, timezone

import pytest

from pronostico import observabilidad, salud

AHORA = datetime.now(timezone.utc)

INGESTA_OK = {
    "estado": salud.ESTADO_OK,
    "variables": {"irradiancia": {"edad_horas": 0.2, "estado": salud.ESTADO_OK}},
}
INGESTA_STALE = {
    "estado": salud.ESTADO_STALE,
    "variables": {"irradiancia": {"edad_horas": 541.7, "estado": salud.ESTADO_STALE}},
}


class _ConexionFalsa:
    def __init__(self, errores=(), prediccion=None):
        self._errores = list(errores)
        self._prediccion = prediccion

    def execute(self, sql, params=None):
        self._ultimo = "predicciones" in sql
        return self

    def __iter__(self):
        return iter(self._errores)

    def fetchone(self):
        return self._prediccion

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@pytest.fixture
def store_ok(monkeypatch):
    monkeypatch.setattr(observabilidad.config, "store_conninfo", lambda: "postgresql://fake")
    monkeypatch.setattr(observabilidad.limites, "presupuesto_agotado",
                        lambda *a, **k: (False, 0.0043, 5.0))
    monkeypatch.setattr(observabilidad.gasto, "usd_hoy", lambda: 0.0043)


def _mock_conexion(monkeypatch, conexion):
    monkeypatch.setattr(observabilidad.psycopg, "connect", lambda *a, **k: conexion)


def test_panel_reune_ingesta_errores_y_gasto(monkeypatch, store_ok):
    # Given: ingesta stale y un error del ETL registrado
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_STALE)
    _mock_conexion(monkeypatch, _ConexionFalsa(
        errores=[(AHORA, "etl", "fallo:fuente", "connection timeout expired")],
        prediccion=(AHORA, "irradiancia", 313.4, "W/m2", "persistencia_kt"),
    ))

    # When
    p = observabilidad.panel()

    # Then: todo lo que hace falta para diagnosticar, en una sola respuesta
    assert p["estado"] == salud.ESTADO_STALE
    assert p["errores_recientes"][0]["evento"] == "fallo:fuente"
    assert p["presupuesto"]["gastado_hoy_usd"] == 0.0043
    assert p["ultima_prediccion"]["variable"] == "irradiancia"
    assert p["limites"]["llm_por_min"] > 0


def test_el_panel_sobrevive_si_no_puede_leer_los_errores(monkeypatch, store_ok):
    # Given: la ingesta se puede consultar, pero la lectura de errores falla
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)

    def explota(*a, **k):
        raise OSError("consulta caida")
    monkeypatch.setattr(observabilidad.psycopg, "connect", explota)

    # When
    p = observabilidad.panel()

    # Then: degrada a vacío en vez de tumbarse — un panel de salud que se cae
    # cuando algo anda mal no sirve para nada
    assert p["estado"] == salud.ESTADO_OK
    assert p["errores_recientes"] == []
    assert p["ultima_prediccion"] is None


def test_distingue_gasto_cero_de_gasto_no_medido(monkeypatch, store_ok):
    # Given: el store no pudo informar el gasto
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)
    monkeypatch.setattr(observabilidad.gasto, "usd_hoy", lambda: None)
    _mock_conexion(monkeypatch, _ConexionFalsa())

    # When
    p = observabilidad.panel()

    # Then: `medido` avisa que ese número no es confiable
    assert p["presupuesto"]["medido"] is False


def test_sin_errores_ni_predicciones_no_rompe(monkeypatch, store_ok):
    # Given: sistema nuevo, tablas vacías
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)
    _mock_conexion(monkeypatch, _ConexionFalsa(errores=[], prediccion=None))

    # When
    p = observabilidad.panel()

    # Then
    assert p["errores_recientes"] == [] and p["ultima_prediccion"] is None
