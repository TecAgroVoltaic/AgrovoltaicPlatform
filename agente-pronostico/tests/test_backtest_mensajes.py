"""
Tests del mensaje de error del backtest: distinguir "fuera del rango" de
"hueco dentro del rango".

Por que importa: la cobertura de la serie NO es continua (faltan meses enteros y
dias sueltos). El mensaje unico anterior decia siempre "el store va del X al Y",
asi que pedir un dia de un hueco INTERNO producia una explicacion que se
contradecia con el propio rango — y el LLM la repetia al usuario tal cual.
"""
import pandas as pd
import pytest

from pronostico import backtest as bt

TZ = "America/Costa_Rica"


def _serie_con_hueco():
    """Dos bloques de datos con un hueco de una semana en el medio."""
    a = pd.date_range("2026-06-01", "2026-06-13 23:00", freq="h", tz=TZ)
    b = pd.date_range("2026-06-19", "2026-06-30 23:00", freq="h", tz=TZ)
    idx = a.append(b)
    return pd.Series(range(len(idx)), index=idx, dtype=float, name="irradiancia")


def _usar(monkeypatch, serie):
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: serie)


def test_fecha_posterior_al_rango_dice_fuera_de_rango(monkeypatch):
    _usar(monkeypatch, _serie_con_hueco())
    with pytest.raises(ValueError) as e:
        bt.backtest("irradiancia", desde="2026-08-15")
    assert "FUERA del rango" in str(e.value)


def test_fecha_en_un_hueco_lo_dice_y_sugiere_dias_cercanos(monkeypatch):
    _usar(monkeypatch, _serie_con_hueco())
    with pytest.raises(ValueError) as e:
        bt.backtest("irradiancia", desde="2026-06-15")
    msg = str(e.value)
    # No puede decir que esta fuera del rango: el 15 de junio SI esta dentro.
    assert "FUERA del rango" not in msg
    assert "HUECO" in msg
    # Y tiene que ofrecer una salida: los dias con datos a cada lado.
    assert "2026-06-13" in msg and "2026-06-19" in msg


def test_mensaje_avisa_que_la_cobertura_no_es_continua(monkeypatch):
    _usar(monkeypatch, _serie_con_hueco())
    with pytest.raises(ValueError) as e:
        bt.backtest("irradiancia", desde="2026-06-15")
    assert "NO es continua" in str(e.value)


# ── La salida tiene que llevar los NUMEROS, no solo metricas ────────────────
# El LLM no ve el grafico (se le quita por tokens). Si la salida solo trae
# agregados, describe la curva de memoria: se le observo inventar picos de
# 600-700 W/m2 en un dia cuyo maximo real fue 358.

def _serie_dia():
    idx = pd.date_range("2026-07-22 00:00", "2026-07-22 23:00", freq="h", tz=TZ)
    valores = [0.0] * 6 + [50.0, 150.0, 250.0, 350.0, 300.0, 200.0,
                           180.0, 120.0, 90.0, 40.0] + [0.0] * 8
    return pd.Series(valores, index=idx, dtype=float, name="irradiancia")


def test_la_salida_trae_la_serie_hora_a_hora(monkeypatch):
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    out = backtest_tool.run("irradiancia", desde="2026-07-22")
    assert out["serie"], "un dia entero cabe de sobra: tiene que viajar la serie"
    assert {"t", "real", "reconstruido"} <= set(out["serie"][0])
    # Y el maximo real, que es lo que el LLM tiende a estimar a ojo.
    assert out["resumen"]["maximo_real"]["valor"] == 350.0


def test_hora_concreta_devuelve_ese_punto(monkeypatch):
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    out = backtest_tool.run("irradiancia", desde="2026-07-22", hora="12:00")
    punto = out["punto_consultado"]
    assert punto is not None and punto["t"] == "12:00"
    assert punto["real"] == 180.0                       # 7.º valor no nulo de la serie
    assert punto["error"] == round(punto["reconstruido"] - punto["real"], 2)


def test_hora_inexistente_avisa_en_vez_de_devolver_nada(monkeypatch):
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    out = backtest_tool.run("irradiancia", desde="2026-07-22", hora="99:00")
    assert out["punto_consultado"] is None
    assert "no hay dato para las 99:00" in out["resumen"]["aviso_hora"]
