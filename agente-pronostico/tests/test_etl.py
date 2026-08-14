"""
Tests del ETL — foco en la OBSERVABILIDAD del fallo, sin red ni DB real.

Regresion del 2026-08-14: con Cartago caido, la conexion a la FUENTE ocurria
fuera de todo try/except, asi que el ETL fallo cada 15 min durante 9 dias sin
dejar una sola fila en `agente_log`. Nadie se entero. Estos tests fijan que un
fallo de la fuente SIEMPRE quede registrado antes de propagarse.
Estructura Given-When-Then.
"""
import pytest

from pronostico import etl

STORE_URL_FALSA = "postgresql://store/fake"
FUENTE_URL_FALSA = "postgresql://fuente/fake"


class _CursorFalso:
    """Cursor minimo: registra los INSERT de log y responde a los SELECT."""

    def __init__(self, ejecutados):
        self._ejecutados = ejecutados

    def execute(self, sql, params=None):
        self._ejecutados.append((sql, params))
        return self

    def fetchone(self):
        return (None,)


class _ConexionStoreFalsa:
    """Store en memoria: acumula lo ejecutado para poder afirmar sobre el log."""

    def __init__(self):
        self.ejecutados: list[tuple] = []
        self.commits = 0

    def execute(self, sql, params=None):
        return _CursorFalso(self.ejecutados).execute(sql, params)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _eventos_logueados(store: _ConexionStoreFalsa) -> list[str]:
    """Los `evento` de cada INSERT INTO agente_log (params = (nivel, evento, detalle))."""
    return [p[1] for sql, p in store.ejecutados if p and "agente_log" in sql]


def _niveles_logueados(store: _ConexionStoreFalsa) -> list[str]:
    return [p[0] for sql, p in store.ejecutados if p and "agente_log" in sql]


@pytest.fixture
def entorno(monkeypatch):
    """STORE_URL definida y fuente apuntando a una URL falsa."""
    monkeypatch.setenv("STORE_URL", STORE_URL_FALSA)
    monkeypatch.setattr(etl.config, "conninfo", lambda: FUENTE_URL_FALSA)


def _conectar_fuente_caida(store: _ConexionStoreFalsa, error: Exception):
    """psycopg.connect: devuelve el store para su URL y explota para la fuente."""

    def falso(dsn, **kwargs):
        if dsn == STORE_URL_FALSA:
            return store
        raise error

    return falso


def test_fuente_caida_deja_fila_de_error_en_agente_log(entorno, monkeypatch):
    # Given: la fuente (Cartago) no responde, el store si
    store = _ConexionStoreFalsa()
    error = TimeoutError("connection timeout expired")
    monkeypatch.setattr(etl.psycopg, "connect", _conectar_fuente_caida(store, error))

    # When: corre el ETL
    with pytest.raises(TimeoutError):
        etl.run()

    # Then: quedo registrado el fallo de fuente, con nivel 'error'
    assert "fallo:fuente" in _eventos_logueados(store)
    assert "error" in _niveles_logueados(store)


def test_fuente_caida_propaga_para_que_el_timer_lo_marque_failed(entorno, monkeypatch):
    # Given: la fuente no responde
    store = _ConexionStoreFalsa()
    monkeypatch.setattr(
        etl.psycopg, "connect",
        _conectar_fuente_caida(store, TimeoutError("connection timeout expired")),
    )

    # When / Then: la excepcion NO se traga -> systemd marca la unidad failed
    with pytest.raises(TimeoutError):
        etl.run()

    # y no se registra "corrida" exitosa
    assert "corrida" not in _eventos_logueados(store)


def test_conecta_a_la_fuente_con_timeout_explicito(entorno, monkeypatch):
    # Given: se captura el kwargs con el que se conecta la fuente
    store = _ConexionStoreFalsa()
    kwargs_fuente: dict = {}

    def falso(dsn, **kwargs):
        if dsn == STORE_URL_FALSA:
            return store
        kwargs_fuente.update(kwargs)
        raise TimeoutError("boom")

    monkeypatch.setattr(etl.psycopg, "connect", falso)

    # When
    with pytest.raises(TimeoutError):
        etl.run()

    # Then: corta rapido en vez de colgarse hasta el default del sistema
    assert kwargs_fuente["connect_timeout"] == etl.CONNECT_TIMEOUT_SEG


def test_sin_store_url_falla_explicito(monkeypatch):
    # Given: STORE_URL ausente
    monkeypatch.delenv("STORE_URL", raising=False)
    monkeypatch.setattr(etl.config, "STORE_URL", None, raising=False)
    monkeypatch.setattr(etl.config, "conninfo", lambda: FUENTE_URL_FALSA)

    # When / Then: no arranca a ciegas
    with pytest.raises(SystemExit):
        etl.run()


def test_filtro_de_variables_acota_los_targets():
    # Given/When: se pide solo una variable
    solo = etl._targets(["irradiancia"])

    # Then: no se toca el resto (un --full sobre humedad son ~936k filas)
    assert [t["variable"] for t in solo] == ["irradiancia"]


def test_sin_filtro_corren_todos_los_targets():
    # Given/When/Then: el comportamiento por defecto no cambia
    assert etl._targets(None) == etl.TARGETS


def test_variable_desconocida_falla_explicito():
    # Given/When/Then: mejor cortar que "correr" sin hacer nada
    with pytest.raises(SystemExit):
        etl._targets(["irradianza"])


@pytest.mark.parametrize("argv,esperado", [
    ([], None),
    (["--full"], None),
    (["--variable", "irradiancia"], ["irradiancia"]),
    (["--variable=irradiancia"], ["irradiancia"]),
    (["--variable=irradiancia,humedad_suelo"], ["irradiancia", "humedad_suelo"]),
])
def test_parseo_del_flag_variable(argv, esperado):
    # Given/When/Then: las dos formas del flag se aceptan
    assert etl._variables_de_argv(argv) == esperado
