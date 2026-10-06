"""
Tests de la tool `graficar`: un ChartSpec por tipo, con las claves EXACTAS del frontend.

Se corre el algoritmo REAL de `analitica` y solo se reemplaza lo que toca la base
(la consulta de cada modulo y la confianza): asi lo que se verifica es el adaptador
contra la salida verdadera del algoritmo, no contra una copia a mano de su forma.
El contrato es `docs/referencia/contratos-asistente-alertas.md` §1; el frontend
valida con zod, asi que una clave de mas o de menos rompe el dibujo. Sin red ni
base. Estructura Given-When-Then.
"""
from datetime import date

import pytest

from historico import db
from historico.analitica import carpeta, correlacion, crestas, distribucion, energia, fuente, series
from historico.tools import _chartspec, _ventana_grafico, graficar

CONFIANZA = {"advertencia": None}
DESDE, HASTA = "2026-08-01", "2026-08-04"


@pytest.fixture(autouse=True)
def sin_base(monkeypatch):
    """Confianza y "hoy" fijos: ninguna prueba depende de la base ni del reloj."""
    monkeypatch.setattr(fuente, "confianza_de", lambda *a, **k: dict(CONFIANZA))
    monkeypatch.setattr(correlacion, "confianza_de", lambda *a, **k: dict(CONFIANZA))
    monkeypatch.setattr(_ventana_grafico, "hoy_en_sitio", lambda: date(2026, 8, 31))


def _sin_llm(salida: dict) -> None:
    assert set(salida) == {"resumen", "_grafico", "nota"}
    assert salida["_grafico"]["version"] == _chartspec.VERSION


def test_serie_produce_timeseriesdata_con_hueco_nulo(monkeypatch):
    # Given: tres dias con dato en el primero y el tercero; el segundo es hueco
    agregados = {f"2026-08-0{d}T00:00": {"valor": v, "minimo": v - 1, "maximo": v + 1,
                                          "desviacion": 1.0, "n": 10}
                 for d, v in ((1, 500.0), (3, 520.0))}
    monkeypatch.setattr(series, "_agregados", lambda v, o: agregados)

    # When
    salida = graficar.run("serie", ["irradiancia_incidente_wm2"], DESDE, HASTA, "dia")

    # Then: claves exactas de TimeSeriesData y el hueco viaja como None, nunca 0
    _sin_llm(salida)
    datos = salida["_grafico"]["datos"]
    assert set(datos) == {"lines", "unit"}
    linea = datos["lines"][0]
    assert {"id", "label", "points", "trend", "deviationBand"} <= set(linea)
    assert linea["points"][1] == {"timestamp": "2026-08-02T00:00", "value": None}
    assert salida["resumen"]["series"][0]["n"] == 2


def test_serie_demasiado_fina_se_agrega_y_lo_dice(monkeypatch):
    # Given: 90 dias por hora (2.160 puntos) pasan el tope
    monkeypatch.setattr(series, "_agregados", lambda v, o: {})

    # When
    salida = graficar.run("serie", ["potencia_pv1_w"], "2026-05-01", "2026-07-30", "hora")

    # Then: no falla, sube a dia y el subtitulo explica por que
    assert salida["resumen"]["granularidad"] == "dia"
    assert "agregado" in salida["_grafico"]["subtitulo"]
    assert len(salida["_grafico"]["datos"]["lines"][0]["points"]) <= _chartspec.TOPE_PUNTOS


def test_barras_de_energia_suman_el_cierre_diario_por_mes(monkeypatch):
    # Given: dos dias de agosto y uno de septiembre con su cierre AC
    dias = [{"dia": date(2026, 8, 1), "ac_cierre": 5.0, "n_ac": 3},
            {"dia": date(2026, 8, 2), "ac_cierre": 6.5, "n_ac": 3},
            {"dia": date(2026, 9, 1), "ac_cierre": 4.0, "n_ac": 3}]
    monkeypatch.setattr(energia, "por_dia", lambda v: dias)

    # When
    salida = graficar.run("barras", ["energia_hoy_wh"], "2026-08-01", "2026-10-01", "mes")

    # Then: BarsData exacto, kWh sumados por mes; octubre no existe en la ventana
    datos = salida["_grafico"]["datos"]
    assert set(datos) == {"categories", "series", "unit"}
    assert datos["categories"] == ["2026-08", "2026-09"]
    assert datos["series"][0]["values"] == [11.5, 4.0]
    assert datos["unit"] == "kWh"


def test_barras_de_irradiancia_son_la_irradiacion_mensual(monkeypatch):
    # Given: un mes con 36 MJ/m2 integrados = 10 kWh/m2
    monkeypatch.setattr(db, "query", lambda *a, **k: [
        {"mes": "2026-08", "julios_m2": 36_000_000.0, "n": 100, "dias": 5}])

    # When
    salida = graficar.run("barras", ["irradiancia_incidente_wm2"], "2026-08-01", "2026-09-01")

    # Then
    datos = salida["_grafico"]["datos"]
    assert datos["series"][0]["values"] == [10.0]
    assert datos["unit"] == distribucion.UNIDAD_IRRADIACION


def test_barras_no_aceptan_el_contador_de_vida():
    # Given/When/Then: sumar un contador de vida por dia no significa nada
    with pytest.raises(ValueError, match="energia_hoy_wh"):
        graficar.run("barras", ["energia_total_wh"], DESDE, HASTA)


def test_cajas_produce_boxplotdata_y_el_mes_vacio_no_se_dibuja(monkeypatch):
    # Given: julio con cuartiles, agosto sin lecturas
    monkeypatch.setattr(distribucion, "_cuartiles", lambda v, o: [
        {"mes": "2026-07", "n": 50, "minimo": 0.0, "maximo": 900.0,
         "q1": 100.0, "mediana": 300.0, "q3": 500.0}])
    monkeypatch.setattr(distribucion, "_extremos", lambda v, o, l: {
        "2026-07": {"bigote_inferior": 0.0, "bigote_superior": 880.0,
                    "outliers_bajos": 0, "outliers_altos": 2}})

    # When
    salida = graficar.run("cajas", ["irradiancia_incidente_wm2"], "2026-07-01", "2026-09-01")

    # Then
    cajas = salida["_grafico"]["datos"]["boxes"]
    assert set(cajas[0]) == {"label", "min", "q1", "median", "q3", "max", "count"}
    assert cajas[0]["max"] == 880.0          # el bigote, no el maximo absoluto
    assert cajas[1]["count"] == 0
    assert salida["resumen"]["atipicos"] == 2


def test_carpeta_produce_calendarheatmapdata(monkeypatch):
    # Given: una sola celda con dato a las 11 del primer dia
    monkeypatch.setattr(carpeta, "_celdas", lambda v, o, a: {
        ("2026-08-01", 11): {"valor": 800.0, "n": 12}})

    # When
    salida = graficar.run("carpeta", ["irradiancia_incidente_wm2"], "2026-08-01", "2026-08-03")

    # Then: 2 dias x 24 horas, las vacias en None
    datos = salida["_grafico"]["datos"]
    assert set(datos) == {"columns", "rows", "cells", "unit", "min", "max"}
    assert len(datos["cells"]) == 48 and datos["rows"][11] == "11"
    assert {"column": 0, "row": 11, "value": 800.0} in datos["cells"]
    assert salida["resumen"]["hora_pico"] == 11


def test_dispersion_produce_scatterfitdata_con_recta(monkeypatch):
    # Given: pares sobre y = 2x
    monkeypatch.setattr(db, "uno", lambda *a, **k: {"lecturas_x": 3, "lecturas_y": 3})
    monkeypatch.setattr(db, "query", lambda *a, **k: [{"x": float(i), "y": 2.0 * i}
                                                       for i in range(1, 4)])

    # When
    salida = graficar.run("dispersion", ["potencia_pv1_w"], "2026-08-01", "2026-09-01",
                          variable_x="irradiancia_incidente_wm2")

    # Then
    datos = salida["_grafico"]["datos"]
    assert set(datos) == {"points", "fit", "xUnit", "yUnit"}
    assert datos["fit"]["slope"] == pytest.approx(2.0)
    assert set(datos["fit"]) == {"slope", "intercept", "r2"}
    assert datos["points"][0] == {"x": 1.0, "y": 2.0}


def test_dispersion_sin_variable_x_es_un_error_de_parametro():
    with pytest.raises(ValueError, match="variable_x"):
        graficar.run("dispersion", ["potencia_pv1_w"], DESDE, HASTA)


def test_crestas_produce_ridgelinedata_normalizada_al_pico_comun(monkeypatch):
    # Given: dos temperaturas con lecturas distintas
    muestras = {"temp_inclinado": [30.0, 35.0, 40.0, 45.0, 50.0],
                "temp_vertical": [25.0, 27.0, 29.0, 31.0, 33.0]}
    monkeypatch.setattr(crestas, "_muestras",
                        lambda v, var, tope: (muestras[var.clave], len(muestras[var.clave])))

    # When
    salida = graficar.run("crestas", ["temp_inclinado", "temp_vertical"], DESDE, HASTA)

    # Then
    datos = salida["_grafico"]["datos"]
    assert set(datos) == {"curves", "unit"}
    curva = datos["curves"][0]
    assert set(curva) == {"id", "label", "x", "density", "tailProbability"}
    assert max(max(c["density"]) for c in datos["curves"]) == pytest.approx(1.0)


@pytest.mark.parametrize("tipo, variables, extra, mensaje", [
    ("torta", ["potencia_pv1_w"], {}, "tipo"),
    ("serie", ["potencia_pv1_w", "temp_inclinado"], {}, "unidades_mezcladas"),
    ("cajas", ["potencia_pv1_w", "potencia_pv2_w"], {}, "UNA variable"),
    ("carpeta", ["potencia_pv1_w"], {"granularidad": "dia"}, "granularidad"),
    ("serie", ["no_existe"], {}, "no esta en el catalogo"),
])
def test_entradas_invalidas_dan_valueerror_con_motivo(tipo, variables, extra, mensaje):
    with pytest.raises(ValueError, match=mensaje):
        graficar.run(tipo, variables, DESDE, HASTA, **extra)


def test_sin_hasta_la_ventana_cierra_en_hoy_del_sitio(monkeypatch):
    # Given: sin `hasta`, que abriria la ventana hasta el 2100
    monkeypatch.setattr(series, "_agregados", lambda v, o: {})

    # When
    salida = graficar.run("serie", ["potencia_pv1_w"], "2026-08-01")

    # Then: cierra en el dia de hoy en Costa Rica (incluido)
    assert salida["resumen"]["periodo"]["hasta"] == "2026-09-01"
