"""Tests de la tool `rangos_con_datos`: tramos, ultimos N, el mas cercano y huecos. Sin DB.

La cobertura se arma a mano con la forma real de `cobertura_dias.componer`, asi que
todo corre sin base. Lo que importa es que el modelo reciba fechas utilizables: tramos
bien cortados, `hasta` exclusivo y nunca la lista completa del historico.

Estructura Given-When-Then.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from historico import tools
from historico.analitica import cobertura_dias
from historico.tools import rangos_con_datos
from historico.tools.rangos_con_datos import MAX_TRAMOS, componer

# Dos tramos de dias con datos separados por un hueco de cinco dias (06 al 10):
# radiacion solo tiene el segundo tramo.
ELECTRICO = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05",
             "2026-08-11", "2026-08-12", "2026-08-13"]
RADIACION = ["2026-08-11", "2026-08-12", "2026-08-13"]
COBERTURA = cobertura_dias.componer(ELECTRICO, RADIACION)


def test_esta_registrada_en_analisis_y_en_el_dispatch():
    # Given / When el registro de tools
    # Then la tool esta en la familia de analisis y el lazo la puede ejecutar
    assert tools.FAMILIA["rangos_con_datos"] == "analisis"
    assert tools.DISPATCH["rangos_con_datos"] is rangos_con_datos.run


def test_los_tramos_son_contiguos_y_van_del_mas_reciente_al_mas_viejo():
    # Given dos corridas de dias separadas por un hueco
    # When se compone sin parametros
    salida = componer(COBERTURA)

    # Then salen dos tramos, el reciente primero, con `hasta` exclusivo
    assert salida["tramos"] == [
        {"desde": "2026-08-11", "hasta": "2026-08-14", "ultimo_dia": "2026-08-13", "dias": 3},
        {"desde": "2026-08-01", "hasta": "2026-08-06", "ultimo_dia": "2026-08-05", "dias": 5},
    ]
    assert (salida["desde"], salida["hasta"], salida["n_dias"]) == ("2026-08-01", "2026-08-14", 8)


def test_la_salida_no_trae_la_lista_completa_y_recorta_los_tramos():
    # Given treinta dias sueltos, uno cada dos, que forman treinta tramos de un dia
    dias = [(date(2026, 1, 1) + timedelta(days=2 * i)).isoformat() for i in range(30)]
    cobertura = cobertura_dias.componer(dias, [])

    # When se compone
    salida = componer(cobertura)

    # Then no viaja la lista de dias, los tramos se cortan en el maximo y se informa el total
    assert "dias" not in salida and "fuentes" not in salida
    assert len(salida["tramos"]) == MAX_TRAMOS
    assert salida["n_tramos"] == 30
    assert salida["tramos"][0]["desde"] == dias[-1]


def test_ultimos_n_dias_cuenta_dias_con_datos_y_salta_el_hueco():
    # Given un hueco de cinco dias entre los dos tramos
    # When se piden los ultimos cinco dias
    salida = componer(COBERTURA, ultimos_n_dias=5)

    # Then son los tres del tramo reciente y los dos ultimos del anterior, no de calendario
    ultimos = salida["ultimos"]
    assert ultimos["dias"] == ["2026-08-04", "2026-08-05", "2026-08-11", "2026-08-12",
                               "2026-08-13"]
    assert (ultimos["desde"], ultimos["hasta"]) == ("2026-08-04", "2026-08-14")
    assert ultimos["n"] == 5 and ultimos["dias_calendario"] == 10


def test_ultimos_n_dias_con_hasta_cuenta_hacia_atras_desde_ese_limite():
    # Given / When se piden dos dias con datos antes del 2026-08-12 (exclusivo)
    salida = componer(COBERTURA, ultimos_n_dias=2, hasta="2026-08-12")

    # Then saltan el hueco hacia atras
    assert salida["ultimos"]["dias"] == ["2026-08-05", "2026-08-11"]


def test_ultimos_n_dias_mayor_que_lo_disponible_devuelve_lo_que_hay():
    # Given / When se piden mas dias de los que existen
    salida = componer(COBERTURA, ultimos_n_dias=50)

    # Then devuelve los ocho, avisando cuantos se pidieron
    assert salida["ultimos"]["n"] == 8 and salida["ultimos"]["pedidos"] == 50


def test_cerca_de_un_dia_con_datos_tiene_distancia_cero():
    # Given / When se pide un dia que tiene datos
    cercano = componer(COBERTURA, cerca_de="2026-08-12")["mas_cercano"]

    # Then es el mismo dia, distancia cero, dentro del tramo reciente
    assert cercano["tiene_datos"] is True
    assert (cercano["dia"], cercano["distancia_dias"]) == ("2026-08-12", 0)
    assert cercano["tramo"]["desde"] == "2026-08-11"


@pytest.mark.parametrize("pedido,dia,distancia", [
    ("2026-08-07", "2026-08-05", 2),   # mas cerca del tramo anterior
    ("2026-08-09", "2026-08-11", 2),   # mas cerca del tramo posterior
    ("2026-08-08", "2026-08-05", 3),   # empate: gana el anterior
])
def test_cerca_de_un_dia_del_hueco_elige_el_vecino_mas_cercano(pedido, dia, distancia):
    # Given un dia dentro del hueco 06..10
    # When se busca el mas cercano
    cercano = componer(COBERTURA, cerca_de=pedido)["mas_cercano"]

    # Then propone el vecino con datos mas cercano y ofrece los dos lados
    assert cercano["tiene_datos"] is False
    assert (cercano["dia"], cercano["distancia_dias"]) == (dia, distancia)
    assert cercano["anterior"]["dia"] == "2026-08-05"
    assert cercano["posterior"]["dia"] == "2026-08-11"


@pytest.mark.parametrize("pedido,dia,anterior,posterior", [
    ("2026-07-20", "2026-08-01", None, "2026-08-01"),   # antes del historico
    ("2026-09-15", "2026-08-13", "2026-08-13", None),   # despues del historico
])
def test_cerca_de_fuera_del_historico_propone_el_borde(pedido, dia, anterior, posterior):
    # Given una fecha fuera del rango con datos
    # When se busca el mas cercano
    cercano = componer(COBERTURA, cerca_de=pedido)["mas_cercano"]

    # Then propone el primer o el ultimo dia con datos
    assert cercano["dia"] == dia
    assert (cercano["anterior"] or {}).get("dia") == anterior
    assert (cercano["posterior"] or {}).get("dia") == posterior


def test_fuente_filtra_los_dias():
    # Given radiacion solo tiene el tramo reciente
    # When se pide esa fuente cerca de un dia que solo tiene electrico
    salida = componer(COBERTURA, fuente="radiacion", cerca_de="2026-08-03")

    # Then hay un unico tramo y el mas cercano salta al tramo de radiacion
    assert [t["desde"] for t in salida["tramos"]] == ["2026-08-11"]
    assert salida["mas_cercano"]["dia"] == "2026-08-11"


def test_un_rango_informa_sus_huecos_y_cuantos_dias_tiene():
    # Given / When se pide el rango del 2026-08-03 al 2026-08-12 (exclusivo)
    salida = componer(COBERTURA, desde="2026-08-03", hasta="2026-08-12")

    # Then cuenta los dias con datos y devuelve el hueco con sus bordes
    assert salida["rango_pedido"]["dias_con_datos"] == 4
    assert salida["sin_datos_en"] == [
        {"desde": "2026-08-06", "hasta": "2026-08-11", "ultimo_dia": "2026-08-10", "dias": 5},
    ]
    assert "mas_cercano" not in salida


def test_un_rango_vacio_propone_el_dia_con_datos_mas_cercano():
    # Given / When se pide un rango entero dentro del hueco
    salida = componer(COBERTURA, desde="2026-08-07", hasta="2026-08-09")

    # Then no hay datos y la tool ya trae la alternativa
    assert salida["rango_pedido"]["dias_con_datos"] == 0
    assert salida["mas_cercano"]["dia"] == "2026-08-05"


@pytest.mark.parametrize("parametros", [
    {"cerca_de": "12 de agosto"},
    {"desde": "2026-08-10", "hasta": "2026-08-10"},
    {"fuente": "agrodash"},
])
def test_entradas_invalidas_se_rechazan_con_mensaje(parametros):
    # Given / When / Then una fecha mal escrita, un rango vacio o una fuente desconocida
    with pytest.raises(ValueError):
        componer(COBERTURA, **parametros)


def test_sin_ningun_dato_no_inventa_rangos():
    # Given una cobertura vacia
    vacia = cobertura_dias.componer([], [])

    # When se pide todo a la vez
    salida = componer(vacia, ultimos_n_dias=5, cerca_de="2026-08-12")

    # Then todo queda en None o vacio
    assert (salida["desde"], salida["hasta"], salida["tramos"]) == (None, None, [])
    assert salida["ultimos"] is None and salida["mas_cercano"] is None


def test_run_lee_la_cobertura_cacheada(monkeypatch):
    # Given la cobertura reemplazada por la de prueba
    monkeypatch.setattr(cobertura_dias, "calcular", lambda: COBERTURA)

    # When se ejecuta la tool como lo haria el lazo
    salida = rangos_con_datos.run(cerca_de="2026-08-08")

    # Then responde con esa cobertura
    assert salida["mas_cercano"]["dia"] == "2026-08-05"
