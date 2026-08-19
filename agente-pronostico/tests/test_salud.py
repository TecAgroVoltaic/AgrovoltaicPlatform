"""
Tests de la salud de ingesta — sin DB real (la conexion se mockea).

Fijan la regla que faltaba el 2026-08-14: una ingesta congelada tiene que
reportarse como `stale`, no como "todo ok". Y la que faltaba el 2026-08-19: hay
que poder decir DESDE CUANDO esta congelada, porque con la fuente apuntando a un
dump el ETL corre verde para siempre. Estructura Given-When-Then.
"""
from datetime import datetime, timedelta, timezone

import pytest

from pronostico import salud

UMBRAL_H = 6.0
AHORA = datetime.now(timezone.utc)

# Forma real del `detalle` que escribe `etl.run` al terminar una corrida.
CORRIDA_SIN_FILAS = {
    "seg": 0.3, "full": False, "backfill_since": "2026-05-01",
    "resumen": {"irradiancia": {"leidas": 0, "insertadas": 0},
                "humedad_suelo": {"leidas": 0, "insertadas": 0}},
}


class _ConexionFalsa:
    """Devuelve filas fijas segun que SQL se ejecute.

    La frescura son ahora DOS consultas: el ultimo dato por variable (indice) y
    el conteo (cacheado). `frescura` se sigue pasando como (variable, ts, filas)
    y aca se parte, para no reescribir cada caso de prueba.
    """

    def __init__(self, frescura, ultimo_error=None, ultima_corrida=None):
        self._frescura = frescura
        self._ultimo_error = ultimo_error
        self._ultima_corrida = ultima_corrida
        self.consultas: list[str] = []

    def execute(self, sql, params=None):
        self.consultas.append(sql)
        if "max(ts)" in sql:
            return iter([(v, ts) for v, ts, _ in self._frescura])
        if "count(*)" in sql:
            return iter([(v, n) for v, _, n in self._frescura])
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
    salud.reiniciar_cache_filas()            # cache de proceso: que no cruce pruebas
    monkeypatch.setattr(salud.config, "store_conninfo", lambda: "postgresql://fake")
    monkeypatch.setattr(salud.psycopg, "connect", lambda *a, **k: conexion)


def test_ingesta_fresca_reporta_ok(monkeypatch):
    # Given: ambas variables con datos de hace 10 minutos
    reciente = AHORA - timedelta(minutes=10)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 100), ("humedad_suelo", reciente, 200)],
        ultima_corrida=(reciente, CORRIDA_SIN_FILAS),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then
    assert reporte["estado"] == salud.ESTADO_OK
    assert reporte["variables"]["irradiancia"]["estado"] == salud.ESTADO_OK
    assert reporte["congelamiento"]["congelada"] is False


def test_ingesta_congelada_reporta_stale(monkeypatch):
    # Given: el ultimo dato es de hace 22 dias (el caso real del outage SC)
    viejo = AHORA - timedelta(days=22)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", viejo, 118386), ("humedad_suelo", viejo, 693930)],
        ultima_corrida=(AHORA, CORRIDA_SIN_FILAS),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: no puede decir "ok" solo porque el ETL corrio sin error
    assert reporte["estado"] == salud.ESTADO_STALE
    assert reporte["variables"]["irradiancia"]["edad_horas"] > 500


def test_congelamiento_dice_desde_cuando_y_cuantos_dias(monkeypatch):
    # Given: la irradiancia se corto 1 h despues que la humedad
    corte_humedad = AHORA - timedelta(days=27, hours=1)
    corte_irradiancia = AHORA - timedelta(days=27)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", corte_irradiancia, 191676),
                  ("humedad_suelo", corte_humedad, 693930)],
        ultima_corrida=(AHORA, CORRIDA_SIN_FILAS),
    ))

    # When
    congelamiento = salud.estado_ingesta(UMBRAL_H)["congelamiento"]

    # Then: el corte es el dato MAS RECIENTE del sistema (despues de eso no
    # entro nada), y los dias son la unidad en la que se vive el problema
    assert congelamiento["congelada"] is True
    assert congelamiento["desde"] == corte_irradiancia.isoformat()
    assert congelamiento["dias"] == 27.0


def test_variable_sin_ninguna_fila_reporta_sin_datos(monkeypatch):
    # Given: irradiancia tiene datos, humedad_suelo no aparece en el store
    reciente = AHORA - timedelta(minutes=5)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 10)],
        ultima_corrida=(reciente, CORRIDA_SIN_FILAS),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: el estado global toma el PEOR de las variables
    assert reporte["variables"]["humedad_suelo"]["estado"] == salud.ESTADO_SIN_DATOS
    assert reporte["estado"] == salud.ESTADO_SIN_DATOS


def test_store_vacio_no_inventa_una_fecha_de_corte(monkeypatch):
    # Given: ninguna variable tiene una sola fila (store recien creado)
    _mockear(monkeypatch, _ConexionFalsa(frescura=[], ultima_corrida=None))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: "congelada" sin fecha, en vez de un instante inventado
    assert reporte["congelamiento"] == {"congelada": True, "desde": None, "dias": None}


def test_expone_el_ultimo_error_del_etl(monkeypatch):
    # Given: hay un fallo de fuente registrado
    reciente = AHORA - timedelta(minutes=5)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 10), ("humedad_suelo", reciente, 10)],
        ultimo_error=(AHORA, "fallo:fuente", "connection timeout expired"),
        ultima_corrida=(reciente, CORRIDA_SIN_FILAS),
    ))

    # When
    reporte = salud.estado_ingesta(UMBRAL_H)

    # Then: quien consulte la salud ve el error sin entrar a la DB, y ve que es
    # POSTERIOR a la ultima corrida (o sea: el ETL esta fallando ahora)
    assert reporte["ultimo_error_etl"]["evento"] == "fallo:fuente"
    assert "timeout" in reporte["ultimo_error_etl"]["error"]
    assert reporte["etl_fallando"] is True


def test_la_corrida_del_etl_muestra_cuantas_filas_trajo(monkeypatch):
    # Given: el ETL acaba de correr contra la replica del dump (0 filas nuevas)
    reciente = AHORA - timedelta(minutes=5)
    _mockear(monkeypatch, _ConexionFalsa(
        frescura=[("irradiancia", reciente, 10), ("humedad_suelo", reciente, 10)],
        ultima_corrida=(AHORA, CORRIDA_SIN_FILAS),
    ))

    # When
    corrida = salud.estado_ingesta(UMBRAL_H)["ultima_corrida_etl"]

    # Then: "corrio bien" y "trajo datos" son cosas distintas y ambas visibles
    assert corrida["ok"] is True
    assert corrida["filas_insertadas"] == 0
    assert corrida["edad_horas"] is not None


@pytest.mark.parametrize("edad_h,esperado", [
    (0.0, salud.ESTADO_OK),
    (UMBRAL_H, salud.ESTADO_OK),           # el umbral es inclusivo
    (UMBRAL_H + 0.1, salud.ESTADO_STALE),
    (None, salud.ESTADO_SIN_DATOS),
])
def test_frontera_del_umbral(edad_h, esperado):
    # Given/When/Then: la frontera exacta no queda librada a interpretacion
    assert salud._estado(edad_h, UMBRAL_H) == esperado


def test_el_conteo_de_filas_se_cachea_y_el_ultimo_dato_no(monkeypatch):
    # Given: una conexion que registra cada SQL que se le pide
    conexion = _ConexionFalsa(frescura=[("irradiancia", AHORA, 191676),
                                        ("humedad_suelo", AHORA, 693930)],
                              ultima_corrida=(AHORA, CORRIDA_SIN_FILAS))
    _mockear(monkeypatch, conexion)

    # When: dos consultas seguidas del estado
    salud.estado_ingesta()
    conexion.consultas.clear()
    salud.estado_ingesta()

    # Then: el ultimo dato se vuelve a pedir (decide el estado, tiene que estar
    # fresco); el conteo no (recorre la tabla entera y solo cambia si el ETL
    # inserto, cosa que pasa cada ~6 min)
    assert any("max(ts)" in q for q in conexion.consultas)
    assert not any("count(*)" in q for q in conexion.consultas)


def test_el_conteo_cacheado_no_pierde_el_valor(monkeypatch):
    # Given/When: segunda lectura, ya con el cache caliente
    conexion = _ConexionFalsa(frescura=[("irradiancia", AHORA, 191676),
                                        ("humedad_suelo", AHORA, 693930)],
                              ultima_corrida=(AHORA, CORRIDA_SIN_FILAS))
    _mockear(monkeypatch, conexion)
    salud.estado_ingesta()
    r = salud.estado_ingesta()

    # Then: sigue reportando el numero, no un cero
    assert r["variables"]["irradiancia"]["filas"] == 191676
