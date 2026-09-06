"""Pruebas del ajuste OLS de la Fig. 8. Sin base de datos: se prueba la DECISION.

`ajustar` y `reducir` son puras a proposito. Lo que se verifica aca es que la recta
recupera una pendiente y un intercepto conocidos, que el R2 vale lo que tiene que
valer en los dos extremos (ajuste perfecto y ninguna relacion) y que los casos en
que la regresion NO EXISTE se dicen con su motivo en vez de devolver un numero.
"""
from __future__ import annotations

import math

import pytest

from historico.analitica import correlacion, ventana
from historico.analitica.correlacion import (
    PARES_INSUFICIENTES,
    X_CONSTANTE,
    advertir_sin_vigilancia,
    ajustar,
    reducir,
)


def test_recupera_la_pendiente_y_el_intercepto_de_una_recta_conocida():
    # Given una recta exacta y = 2,5x + 1
    x = [0.0, 1.0, 2.0, 3.0, 4.0]
    y = [1.0, 3.5, 6.0, 8.5, 11.0]

    # When se ajusta
    r = ajustar(x, y)

    # Then salen los coeficientes que se metieron, y el ajuste es perfecto
    assert r["pendiente"] == pytest.approx(2.5)
    assert r["intercepto"] == pytest.approx(1.0)
    assert r["r2"] == pytest.approx(1.0)
    assert r["n"] == 5


def test_datos_sin_relacion_dan_r2_cero():
    # Given una nube simetrica cuya covarianza con x es exactamente cero
    x = [1.0, 2.0, 3.0, 4.0]
    y = [1.0, -1.0, -1.0, 1.0]

    # When se ajusta
    r = ajustar(x, y)

    # Then la recta es horizontal y no explica nada de la varianza
    assert r["pendiente"] == pytest.approx(0.0, abs=1e-12)
    assert r["r2"] == pytest.approx(0.0, abs=1e-12)


def test_menos_de_dos_puntos_no_tiene_recta():
    # Given un unico par (por una recta pasan infinitas rectas)
    # When se ajusta
    r = ajustar([1.0], [2.0])

    # Then no hay coeficientes y el motivo lo explica
    assert r["pendiente"] is None and r["intercepto"] is None and r["r2"] is None
    assert r["motivo"] == PARES_INSUFICIENTES
    assert r["n"] == 1


def test_todos_los_x_iguales_no_tiene_pendiente():
    # Given una columna vertical de puntos: la pendiente seria infinita
    # When se ajusta
    r = ajustar([3.0, 3.0, 3.0], [1.0, 5.0, 9.0])

    # Then se dice que no existe, en vez de devolver un numero enorme
    assert r["pendiente"] is None
    assert r["motivo"] == X_CONSTANTE


def test_y_constante_da_ajuste_perfecto_y_pendiente_cero():
    # Given una y que no varia mientras x si (R2 seria 0/0)
    # When se ajusta
    r = ajustar([1.0, 2.0, 3.0], [7.0, 7.0, 7.0])

    # Then la recta describe todo lo que hay que describir (convencion documentada)
    assert r["pendiente"] == pytest.approx(0.0, abs=1e-12)
    assert r["intercepto"] == pytest.approx(7.0)
    assert r["r2"] == pytest.approx(1.0)


def test_los_pares_no_finitos_no_entran_al_ajuste():
    # Given pares con un NaN y un infinito colados
    x = [0.0, 1.0, 2.0, float("nan"), 3.0]
    y = [1.0, 3.5, 6.0, 10.0, float("inf")]

    # When se ajusta
    r = ajustar(x, y)

    # Then solo cuentan los tres pares utilizables y la recta sigue siendo la buena
    assert r["n"] == 3
    assert r["pendiente"] == pytest.approx(2.5)


def test_sin_pares_no_hay_ajuste_ni_puntos():
    # Given una ventana que no formo ni un par
    # When se reduce
    r = reducir([])

    # Then no hay nube ni recta, y el motivo lo dice
    assert r["puntos"] == [] and r["puntos_mostrados"] == 0
    assert r["submuestreado"] is False
    assert r["ajuste"]["motivo"] == PARES_INSUFICIENTES


def test_el_ajuste_usa_todos_los_pares_aunque_el_dibujo_se_adelgace():
    # Given 100 pares sobre una recta y un techo de 10 puntos dibujables
    pares = [(float(i), 2.0 * i + 3.0) for i in range(100)]

    # When se reduce con ese techo
    r = reducir(pares, techo=10)

    # Then se dibujan como mucho 10, pero la recta se calculo sobre los 100
    assert r["puntos_mostrados"] <= 10
    assert r["submuestreado"] is True
    assert r["ajuste"]["n"] == 100
    assert r["ajuste"]["pendiente"] == pytest.approx(2.0)
    assert math.isclose(r["ajuste"]["r2"], 1.0)


def test_la_confianza_traduce_las_claves_y_delata_lo_que_nadie_vigila(monkeypatch):
    # Given un par que mezcla una variable vigilada con una que el barrido no mira
    pedido = {}

    def falsa_confianza(desde, hasta, variables, fuente):
        pedido.update(variables=variables, fuente=fuente)
        return {"dias_utilizables": 5, "advertencia": None}

    monkeypatch.setattr(correlacion.contexto, "confianza", falsa_confianza)

    # When se arma el bloque de confianza de la dispersion
    bloque = correlacion.confianza_de(
        ventana.crear("2026-01-01", "2026-02-01"),
        "irradiancia_incidente_wm2", "poa_pv1_wm2")

    # Then la irradiancia se busca con su nombre crudo (con el sufijo se perdian
    # 321 hallazgos y la confianza salia impecable), y la POA se declara ciega en
    # vez de pasar por limpia
    assert pedido["variables"] == ["irradiancia_incidente"]
    assert pedido["fuente"] == "radiacion_sc_15s"
    assert bloque["sin_vigilancia"] == ["poa_pv1_wm2"]
    assert "nadie las miro" in bloque["advertencia"]


def test_la_ceguera_se_suma_a_la_advertencia_que_ya_traia_el_periodo():
    # Given un periodo que ya venia flojo de cobertura
    bloque = {"advertencia": "5 de 31 dias utilizables"}

    # When ademas se pide una variable que nadie vigila
    salida = advertir_sin_vigilancia(bloque, ["poa_pv1_wm2"])

    # Then las dos cosas llegan juntas: una no puede tapar a la otra
    assert "5 de 31 dias utilizables" in salida["advertencia"]
    assert "poa_pv1_wm2" in salida["advertencia"]


def test_sin_variables_ciegas_el_bloque_queda_como_estaba():
    # Given un bloque de variables todas vigiladas
    bloque = {"advertencia": None}

    # When no hay ninguna ciega
    salida = advertir_sin_vigilancia(bloque, [])

    # Then no se le inventa una clave ni una advertencia al bloque
    assert "sin_vigilancia" not in salida
    assert salida["advertencia"] is None


def test_un_par_que_nunca_coexistio_se_dice_sin_tocar_la_base(monkeypatch):
    # Given el SP722 (18 dias de mayo 2026) cruzado con la POA, sobre marzo 2026
    def no_consultar(*_a, **_k):
        raise AssertionError("no hay que consultar un par que no se solapa")

    monkeypatch.setattr(correlacion.db, "query", no_consultar)
    monkeypatch.setattr(correlacion.db, "uno", no_consultar)
    monkeypatch.setattr(correlacion.contexto, "confianza",
                        lambda *_a, **_k: {"advertencia": None})

    # When se pide la dispersion
    r = correlacion.dispersion(ventana.crear("2026-03-01", "2026-04-01"),
                               "poa_pv1_wm2", "irradiancia_incidente_sp722_wm2")

    # Then no se consulto nada y la respuesta dice que el par no existe en esa
    # ventana, en vez de una nube vacia que se leeria como "no hay correlacion"
    assert r["ajuste"]["r2"]["motivo"] == "fuera_de_cobertura"
    assert r["pares"] == 0 and r["puntos"] == []
    assert "2026-05-11" in r["nota"]
