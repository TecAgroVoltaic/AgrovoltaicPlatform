"""
Tests de la salud de ingesta — sin DB real (la conexion se mockea).

Fijan la regla que faltaba el 2026-08-14: una ingesta congelada tiene que
reportarse como `stale`, no como "todo ok". Estructura Given-When-Then.
"""
from datetime import datetime, timedelta, timezone

import pytest

from pronostico import salud

UMBRAL_H = 6.0
AHORA = datetime.now(timezone.utc)


class _ConexionFalsa:
    """Devuelve filas fijas segun que SQL se ejecute (frescura / error / corrida)."""

    def __init__(self, frescura, ultimo_error=None, ultima_corrida=None):
        self._frescura = frescura
        self._ultimo_error = ultimo_error
        self._ultima_corrida = ultima_corrida

    def execute(self, sql, params=None):
        if "lecturas_ambientales_sc" in sql:
            return iter(self._frescura)
        if "nivel = 'error'" in sql:
            return _Resultado(self._ultimo_error)
        return _Resultado(self._ultima_corrida)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class _Resultado:
    def __init__(self, fila):
        self._fila = fila

    def fetchone(self):
        return self._fila


def _mockear(monkeypatch, conexion):
    monkeypatch.setattr(salud.config, "store_conninfo", lambda: "postgresql://fake")
    monkeypatch.setattr(salud.psycopg, "connect", lambda *a, **k: conexion)


def test_ingesta_fresca_reporta_ok(monkeypatch):
    # Given: ambas variables con datos de hace 10 minutos
    reciente = AHORA - timedelta(minutes=10)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 100), ("humedad_suelo", reciente, 200)],
        ultima_corrida=(reciente,),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then
    assert reporte["estado"] == salud.ESTADO_OK
    assert reporte["variables"]["irradiancia"]["estado"] == salud.ESTADO_OK


def test_ingesta_congelada_reporta_stale(monkeypatch):
    # Given: el ultimo dato es de hace 22 dias (el caso real del outage SC)
    viejo = AHORA - timedelta(days=22)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", viejo, 118386), ("humedad_suelo", viejo, 693930)],
        ultima_corrida=(AHORA,),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: no puede decir "ok" solo porque el ETL corrio sin error
    assert reporte["estado"] == salud.ESTADO_STALE
    assert reporte["variables"]["irradiancia"]["edad_horas"] > 500


def test_variable_sin_ninguna_fila_reporta_sin_datos(monkeypatch):
    # Given: irradiancia tiene datos, humedad_suelo no aparece en el store
    reciente = AHORA - timedelta(minutes=5)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 10)],
        ultima_corrida=(reciente,),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: el estado global toma el PEOR de las variables
    assert reporte["variables"]["humedad_suelo"]["estado"] == salud.ESTADO_SIN_DATOS
    assert reporte["estado"] == salud.ESTADO_SIN_DATOS


def test_expone_el_ultimo_error_del_etl(monkeypatch):
    # Given: hay un fallo de fuente registrado
    reciente = AHORA - timedelta(minutes=5)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 10), ("humedad_suelo", reciente, 10)],
        ultimo_error=(AHORA, "fallo:fuente", "connection timeout expired"),
        ultima_corrida=(reciente,),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: quien consulte la salud ve el error sin entrar a la DB
    assert reporte["ultimo_error_etl"]["evento"] == "fallo:fuente"
    assert "timeout" in reporte["ultimo_error_etl"]["error"]


@pytest.mark.parametrize("edad_h,esperado", [
    (0.0, salud.ESTADO_OK),
    (UMBRAL_H, salud.ESTADO_OK),           # el umbral es inclusivo
    (UMBRAL_H + 0.1, salud.ESTADO_STALE),
    (None, salud.ESTADO_SIN_DATOS),
])
def test_frontera_del_umbral(edad_h, esperado):
    # Given/When/Then: la frontera exacta no queda librada a interpretacion
    assert salud._estado(edad_h, UMBRAL_H) == esperado
