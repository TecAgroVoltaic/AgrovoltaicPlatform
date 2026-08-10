"""Tests del detector de anomalias (sin red ni DB). `data.cargar_serie` mockeado."""
import pandas as pd
import pytest

from pronostico import anomalias

TZ = "America/Costa_Rica"


def _serie(vals, freq="5min", start="2026-06-30 08:00"):
    idx = pd.date_range(start, periods=len(vals), freq=freq, tz=TZ)
    return pd.Series([float(v) for v in vals], index=idx)


def _mock(monkeypatch, serie):
    monkeypatch.setattr(anomalias.data, "cargar_serie", lambda *a, **k: serie)


def test_humedad_normal(monkeypatch):
    serie = _serie([20000 + (i % 11) * 20 for i in range(60)])
    _mock(monkeypatch, serie)
    out = anomalias.detectar("humedad_suelo", 1440, now=serie.index.max())
    assert out["estado"] == "normal"
    assert out["anomalias"] == []
    assert out["senal"] == "crudo"
    assert out["frescura_seg"] == 0


def test_humedad_outlier(monkeypatch):
    vals = [20000 + (i % 11) * 20 for i in range(40)]
    vals[20] = 60000    # pico atipico
    serie = _serie(vals)
    _mock(monkeypatch, serie)
    out = anomalias.detectar("humedad_suelo", 1440, now=serie.index.max())
    assert out["estado"] == "anomalias_detectadas"
    assert any(a["tipo"] == "outlier" for a in out["anomalias"])


def test_sin_datos_recientes(monkeypatch):
    """El caso SC: la ultima lectura es vieja (outage)."""
    serie = _serie([20000 + (i % 11) * 20 for i in range(40)])
    _mock(monkeypatch, serie)
    now = serie.index.max() + pd.Timedelta(days=3)
    out = anomalias.detectar("humedad_suelo", 1440, now=now)
    assert out["estado"] == "sin_datos_recientes"
    assert out["frescura_seg"] > 3600


def test_sensor_plano(monkeypatch):
    serie = _serie([22448.0] * 40)      # valor pegado, fresco
    _mock(monkeypatch, serie)
    out = anomalias.detectar("humedad_suelo", 1440, now=serie.index.max())
    assert out["estado"] == "sensor_plano"
    assert out["serie_plana"] is True


def test_fuera_de_rango(monkeypatch):
    vals = [20000 + (i % 5) * 10 for i in range(30)] + [70000]   # >65535
    serie = _serie(vals)
    _mock(monkeypatch, serie)
    out = anomalias.detectar("humedad_suelo", 1440, now=serie.index.max())
    assert any(a["tipo"] == "fuera_de_rango" for a in out["anomalias"])


def test_variable_invalida():
    with pytest.raises(ValueError):
        anomalias.detectar("presion", 1440)


def test_irradiancia_usa_kt(monkeypatch):
    serie = _serie([400 + (i % 7) * 20 for i in range(40)])
    _mock(monkeypatch, serie)
    monkeypatch.setattr(
        anomalias, "clear_sky_ghi",
        lambda times, **k: pd.Series(800.0, index=pd.DatetimeIndex(times)),
    )
    out = anomalias.detectar("irradiancia", 1440, now=serie.index.max())
    assert out["senal"] == "kt*"
    assert out["estado"] == "normal"
