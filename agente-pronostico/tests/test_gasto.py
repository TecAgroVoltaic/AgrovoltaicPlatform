"""
Tests del gasto diario en el store — sin DB real (psycopg mockeado).

Lo que fijan: que un store caido NO tumbe el servicio ni bloquee las consultas,
y que "no sé cuánto se gastó" (None) sea distinguible de "no se gastó nada"
(0.0). Estructura Given-When-Then.
"""
import pytest

from pronostico import gasto, limites


class _ConexionFalsa:
    def __init__(self, fila=None, registro=None):
        self._fila = fila
        self._registro = registro if registro is not None else []

    def execute(self, sql, params=None):
        self._registro.append((sql, params))
        return self

    def fetchone(self):
        return self._fila

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _mockear(monkeypatch, conexion=None, error=None):
    monkeypatch.setattr(gasto.config, "store_conninfo", lambda: "postgresql://fake")

    def conectar(*a, **k):
        if error:
            raise error
        return conexion

    monkeypatch.setattr(gasto.psycopg, "connect", conectar)


def test_registra_el_costo_de_una_consulta(monkeypatch):
    # Given
    registro: list = []
    _mockear(monkeypatch, _ConexionFalsa(registro=registro))

    # When
    ok = gasto.registrar(0.0043)

    # Then: un solo upsert, con el costo
    assert ok is True
    assert "INSERT INTO gasto_diario" in registro[0][0]
    assert registro[0][1][1] == 0.0043


def test_no_escribe_si_no_hay_costo(monkeypatch):
    # Given: una traza sin costo (p. ej. respuesta cacheada)
    registro: list = []
    _mockear(monkeypatch, _ConexionFalsa(registro=registro))

    # When/Then: no ensucia la tabla con filas de 0
    assert gasto.registrar(None) is False
    assert registro == []


def test_un_store_caido_no_tumba_la_consulta(monkeypatch):
    # Given: el store no responde
    _mockear(monkeypatch, error=OSError("store caido"))

    # When/Then: best-effort, devuelve False en vez de propagar
    assert gasto.registrar(0.01) is False


def test_sin_fila_del_dia_el_gasto_es_cero(monkeypatch):
    # Given: primera consulta del día
    _mockear(monkeypatch, _ConexionFalsa(fila=None))

    # When/Then: 0.0, no None — sí sabemos que no se gastó nada
    assert gasto.usd_hoy() == 0.0


def test_store_inaccesible_devuelve_none_no_cero(monkeypatch):
    # Given: el store no responde
    _mockear(monkeypatch, error=OSError("store caido"))

    # When/Then: None = "no sé", distinguible de 0.0 = "nada"
    assert gasto.usd_hoy() is None


def test_store_caido_no_bloquea_pero_cae_al_acumulado_local(monkeypatch):
    # Given: store inaccesible y un gasto local por debajo del tope
    monkeypatch.setattr(limites.gasto_mod, "usd_hoy", lambda: None)
    monkeypatch.setattr(limites.uso_mod, "usd_hoy", lambda: 1.0)

    # When
    agotado, gastado, tope = limites.presupuesto_agotado(tope_usd=5.0)

    # Then: no se bloquea el servicio por un fallo de infraestructura
    assert agotado is False and gastado == 1.0


def test_el_store_manda_sobre_el_acumulado_local(monkeypatch):
    # Given: el store sabe de un gasto que el proceso local no vio
    # (p. ej. otra instancia, o el contenedor se recreó)
    monkeypatch.setattr(limites.gasto_mod, "usd_hoy", lambda: 7.0)
    monkeypatch.setattr(limites.uso_mod, "usd_hoy", lambda: 0.0)

    # When
    agotado, gastado, _ = limites.presupuesto_agotado(tope_usd=5.0)

    # Then: corta igual — el tope es del sistema, no del proceso
    assert agotado is True and gastado == 7.0
