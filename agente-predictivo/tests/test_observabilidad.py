"""
Tests del panel operativo — composición, sin DB real.

Lo que fijan: que el panel siga siendo útil aunque partes del store fallen (un
panel de salud que se cae cuando algo anda mal no sirve para nada), que diga de
QUÉ fuente salen los datos —desde el 2026-08-14 una réplica de un dump, no la
base viva—, que distinga "no se gastó nada" de "no se pudo medir el gasto", y
que nada de eso arrastre credenciales. Estructura Given-When-Then.
"""
import json
from datetime import datetime, timezone

import pytest

from predictivo import config, observabilidad, salud

AHORA = datetime.now(timezone.utc)
CLAVE_DEL_STORE = "clave-del-store"
DSN_FALSO = f"postgresql://postgres:{CLAVE_DEL_STORE}@127.0.0.1:5433/agrodash_control"

INGESTA_OK = {
    "estado": salud.ESTADO_OK,
    "variables": {"irradiancia": {"edad_horas": 0.2, "estado": salud.ESTADO_OK}},
}
INGESTA_STALE = {
    "estado": salud.ESTADO_STALE,
    "variables": {"irradiancia": {"edad_horas": 541.7, "estado": salud.ESTADO_STALE}},
    "congelamiento": {"congelada": True, "desde": "2026-07-23T08:31:22+00:00",
                      "dias": 27.5},
}


class _ConexionFalsa:
    def __init__(self, errores=(), prediccion=None):
        self._errores = list(errores)
        self._prediccion = prediccion

    def execute(self, sql, params=None):
        # DISTINCT ON devuelve (componente, ts, ...) — el orden lo fija el SQL,
        # asi que el doble tiene que respetarlo para que el test sea honesto.
        self._por_componente = "DISTINCT ON" in sql
        return self

    def __iter__(self):
        if getattr(self, "_por_componente", False):
            return iter([(comp, ts, ev, err) for ts, comp, ev, err in self._errores])
        return iter(self._errores)

    def fetchone(self):
        return self._prediccion

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@pytest.fixture
def store_ok(monkeypatch):
    monkeypatch.setattr(config, "store_conninfo", lambda: DSN_FALSO)
    monkeypatch.setattr(config, "conninfo", lambda: DSN_FALSO)
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
    assert p["ultimos_errores_por_componente"]["etl"]["evento"] == "fallo:fuente"
    assert p["presupuesto"]["gastado_hoy_usd"] == 0.0043
    assert p["ultima_prediccion"]["variable"] == "irradiancia"
    assert p["limites"]["llm_por_min"] > 0


def test_el_panel_dice_que_los_datos_salen_de_una_replica_de_dump(monkeypatch, store_ok):
    # Given: la fuente configurada es la replica local (lo que corre desde el 14-ago)
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_STALE)
    _mock_conexion(monkeypatch, _ConexionFalsa())

    # When
    p = observabilidad.panel()

    # Then: es lo primero que se puede leer, sin tener que deducirlo del resto
    assert p["fuente"]["es_snapshot"] is True
    assert p["fuente"]["puerto"] == 5433
    assert p["ingesta"]["congelamiento"]["dias"] == 27.5
    assert p["store"]["host"] is not None


def test_el_panel_no_filtra_credenciales(monkeypatch, store_ok):
    # Given: fuente y store configurados con clave en la URL
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)
    _mock_conexion(monkeypatch, _ConexionFalsa())

    # When: el panel entero, tal cual viaja al cliente
    payload = json.dumps(observabilidad.panel(), default=str)

    # Then
    assert CLAVE_DEL_STORE not in payload
    assert DSN_FALSO not in payload


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


def test_el_panel_responde_aunque_el_store_este_caido(monkeypatch, store_ok):
    # Given: el store no contesta NI para la salud de ingesta
    def explota(*a, **k):
        raise OSError("store caido")
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", explota)
    monkeypatch.setattr(observabilidad.psycopg, "connect", explota)

    # When
    p = observabilidad.panel()

    # Then: el bloque roto se reporta como tal y lo que no depende del store
    # (de dónde se lee, qué límites rigen) sigue siendo visible y cierto
    assert p["estado"] == salud.ESTADO_DESCONOCIDO
    assert "OSError" in p["ingesta"]["error"]
    assert p["fuente"]["tipo"] == observabilidad.fuente.TIPO_REPLICA_DUMP
    assert p["limites"]["llm_por_min"] > 0


def test_distingue_gasto_cero_de_gasto_no_medido(monkeypatch, store_ok):
    # Given: el store no pudo informar el gasto
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)
    monkeypatch.setattr(observabilidad.gasto, "usd_hoy", lambda: None)
    _mock_conexion(monkeypatch, _ConexionFalsa())

    # When
    p = observabilidad.panel()

    # Then: `medido` avisa que ese número no es confiable
    assert p["presupuesto"]["medido"] is False


def test_un_fallo_midiendo_el_gasto_no_tumba_el_panel(monkeypatch, store_ok):
    # Given: el acumulado local esta ilegible (PermissionError en el contenedor)
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)

    def explota(*a, **k):
        raise PermissionError("uso.json ilegible")
    monkeypatch.setattr(observabilidad.limites, "presupuesto_agotado", explota)
    _mock_conexion(monkeypatch, _ConexionFalsa())

    # When
    p = observabilidad.panel()

    # Then: conserva la forma del bloque (el panel no tiene que adivinar) y
    # marca el número como no medido
    assert p["presupuesto"]["medido"] is False
    assert p["presupuesto"]["gastado_hoy_usd"] is None
    assert p["estado"] == salud.ESTADO_OK


def test_sin_errores_ni_predicciones_no_rompe(monkeypatch, store_ok):
    # Given: sistema nuevo, tablas vacías
    monkeypatch.setattr(observabilidad.salud, "estado_ingesta", lambda: INGESTA_OK)
    _mock_conexion(monkeypatch, _ConexionFalsa(errores=[], prediccion=None))

    # When
    p = observabilidad.panel()

    # Then
    assert p["errores_recientes"] == [] and p["ultima_prediccion"] is None
