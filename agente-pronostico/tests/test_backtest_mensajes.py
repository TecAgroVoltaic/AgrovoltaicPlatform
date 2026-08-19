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
