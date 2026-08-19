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


def test_el_punto_trae_techo_y_claridad(monkeypatch):
    """Sin el techo, el agente no puede explicar por qué el método acertó:
    33 W/m² no dice nada si no se sabe que el máximo posible eran 505."""
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    out = backtest_tool.run("irradiancia", desde="2026-07-22", hora="12:00")
    punto = out["punto_consultado"]
    assert punto["techo_cielo_despejado"] > 0
    assert punto["pct_del_techo_que_paso"] == round(
        punto["real"] / punto["techo_cielo_despejado"] * 100, 1)
    # Y la serie compacta también lo lleva, en todas las franjas.
    assert all("techo" in f for f in out["serie"])


def test_de_noche_el_techo_es_cero_y_no_hay_kt(monkeypatch):
    """De noche el techo vale 0: es un dato, no un campo faltante. El kt* sí se
    omite, porque dividir por cero no significa nada."""
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    out = backtest_tool.run("irradiancia", desde="2026-07-22", hora="01:00")
    punto = out["punto_consultado"]
    assert punto["techo_cielo_despejado"] == 0
    assert "kt_estrella" not in punto


def test_humedad_no_inventa_techo(monkeypatch):
    """La humedad de suelo no tiene análogo de cielo despejado: los campos
    simplemente no aparecen, en vez de salir en cero o en null."""
    from pronostico.tools import backtest_tool
    idx = pd.date_range("2026-07-22 00:00", "2026-07-22 23:00", freq="h", tz=TZ)
    serie = pd.Series(range(len(idx)), index=idx, dtype=float, name="humedad_suelo")
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: serie)
    out = backtest_tool.run("humedad_suelo", desde="2026-07-22", hora="12:00")
    assert "techo_cielo_despejado" not in out["punto_consultado"]
    assert "techo" not in out["serie"][0]


def test_el_error_viene_en_escala(monkeypatch):
    """Un error suelto no permite juzgar: +62 W/m² puede ser excelente a mediodía
    y catastrófico al amanecer. El punto trae el error relativo al valor medido y
    comparado con el error típico del día."""
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    out = backtest_tool.run("irradiancia", desde="2026-07-22", hora="12:00")
    punto = out["punto_consultado"]
    assert punto["error_relativo_pct"] == round(abs(punto["error"]) / punto["real"] * 100, 1)
    assert punto["veces_el_error_tipico_del_dia"] == round(
        abs(punto["error"]) / out["metricas"]["mae"], 1)


def test_sin_valor_medido_no_hay_error_relativo(monkeypatch):
    """De noche el medido es 0: dividir por él daría infinito, así que el campo
    se omite en vez de emitir un porcentaje sin sentido."""
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _serie_dia())
    punto = backtest_tool.run("irradiancia", desde="2026-07-22", hora="01:00")["punto_consultado"]
    assert punto["real"] == 0
    assert "error_relativo_pct" not in punto
    assert "pct_del_techo_que_paso" not in punto     # techo 0: no hay de qué sacar %


# ── El techo se promedia dentro de la franja ────────────────────────────────

def _dia_completo():
    """Un día entero de lecturas cada 10 min, con forma de campana."""
    import math
    idx = pd.date_range("2026-07-22 00:00", "2026-07-22 23:50", freq="10min", tz=TZ)
    v = [max(0.0, 400 * math.sin(math.pi * (t.hour + t.minute / 60 - 6) / 12))
         for t in idx]
    return pd.Series(v, index=idx, dtype=float, name="irradiancia")


def test_bucket_diario_no_predice_cero(monkeypatch):
    """Regresión: el techo se evaluaba en el borde de la franja. Con bucket='D'
    ese borde es la medianoche -> techo 0 -> kt* NaN -> pred 0 TODOS los días,
    y unas métricas de forma plausible pero sin sentido (skill negativo)."""
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _dia_completo())
    r = bt.backtest("irradiancia", desde="2026-07-22", hasta="2026-07-23", bucket="h")
    assert any(p["cs"] > 0 for p in r["puntos"])
    assert any(p["pred"] > 0 for p in r["puntos"]), "ninguna franja predijo nada"


def test_el_techo_de_una_franja_no_es_el_de_su_borde(monkeypatch):
    """El techo de las 07:00 tiene que ser el PROMEDIO de 07:00-08:00, no el
    valor instantáneo de las 07:00 en punto (por la mañana sube rápido)."""
    from pronostico.physics import clear_sky_ghi
    from pronostico import data as data_mod
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _dia_completo())
    r = bt.backtest("irradiancia", desde="2026-07-22", hasta="2026-07-23", bucket="h")
    p7 = [p for p in r["puntos"] if p["t"].endswith("07:00")][0]
    borde = float(clear_sky_ghi(
        pd.DatetimeIndex([pd.Timestamp("2026-07-22 07:00", tz=TZ)]),
        **data_mod.SITE).iloc[0])
    assert p7["cs"] > borde, "el techo de la franja debería superar al de su borde"


def test_la_claridad_va_en_porcentaje_y_con_el_momento_anterior(monkeypatch):
    """Regresión de interpretación: con el campo `kt_estrella` (0.054) el agente
    leía el nombre «índice de cielo despejado», veía un número chico y concluía
    «muy despejado» —justo al revés—. Y explicaba la predicción con la claridad
    de ESTE momento, cuando el método persistió la del anterior."""
    from pronostico.tools import backtest_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _dia_completo())
    punto = backtest_tool.run("irradiancia", desde="2026-07-22",
                              hasta="2026-07-23", hora="12:00")["punto_consultado"]
    assert "kt_estrella" not in punto, "el nombre ambiguo no debe volver"
    assert 0 <= punto["pct_del_techo_que_paso"] <= 200
    anterior = punto["momento_anterior"]
    assert anterior["t"] == "11:00"
    assert "pct_del_techo_que_paso" in anterior


# ── El modo predicción no puede ver la respuesta ────────────────────────────

def test_el_modo_prediccion_no_expone_backtest():
    """La garantía no es el prompt: es que la herramienta que revela lo medido
    NO está en el juego. Un prompt se puede ignorar; una tool ausente, no."""
    from pronostico.agent.agent import MODOS
    nombres = [e["name"] for e in MODOS["prediccion"]["schemas"]]
    assert "backtest" not in nombres
    assert set(nombres) == {"diagnosticar_condiciones", "contexto_historico", "predecir"}
    # Y el modo de análisis sí la conserva: ahí ver el resultado es el objetivo.
    assert "backtest" in [e["name"] for e in MODOS["analisis"]["schemas"]]


# Claves que revelarian el resultado. Se buscan como CLAVES y no en el texto
# crudo: las notas explicativas mencionan la palabra «medido» justamente para
# aclarar que el valor no está, y eso no es una fuga.
_CLAVES_PROHIBIDAS = {"medido", "real", "error", "error_relativo_pct", "punto_consultado"}


def _claves(obj, acc=None):
    acc = acc if acc is not None else set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            acc.add(k)
            _claves(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _claves(v, acc)
    return acc


def test_predecir_no_devuelve_el_valor_medido(monkeypatch):
    """Contrato duro de `predecir`: ni el medido ni el error, en ningún nivel."""
    from pronostico.tools import predecir_tool
    monkeypatch.setattr(bt.data, "cargar_serie", lambda *a, **k: _dia_completo())
    monkeypatch.setattr(predecir_tool.data, "cargar_serie", lambda *a, **k: _dia_completo())
    out = predecir_tool.run("irradiancia", "2026-07-22T12:00", 3600,
                            hipotesis="cielo estable, ventana por defecto")
    assert not (_claves(out) & _CLAVES_PROHIBIDAS)
    assert out["hipotesis"]                      # se guarda el argumento
    assert out["valor_esperado"] is not None


def test_el_diagnostico_corta_los_datos_antes_del_horizonte(monkeypatch):
    """Si se predice 12:00 con 1 h de anticipación, no se puede haber mirado
    nada posterior a las 11:00."""
    from pronostico import diagnostico
    monkeypatch.setattr(diagnostico.data, "cargar_serie", lambda *a, **k: _dia_completo())
    d = diagnostico.condiciones("irradiancia", instante="2026-07-22T12:00",
                                horizonte_seg=3600)
    assert d["datos_visibles_hasta"].startswith("2026-07-22T11:00")
    assert not (_claves(d) & _CLAVES_PROHIBIDAS)


def test_el_contexto_historico_no_toca_el_dia_objetivo(monkeypatch):
    """Solo mira días anteriores, así que tampoco puede filtrar el resultado."""
    from pronostico import diagnostico
    monkeypatch.setattr(diagnostico.data, "cargar_serie", lambda *a, **k: _dia_completo())
    c = diagnostico.contexto_historico("irradiancia", instante="2026-07-22T12:00", dias=3)
    assert not (_claves(c) & _CLAVES_PROHIBIDAS)
    objetivo = c["instante_a_pronosticar"][:10]
    assert all(d["fecha"] < objetivo for d in c["misma_hora_dias_previos"])
