"""
Tests del estado del ETL leido de `agente_log` — sin DB real.

Fijan la distincion que el panel necesita para no mentir: "el ETL corrio" no es
"la ingesta funciona". Con la fuente apuntando a una replica de un dump, cada
corrida termina OK con 0 filas insertadas; y cuando la fuente se cae, el ETL ni
llega a registrar la corrida, asi que la ultima corrida "verde" puede ser vieja.
Estructura Given-When-Then.
"""
from datetime import datetime, timedelta, timezone

from pronostico import etl_estado

AHORA = datetime.now(timezone.utc)
HACE_UN_RATO = AHORA - timedelta(minutes=5)

DETALLE_SIN_FILAS = {
    "seg": 0.3, "full": False, "backfill_since": "2026-05-01",
    "resumen": {"irradiancia": {"leidas": 0, "insertadas": 0},
                "humedad_suelo": {"leidas": 0, "insertadas": 0}},
}
DETALLE_CON_FALLO = {
    "seg": 12.4, "full": True, "backfill_since": "2025-11-01",
    "resumen": {"irradiancia": {"leidas": 900, "insertadas": 120},
                "humedad_suelo": {"error": "statement timeout"}},
}


class _ConexionFalsa:
    """Responde la corrida o el error segun el SQL que se ejecute."""

    def __init__(self, corrida=None, error=None):
        self._corrida = corrida
        self._error = error

    def execute(self, sql, params=None):
        return _Resultado(self._error if "nivel = 'error'" in sql else self._corrida)


class _Resultado:
    def __init__(self, fila):
        self._fila = fila

    def fetchone(self):
        return self._fila


def test_una_corrida_verde_sin_filas_se_ve_como_tal():
    # Given: el ETL corrio contra la replica del dump (no hay datos nuevos)
    conn = _ConexionFalsa(corrida=(HACE_UN_RATO, DETALLE_SIN_FILAS))

    # When
    estado = etl_estado.estado(conn, AHORA)

    # Then: termino bien PERO no ingirio nada; el panel puede decir las dos cosas
    assert estado["ultima_corrida"]["ok"] is True
    assert estado["ultima_corrida"]["filas_insertadas"] == 0
    assert estado["ultima_corrida"]["duracion_seg"] == 0.3
    assert estado["ultima_corrida"]["backfill_desde"] == "2026-05-01"
    assert estado["fallando"] is False


def test_un_target_caido_no_se_reporta_como_corrida_ok():
    # Given: la humedad fallo por timeout y la irradiancia si entro
    conn = _ConexionFalsa(corrida=(HACE_UN_RATO, DETALLE_CON_FALLO))

    # When
    corrida = etl_estado.estado(conn, AHORA)["ultima_corrida"]

    # Then: el total suma solo lo que se pudo medir y el fallo queda atribuido
    assert corrida["ok"] is False
    assert corrida["filas_insertadas"] == 120
    assert corrida["por_variable"]["humedad_suelo"]["error"] == "statement timeout"


def test_un_error_posterior_a_la_corrida_significa_que_esta_fallando():
    # Given: la ultima corrida es vieja y despues solo hubo errores (fuente caida:
    # el ETL revienta antes de poder registrar la corrida)
    conn = _ConexionFalsa(
        corrida=(AHORA - timedelta(days=9), DETALLE_SIN_FILAS),
        error=(AHORA - timedelta(minutes=2), "fallo:fuente", "connection refused"),
    )

    # When
    estado = etl_estado.estado(conn, AHORA)

    # Then: el caso exacto que estuvo 9 dias invisible en 2026-08-14
    assert estado["fallando"] is True
    assert estado["ultimo_error"]["evento"] == "fallo:fuente"
    assert estado["ultimo_error"]["edad_horas"] < 1


def test_un_error_anterior_a_la_ultima_corrida_es_historia():
    # Given: fallo hace 5 dias, pero desde entonces corrio bien
    conn = _ConexionFalsa(
        corrida=(HACE_UN_RATO, DETALLE_SIN_FILAS),
        error=(AHORA - timedelta(days=5), "fallo:fuente", "connection refused"),
    )

    # When/Then: se sigue mostrando, pero no se acusa de estar roto ahora
    estado = etl_estado.estado(conn, AHORA)
    assert estado["fallando"] is False
    assert estado["ultimo_error"] is not None


def test_sin_corridas_registradas_no_afirma_nada():
    # Given: sistema nuevo, el ETL nunca corrio
    conn = _ConexionFalsa()

    # When
    estado = etl_estado.estado(conn, AHORA)

    # Then: None = "no se sabe", distinto de False = "no esta fallando"
    assert estado["fallando"] is None
    assert estado["ultima_corrida"]["ts"] is None
    assert estado["ultima_corrida"]["filas_insertadas"] is None
    assert estado["ultimo_error"] is None
