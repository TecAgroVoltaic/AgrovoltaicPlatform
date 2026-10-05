"""
Tests de la herramienta de pronostico (esquema + run_forecast), sin red ni LLM.

El forecaster y la capa de datos se mockean con monkeypatch para no tocar la DB
ni la API de Anthropic; se comprueba el CONTRATO: claves del esquema y forma del
dict que run_forecast devuelve.
"""
import json
import math

import pandas as pd
import pytest

from predictivo.tools import forecast_tool
from predictivo.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast

TZ = "America/Costa_Rica"


def _mock_forecaster(monkeypatch, valor, bajo, alto, kt_reciente=0.625, n=12):
    """Fija la salida del forecaster fisico para probar el CONTRATO de la tool.

    La tool ya no llama a `smart_persistence` sino a `pronostico_detallado`, que
    devuelve el numero JUNTO con su explicacion. Se mockea entero a proposito: una
    sola fuente para el valor y para lo que se dice de el, que era el punto del
    cambio (antes el contexto se recalculaba aparte y podia describir otra cosa).
    """
    monkeypatch.setattr(forecast_tool, "pronostico_detallado",
                        lambda now, h, **k: {
                            "valor": valor, "bajo": bajo, "alto": alto,
                            "origen_banda": "cuantiles-historicos", "n": n,
                            "peso": 0.52, "kt_persistido": 0.5, "centro": -0.02,
                            "kt_reciente": kt_reciente,
                            "kt_tipico_ahora": 0.48, "kt_tipico_objetivo": 0.44,
                        })


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
    # forecaster fijo: valor, banda y explicacion conocidos.
    _mock_forecaster(monkeypatch, valor=540.0, bajo=410.0, alto=660.0, kt_reciente=0.625)

    out = run_forecast("irradiancia", 7200)

    claves = {"variable", "unidad", "ahora", "horizonte_segundos",
              "momento_pronosticado", "valor_esperado", "banda", "contexto"}
    assert claves <= set(out)
    assert out["variable"] == "irradiancia"
    assert out["unidad"] == "W/m2"
    assert out["horizonte_segundos"] == 7200
    assert out["valor_esperado"] == 540.0
    assert set(out["banda"]) == {"bajo", "alto", "nivel", "origen"}
    assert out["banda"]["bajo"] == 410.0 and out["banda"]["alto"] == 660.0
    assert {"pct_del_techo_reciente", "pct_del_techo_tipico_en_el_objetivo",
            "peso_de_lo_reciente", "cielo_despejado_en_el_momento",
            "es_de_noche", "nota"} <= set(out["contexto"])
    assert out["contexto"]["es_de_noche"] is False
    # En PORCENTAJE del techo, que no se puede leer al reves: 0.625 -> 62.5 %.
    assert out["contexto"]["pct_del_techo_reciente"] == 62.5
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
    _mock_forecaster(monkeypatch, valor=5.0, bajo=0.0, alto=10.0)

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
    _mock_forecaster(monkeypatch, valor=540.0, bajo=410.0, alto=660.0)
    # El LLM manda 3600 (mal), pero dijo "dos horas" -> el deterministico corrige a 7200.
    out = run_forecast("irradiancia", 3600, horizonte_texto="dos horas")
    assert out["horizonte_segundos"] == 7200


def test_smart_persistence_guarda_minimo_muestras():
    """Con menos de MIN_MUESTRAS kt* utiles, no se pronostica (NaN): mejor 'no se'."""
    from predictivo.forecasters.persistence import smart_persistence
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
    from predictivo.tools.forecast_tool import _resolver_horizonte
    assert _resolver_horizonte(7200, "una hora o dos horas") == 7200


def test_contexto_kt_none_si_muestras_insuficientes(monkeypatch):
    """Coherencia: si no hay muestras suficientes, el contexto NO reporta kt*.

    valor_esperado sera None (+ advertencia)
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
    _mock_forecaster(monkeypatch, valor=float("nan"), bajo=float("nan"),
                     alto=float("nan"), n=2)
    out = run_forecast("irradiancia", 3600,
                       now=pd.Timestamp("2026-06-30 11:20", tz=TZ))
    assert out["valor_esperado"] is None
    assert out["contexto"]["advertencia"] is not None
    assert out["contexto"]["muestras_recientes"] == 2


# ── Perillas del resumen de la ventana ───────────────────────────────────────
# Se aisla el estimador del sitio: `clima_fn` devuelve un tipico FIJO y `peso=1`
# apaga la contraccion, asi lo unico que queda a prueba es como se resume la
# ventana. Sin esa inyeccion la prueba dependeria de la climatologia real del
# parquet, que cambia cuando entran datos.
_SIN_CLIMA = lambda *a, **k: 0.5
# Acepta **k porque se usa en los dos lugares: como `clear_sky_fn` (solo `times`)
# y en lugar de `clear_sky_ghi`, que recibe la geografia del sitio.
_CS_PLANO = lambda times, **k: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                         index=pd.DatetimeIndex(times))


def _predecir(estadistico):
    from predictivo.forecasters.persistence import smart_persistence
    idx = pd.date_range("2026-06-30 10:00", periods=4, freq="5min", tz=TZ)
    # kt* = [0.5, 0.5, 0.5, 1.0]: mediana 0.5, media 0.625, ultimo 1.0.
    recientes = pd.Series([400.0, 400.0, 400.0, 800.0], index=idx, name="ghi")
    return smart_persistence(pd.Timestamp("2026-06-30 10:20", tz=TZ), 3600,
                             get_recent=lambda now, lb: recientes,
                             clear_sky_fn=_CS_PLANO, estadistico=estadistico,
                             peso=1.0, clima_fn=_SIN_CLIMA, centrar=False)


def test_estadistico_mediana_ignora_el_outlier():
    # Given/When/Then: 0.5 x 800. La media daria 500.
    assert abs(_predecir("mediana") - 400.0) < 1e-6


def test_estadistico_media_incorpora_el_outlier():
    # Given/When/Then: 0.625 x 800
    assert abs(_predecir("media") - 500.0) < 1e-6


def test_estadistico_ultimo_es_el_mas_reactivo():
    # Given/When/Then: 1.0 x 800
    assert abs(_predecir("ultimo") - 800.0) < 1e-6


def test_el_default_es_ewma_y_pesa_lo_reciente():
    """El default cambio de 'mediana de 60 min' a EWMA, y no es cosmetico.

    La mediana de una hora coloca la estimacion ~30 min en el pasado; a horizontes
    cortos eso casi duplica el rezago efectivo (RMSE a 30 min: 169 -> 155 W/m2
    medido sobre 78 dias). La EWMA queda ENTRE la mediana y el ultimo: sigue el
    cambio sin colgarse de una sola lectura.
    """
    ewma = _predecir("ewma")
    assert _predecir("mediana") < ewma < _predecir("ultimo")


def test_estadistico_invalido_falla_explicito():
    with pytest.raises(ValueError, match="estadistico invalido"):
        _predecir("promedio_movil_exponencial_ponderado")


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
    assert "pct_del_techo_reciente" not in out["contexto"]
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
    from predictivo.forecasters.humidity import humidity_persistence
    idx = pd.date_range("2026-06-30 10:00", periods=4, freq="5min", tz=TZ)
    recientes = pd.Series([20000.0, 20000.0, 20000.0, 30000.0], index=idx)
    val = humidity_persistence(pd.Timestamp("2026-06-30 10:20", tz=TZ), 3600,
                               get_recent=lambda now, lb: recientes)
    assert abs(val - 20000.0) < 1e-6   # mediana 20000 (la media daria 22500)


# ── Instante de referencia (anclar el pronostico en un momento historico) ────
# Con la ingesta congelada, el ultimo dato cae de madrugada y la irradiancia
# pronosticada es 0 siempre. Anclar en un instante de dia devuelve un numero
# real SIN mirar el futuro: la barrera de get_recent_data (`< now`) sigue valiendo.

def _serie_larga():
    """3 h de lecturas cada 5 min: permite anclar en el medio y comparar."""
    idx = pd.date_range("2026-07-22 08:00", periods=37, freq="5min", tz=TZ)
    return pd.Series([400.0 + 10 * i for i in range(37)], index=idx, name="ghi")


def _mock_dia(monkeypatch, serie):
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: serie)
    monkeypatch.setattr(
        forecast_tool.data, "get_recent_data",
        lambda now, lb, *a: serie[serie.index < pd.Timestamp(now)],
    )
    monkeypatch.setattr(
        forecast_tool, "clear_sky_ghi",
        lambda times, **k: pd.Series([800.0] * len(pd.DatetimeIndex(times)),
                                     index=pd.DatetimeIndex(times)),
    )
    _mock_forecaster(monkeypatch, valor=540.0, bajo=410.0, alto=660.0)


def _mock_dia_sin_mockear_el_forecaster(monkeypatch, serie):
    """Igual que `_mock_dia` pero deja correr el forecaster DE VERDAD.

    Hace falta para la prueba anti-fuga: si el numero viniera de un mock, no habria
    testigo sensible y el test pasaria aunque el futuro se colara. Se inyectan el
    cielo despejado y la climatologia (constantes) y `peso=1` para que el unico
    insumo variable sea la ventana de datos.
    """
    from predictivo.forecasters import persistence
    monkeypatch.setattr(forecast_tool.data, "cargar_serie", lambda *a, **k: serie)
    monkeypatch.setattr(
        forecast_tool.data, "get_recent_data",
        lambda now, lb, *a: serie[serie.index < pd.Timestamp(now)],
    )
    monkeypatch.setattr(forecast_tool, "clear_sky_ghi", _CS_PLANO)
    real = persistence.pronostico_detallado
    monkeypatch.setattr(
        forecast_tool, "pronostico_detallado",
        lambda now, h, **k: real(now, h, clear_sky_fn=_CS_PLANO, clima_fn=_SIN_CLIMA,
                                 peso=1.0, con_banda=False, centrar=False, **k))


def test_ancla_por_defecto_es_el_ultimo_dato(monkeypatch):
    serie = _serie_larga()
    _mock_dia(monkeypatch, serie)
    out = run_forecast("irradiancia", 3600)
    assert out["ancla"]["tipo"] == "ultimo_dato"
    assert out["ancla"]["explicito"] is False
    assert out["ahora"] == serie.index.max().isoformat()
    # El momento pronosticado cae despues del ultimo dato -> no hay con que comparar.
    assert out["medido"] is None


def test_ancla_explicita_pronostica_desde_ese_instante(monkeypatch):
    serie = _serie_larga()
    _mock_dia(monkeypatch, serie)
    ancla = "2026-07-22 09:00"
    out = run_forecast("irradiancia", 3600, now=ancla)

    assert out["ancla"]["tipo"] == "instante_de_referencia"
    assert out["ancla"]["explicito"] is True
    assert out["ahora"].startswith("2026-07-22T09:00")
    assert out["momento_pronosticado"].startswith("2026-07-22T10:00")
    assert out["valor_esperado"] == 540.0
    # El rango disponible viaja en la respuesta: quien ancla puede validar su eleccion.
    assert out["ancla"]["rango_datos"]["desde"].startswith("2026-07-22T08:00")


def test_ancla_explicita_trae_lo_que_midio_el_sensor(monkeypatch):
    """El valor real del momento pronosticado se adjunta DESPUES: no es fuga,
    el forecaster nunca lo vio (solo miro `< ahora`)."""
    serie = _serie_larga()
    _mock_dia(monkeypatch, serie)
    out = run_forecast("irradiancia", 3600, now="2026-07-22 09:00")

    real = serie.loc[pd.Timestamp("2026-07-22 10:00", tz=TZ)]
    assert out["medido"]["valor"] == real
    assert out["medido"]["desfase_seg"] == 0
    assert out["medido"]["error"] == round(out["valor_esperado"] - real, 2)


def test_ancla_no_deja_ver_el_futuro(monkeypatch):
    """Prueba por perturbacion: corromper TODO lo posterior al ancla no puede
    mover el pronostico. Es la misma garantia que valida el backtest.

    El forecaster corre de verdad (ver el helper): el testigo es el VALOR, que es
    lo unico que se calcula de los datos. Con el forecaster mockeado el test
    pasaria siempre y no probaria nada.
    """
    serie = _serie_larga()
    ancla = pd.Timestamp("2026-07-22 09:00", tz=TZ)

    _mock_dia_sin_mockear_el_forecaster(monkeypatch, serie)
    limpio = run_forecast("irradiancia", 3600, now=str(ancla))

    corrupta = serie.copy()
    corrupta[corrupta.index >= ancla] = 99999.0     # todo el futuro, basura
    _mock_dia_sin_mockear_el_forecaster(monkeypatch, corrupta)
    sucio = run_forecast("irradiancia", 3600, now=str(ancla))

    assert limpio["valor_esperado"] is not None and limpio["valor_esperado"] > 0
    assert sucio["valor_esperado"] == limpio["valor_esperado"]
    assert (sucio["contexto"]["pct_del_techo_reciente"]
            == limpio["contexto"]["pct_del_techo_reciente"])
    assert sucio["contexto"]["muestras_recientes"] == limpio["contexto"]["muestras_recientes"]

    # Control negativo: corromper el PASADO si tiene que mover el valor. Sin esto,
    # el test pasaria aunque el pronostico estuviera clavado en una constante.
    pasado_roto = serie.copy()
    pasado_roto[pasado_roto.index < ancla] = 100.0
    _mock_dia_sin_mockear_el_forecaster(monkeypatch, pasado_roto)
    assert run_forecast("irradiancia", 3600,
                        now=str(ancla))["valor_esperado"] != limpio["valor_esperado"]


def test_medido_none_si_el_instante_cae_en_un_hueco(monkeypatch):
    """Sin lectura cercana (hueco de ingesta), `medido` es None en vez de
    inventar el punto mas parecido que haya a horas de distancia."""
    idx = pd.DatetimeIndex(["2026-07-22 08:00", "2026-07-22 08:05",
                            "2026-07-22 08:10", "2026-07-22 15:00"]).tz_localize(TZ)
    serie = pd.Series([400.0, 410.0, 420.0, 700.0], index=idx, name="ghi")
    _mock_dia(monkeypatch, serie)
    out = run_forecast("irradiancia", 3600, now="2026-07-22 08:10")
    assert out["momento_pronosticado"].startswith("2026-07-22T09:10")
    assert out["medido"] is None


# ── El rango no debe costar una descarga completa ────────────────────────────
def test_el_rango_no_descarga_la_serie_entera(monkeypatch, tmp_path):
    """El defecto que esto cierra: `/arquitectura` solo quiere desde/hasta/cuantas,
    y para eso se bajaba la serie completa del store. Con 694.000 filas de humedad
    eso son ~5 s, y se pagaba cada 6 h porque el contenedor no tiene volumen y
    pierde el cache al recrearse.
    """
    from predictivo import data as data_mod

    # Given: ni cache en memoria ni parquet en disco (contenedor recien creado)
    monkeypatch.setattr(data_mod, "DATA_DIR", tmp_path)
    monkeypatch.setattr(data_mod, "_SERIES", {})
    descargas = []
    monkeypatch.setattr(data_mod, "_descargar_desde_store",
                        lambda *a, **k: descargas.append(1))
    monkeypatch.setattr(data_mod, "_rango_desde_store",
                        lambda v: {"desde": "2026-05-01T00:00:00-06:00",
                                   "hasta": "2026-07-23T02:31:00-06:00", "n": 191676})

    # When
    r = data_mod.rango_datos("humedad_suelo")

    # Then: se respondio con el agregado y NO se bajo un solo dato
    assert r["n"] == 191676
    assert not descargas, "se descargo la serie para calcular tres numeros"


def test_si_el_store_no_responde_el_rango_cae_a_la_serie(monkeypatch, tmp_path):
    """El atajo nunca puede ser el motivo de que el rango no exista."""
    from predictivo import data as data_mod

    # Given: store mudo, pero la serie disponible por otra via
    idx = pd.date_range("2026-07-22 08:00", periods=5, freq="5min", tz=TZ)
    serie = pd.Series([1.0] * 5, index=idx, name="irradiancia")
    monkeypatch.setattr(data_mod, "DATA_DIR", tmp_path)
    monkeypatch.setattr(data_mod, "_SERIES", {})
    monkeypatch.setattr(data_mod, "_rango_desde_store", lambda v: None)
    monkeypatch.setattr(data_mod, "cargar_serie", lambda *a, **k: serie)

    # When/Then
    assert data_mod.rango_datos("irradiancia")["n"] == 5
