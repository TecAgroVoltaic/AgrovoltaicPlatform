"""
Tests de la herramienta de pronostico (esquema + run_forecast), sin red ni LLM.

El forecaster y la capa de datos se mockean con monkeypatch para no tocar la DB
ni la API de Anthropic; se comprueba el CONTRATO: claves del esquema y forma del
dict que run_forecast devuelve.
"""
import json
import math

import pandas as pd

from pronostico.tools import forecast_tool
from pronostico.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast

TZ = "America/Costa_Rica"


def test_schema_claves():
    assert FORECAST_TOOL_SCHEMA["name"] == "forecast"
    esquema = FORECAST_TOOL_SCHEMA["input_schema"]
    props = esquema["properties"]
    assert set(props) == {"variable", "horizon_seconds", "horizonte_texto"}
    assert props["variable"]["enum"] == ["irradiancia", "humedad_suelo"]
    assert props["horizon_seconds"]["type"] == "integer"
    assert props["horizon_seconds"]["minimum"] == 60
    assert props["horizon_seconds"]["maximum"] == 21600
    assert esquema["required"] == ["variable", "horizon_seconds"]
    assert esquema["additionalProperties"] is False


def _serie_sintetica():
    idx = pd.date_range("2026-06-30 10:00", periods=13, freq="5min", tz=TZ)
    return pd.Series([500.0] * 13, index=idx, name="ghi")


def test_run_forecast_dict_de_dia(monkeypatch):
    serie = _serie_sintetica()
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: serie)
    monkeypatch.setattr(
        forecast_tool.data, "get_recent_data",
        lambda now, lb: serie[serie.index < pd.Timestamp(now)],
    )
    # cielo despejado alto (no es de noche) en cualquier instante consultado.
    monkeypatch.setattr(
        forecast_tool, "clear_sky_ghi",
        lambda times, **k: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                     index=pd.DatetimeIndex(times)),
    )
    # forecaster fijo: valor y banda conocidos.
    monkeypatch.setattr(forecast_tool, "smart_persistence",
                        lambda now, h, **k: (540.0, 410.0, 660.0))

    out = run_forecast("irradiancia", 7200)

    claves = {"variable", "unidad", "ahora", "horizonte_segundos",
              "momento_pronosticado", "valor_esperado", "banda", "contexto"}
    assert claves <= set(out)
    assert out["variable"] == "irradiancia"
    assert out["unidad"] == "W/m2"
    assert out["horizonte_segundos"] == 7200
    assert out["valor_esperado"] == 540.0
    assert set(out["banda"]) == {"bajo", "alto", "nivel"}
    assert out["banda"]["bajo"] == 410.0 and out["banda"]["alto"] == 660.0
    assert {"kt_estrella_reciente", "cielo_despejado_en_el_momento",
            "es_de_noche", "nota"} <= set(out["contexto"])
    assert out["contexto"]["es_de_noche"] is False
    # kt* reciente = 500/800 = 0.625.
    assert out["contexto"]["kt_estrella_reciente"] == 0.625
    # debe ser JSON-serializable.
    json.dumps(out, ensure_ascii=False)


def test_run_forecast_de_noche(monkeypatch):
    serie = _serie_sintetica()
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: serie)
    monkeypatch.setattr(
        forecast_tool.data, "get_recent_data",
        lambda now, lb: serie[serie.index < pd.Timestamp(now)],
    )
    # cielo despejado por debajo del umbral -> es de noche.
    monkeypatch.setattr(
        forecast_tool, "clear_sky_ghi",
        lambda times, **k: pd.Series([1.0] * len(pd.DatetimeIndex(times)),
                                     index=pd.DatetimeIndex(times)),
    )
    monkeypatch.setattr(forecast_tool, "smart_persistence",
                        lambda now, h, **k: (5.0, 0.0, 10.0))

    out = run_forecast("irradiancia", 3600)
    assert out["contexto"]["es_de_noche"] is True
    assert out["valor_esperado"] == 0.0
    assert out["banda"]["bajo"] == 0.0 and out["banda"]["alto"] == 0.0


def test_run_forecast_valida_horizonte_texto(monkeypatch):
    """La frase original (horizonte_texto) manda sobre un horizon_seconds erroneo."""
    serie = _serie_sintetica()
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: serie)
    monkeypatch.setattr(
        forecast_tool.data, "get_recent_data",
        lambda now, lb: serie[serie.index < pd.Timestamp(now)],
    )
    monkeypatch.setattr(
        forecast_tool, "clear_sky_ghi",
        lambda times, **k: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                     index=pd.DatetimeIndex(times)),
    )
    monkeypatch.setattr(forecast_tool, "smart_persistence",
                        lambda now, h, **k: (540.0, 410.0, 660.0))
    # El LLM manda 3600 (mal), pero dijo "dos horas" -> el deterministico corrige a 7200.
    out = run_forecast("irradiancia", 3600, horizonte_texto="dos horas")
    assert out["horizonte_segundos"] == 7200


def test_smart_persistence_guarda_minimo_muestras():
    """Con menos de MIN_MUESTRAS kt* utiles, no se pronostica (NaN): mejor 'no se'."""
    from pronostico.forecasters.persistence import smart_persistence
    idx = pd.date_range("2026-06-30 10:00", periods=2, freq="5min", tz=TZ)
    recientes = pd.Series([500.0, 510.0], index=idx, name="ghi")
    cs = lambda times: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                 index=pd.DatetimeIndex(times))
    pred = smart_persistence(pd.Timestamp("2026-06-30 10:15", tz=TZ), 3600,
                             get_recent=lambda now, lb: recientes, clear_sky_fn=cs)
    assert math.isnan(pred)   # 2 < MIN_MUESTRAS (3)


def test_horizonte_texto_multiple_no_pisa_al_llm():
    """Un horizonte_texto ambiguo (2 expresiones de hora) NO pisa al LLM.

    parse_horizon lanza ValueError -> _resolver_horizonte descarta el texto y
    queda el horizon_seconds del modelo (7200), en vez de sumar a 10800.
    """
    from pronostico.tools.forecast_tool import _resolver_horizonte
    assert _resolver_horizonte(7200, "una hora o dos horas") == 7200


def test_contexto_kt_none_si_muestras_insuficientes(monkeypatch):
    """Coherencia: si no hay muestras suficientes, el contexto NO reporta kt*.

    valor_esperado sera None (+ advertencia); kt_estrella_reciente debe ser None
    tambien, no un kt* calculado con 2 lecturas que el forecaster rechazo.
    """
    idx = pd.date_range("2026-06-30 11:00", periods=2, freq="5min", tz=TZ)
    dos = pd.Series([500.0, 510.0], index=idx, name="ghi")
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: dos)
    monkeypatch.setattr(forecast_tool.data, "get_recent_data", lambda now, lb: dos)
    monkeypatch.setattr(
        forecast_tool, "clear_sky_ghi",
        lambda times, **k: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                     index=pd.DatetimeIndex(times)),
    )
    # Con 2 muestras el forecaster real devuelve NaN; lo forzamos para el test.
    monkeypatch.setattr(forecast_tool, "smart_persistence",
                        lambda now, h, **k: (float("nan"),) * 3)
    out = run_forecast("irradiancia", 3600,
                       now=pd.Timestamp("2026-06-30 11:20", tz=TZ))
    assert out["valor_esperado"] is None
    assert out["contexto"]["advertencia"] is not None
    assert out["contexto"]["kt_estrella_reciente"] is None
    assert out["contexto"]["muestras_recientes"] == 2


def test_smart_persistence_usa_mediana():
    """La mediana ignora un outlier reciente; la media no."""
    from pronostico.forecasters.persistence import smart_persistence
    idx = pd.date_range("2026-06-30 10:00", periods=4, freq="5min", tz=TZ)
    # kt* = [0.5, 0.5, 0.5, 1.0] -> mediana 0.5 (la media daria 0.625).
    recientes = pd.Series([400.0, 400.0, 400.0, 800.0], index=idx, name="ghi")
    cs = lambda times: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                 index=pd.DatetimeIndex(times))
    pred = smart_persistence(pd.Timestamp("2026-06-30 10:20", tz=TZ), 3600,
                             get_recent=lambda now, lb: recientes, clear_sky_fn=cs)
    assert abs(pred - 400.0) < 1e-6   # 0.5 * 800 (la media daria 500)


# ── Humedad de suelo ─────────────────────────────────────────────────────────
def _serie_humedad():
    idx = pd.date_range("2026-06-30 10:00", periods=13, freq="5min", tz=TZ)
    return pd.Series([20000.0] * 13, index=idx, name="humedad_suelo")


def test_run_forecast_humedad_dict(monkeypatch):
    serie = _serie_humedad()
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: serie)
    monkeypatch.setattr(
        forecast_tool.data, "get_recent_data",
        lambda now, lb, var=None: serie[serie.index < pd.Timestamp(now)],
    )
    monkeypatch.setattr(forecast_tool, "humidity_persistence",
                        lambda now, h, **k: (20500.0, 20000.0, 21000.0))

    out = run_forecast("humedad_suelo", 3600)

    assert out["variable"] == "humedad_suelo"
    assert out["unidad"] == "crudo"
    assert out["horizonte_segundos"] == 3600
    assert out["valor_esperado"] == 20500.0
    assert out["banda"]["bajo"] == 20000.0 and out["banda"]["alto"] == 21000.0
    # La humedad NO usa cielo despejado: no debe haber kt* ni es_de_noche.
    assert "es_de_noche" not in out["contexto"]
    assert "kt_estrella_reciente" not in out["contexto"]
    json.dumps(out, ensure_ascii=False)


def test_run_forecast_humedad_insuficiente(monkeypatch):
    idx = pd.date_range("2026-06-30 10:00", periods=2, freq="5min", tz=TZ)
    dos = pd.Series([20000.0, 20100.0], index=idx, name="humedad_suelo")
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: dos)
    monkeypatch.setattr(forecast_tool.data, "get_recent_data",
                        lambda now, lb, var=None: dos)
    monkeypatch.setattr(forecast_tool, "humidity_persistence",
                        lambda now, h, **k: (float("nan"),) * 3)

    out = run_forecast("humedad_suelo", 3600,
                       now=pd.Timestamp("2026-06-30 10:20", tz=TZ))
    assert out["valor_esperado"] is None
    assert out["contexto"]["advertencia"] is not None
    assert out["contexto"]["muestras_recientes"] == 2


def test_run_forecast_variable_invalida():
    """Una variable fuera del catalogo -> ValueError (culpa del cliente)."""
    import pytest
    with pytest.raises(ValueError):
        run_forecast("presion", 3600)


def test_humidity_persistence_usa_mediana():
    """La mediana ignora un outlier reciente; la media no."""
    from pronostico.forecasters.humidity import humidity_persistence
    idx = pd.date_range("2026-06-30 10:00", periods=4, freq="5min", tz=TZ)
    recientes = pd.Series([20000.0, 20000.0, 20000.0, 30000.0], index=idx)
    val = humidity_persistence(pd.Timestamp("2026-06-30 10:20", tz=TZ), 3600,
                               get_recent=lambda now, lb: recientes)
    assert abs(val - 20000.0) < 1e-6   # mediana 20000 (la media daria 22500)
