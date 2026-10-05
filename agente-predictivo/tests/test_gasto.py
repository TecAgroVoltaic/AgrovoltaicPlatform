"""
Tests del consumo diario en el store, sin DB real (psycopg mockeado).

Lo que fijan: que UNA consulta escriba UNA vez (el bug que se buscaba evitar era
contar dos veces al tener dos escritores sobre la misma fila), que el acumulado
que sirve `/uso` salga del store y no del JSON efimero del contenedor, que un
store caido NO tumbe el servicio ni bloquee las consultas, y que "no se cuanto
se gasto" (None) siga siendo distinguible de "no se gasto nada" (0.0).
Estructura Given-When-Then.
"""
import pytest

from predictivo import gasto, limites


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


TRAZA = {
    "modelo": "claude-haiku-4-5",
    "usage": {"requests": 3, "input_tokens": 1200, "output_tokens": 340,
              "cache_read": 900, "cache_write": 50, "web_searches": 1},
    "costo": {"usd_total": 0.0043},
}


def test_una_consulta_escribe_una_sola_fila_con_todo(monkeypatch):
    # Given: una traza completa del lazo del LLM
    registro: list = []
    _mockear(monkeypatch, _ConexionFalsa(registro=registro))

    # When
    ok = gasto.registrar_consulta(TRAZA)

    # Then: UN solo upsert. Tener dos escritores sobre la misma fila (uno para
    # el usd y otro para los tokens) era la receta para contar dos veces.
    assert ok is True
    assert len(registro) == 1
    sql, params = registro[0]
    assert "INSERT INTO uso_diario" in sql
    # dia, modelo, requests, entrada, salida, cache_r, cache_w, web, usd
    assert params[1] == "claude-haiku-4-5"
    assert params[2:] == (3, 1200, 340, 900, 50, 1, 0.0043)


def test_una_traza_sin_datos_de_uso_no_revienta(monkeypatch):
    # Given: una traza incompleta (un modo que no reporto usage)
    registro: list = []
    _mockear(monkeypatch, _ConexionFalsa(registro=registro))

    # When/Then: se registra igual la consulta, con ceros. Perder el conteo de
    # consultas por no tener tokens seria peor que registrar un cero.
    assert gasto.registrar_consulta({}) is True
    assert registro[0][1][1] == "?"          # modelo desconocido, explicito
    assert registro[0][1][-1] == 0.0


def test_un_store_caido_no_tumba_la_consulta(monkeypatch):
    # Given: el store no responde
    _mockear(monkeypatch, error=OSError("store caido"))

    # When/Then: best-effort, devuelve False en vez de propagar
    assert gasto.registrar_consulta(TRAZA) is False


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


class _ConexionAcumulado:
    """Devuelve las dos consultas de `acumulado()` en orden."""

    def __init__(self, por_modelo, por_dia):
        self._respuestas = [por_modelo, por_dia]

    def execute(self, sql, params=None):
        self._proxima = self._respuestas.pop(0)
        return self

    def fetchall(self):
        return self._proxima

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def test_el_acumulado_suma_los_modelos_y_conserva_el_desglose(monkeypatch):
    # Given: dos modelos con historia (el caso que motivo meter `modelo` en la
    # clave en vez de un JSONB)
    from datetime import date, datetime, timezone
    d = datetime(2026, 8, 14, tzinfo=timezone.utc)
    _mockear(monkeypatch, _ConexionAcumulado(
        por_modelo=[("claude-haiku-4-5", 43, 90, 120_000, 8_000, 5_000, 300, 2, 0.34, d),
                    ("claude-sonnet-5", 2, 4, 9_000, 1_000, 0, 0, 0, 0.09, d)],
        por_dia=[(date(2026, 8, 14), 1, 0.002), (date(2026, 8, 19), 44, 0.428)],
    ))

    # When
    r = gasto.acumulado()

    # Then: totales sumados, desglose intacto y procedencia explicita
    assert r["n_consultas"] == 45
    assert r["total_input_tokens"] == 129_000
    assert r["total_usd"] == 0.43
    assert set(r["por_modelo"]) == {"claude-haiku-4-5", "claude-sonnet-5"}
    assert r["por_modelo"]["claude-sonnet-5"]["n_consultas"] == 2
    assert r["por_dia"]["2026-08-19"]["usd"] == 0.428
    assert r["fuente"] == "store"


def test_el_acumulado_devuelve_none_si_el_store_no_responde(monkeypatch):
    # Given: store caido
    _mockear(monkeypatch, error=OSError("store caido"))

    # When/Then: None, para que quien llama decida si cae al espejo local
    assert gasto.acumulado() is None
