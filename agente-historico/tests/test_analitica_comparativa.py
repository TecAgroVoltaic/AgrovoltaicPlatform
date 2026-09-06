"""Pruebas del comparativo Vertical vs Inclinado. Sin base de datos: la DECISION.

`reducir` y sus ayudantes reciben las filas ya consultadas, asi que se prueban con
filas fabricadas. Lo que se verifica es lo que puede mentir: que un periodo sin
lecturas de un frente cero y no cero, que el PR sea EXACTAMENTE el de
`analitica.rendimiento` (el diario de R1, no una cuenta propia a 5 minutos), que la
franja horaria diga donde se separan los arreglos y que la estacionalidad se calle
cuando la cobertura no da (274 dias de 569).

Hasta el 2026-08-31 este archivo afirmaba que el PR salia "de la misma cuenta que
`tools/performance.py`". Era cierto mientras esa tool calculaba a 5 minutos; dejo de
serlo cuando paso a ser diaria, y la afirmacion sobrevivio a lo que describia. Ahora
no hay dos cuentas que comparar: hay una, y `test_el_pr_es_literalmente_el_de_rendimiento`
la amarra llamando a la funcion original con las mismas filas.
"""
from __future__ import annotations

import pytest

from historico.analitica import rendimiento
from historico.analitica.comparativa import (
    INCLINADO,
    VERTICAL,
    comparar_totales,
    estacionalidad,
    reducir,
    separacion_horaria,
)
from historico.analitica.resultado import FUERA_DE_COBERTURA

PERIODOS = [
    {"periodo": "2026-01-01T00:00:00+00:00", "energia_inclinado_wh": 1000.0,
     "energia_vertical_wh": 800.0, "n_inclinado": 100, "n_vertical": 100,
     "dias_con_datos": 31},
    {"periodo": "2026-02-01T00:00:00+00:00", "energia_inclinado_wh": 500.0,
     "energia_vertical_wh": 400.0, "n_inclinado": 50, "n_vertical": 50,
     "dias_con_datos": 28},
]

# Perfil de un dia tipico recortado: el inclinado arrasa al mediodia y el vertical
# le gana en las puntas, que es justamente lo que hay que poder ver.
CURVA = [
    {"hora": 5, "inclinado_w": 0.0, "vertical_w": None, "n_inclinado": 9, "n_vertical": 0},
    {"hora": 6, "inclinado_w": 10.0, "vertical_w": 40.0, "n_inclinado": 9, "n_vertical": 9},
    {"hora": 7, "inclinado_w": 30.0, "vertical_w": 80.0, "n_inclinado": 9, "n_vertical": 9},
    {"hora": 12, "inclinado_w": 900.0, "vertical_w": 300.0, "n_inclinado": 9, "n_vertical": 9},
    {"hora": 16, "inclinado_w": 40.0, "vertical_w": 70.0, "n_inclinado": 9, "n_vertical": 9},
    {"hora": 17, "inclinado_w": 15.0, "vertical_w": 45.0, "n_inclinado": 9, "n_vertical": 9},
]

# El cruce punto a punto a 5 min: 1.420 W medios contra 1.000 W/m2 de POA en las
# MISMAS ventanas. No sale de aca ningun PR, solo energia, insolacion y su cociente.
EMPAREJADO = {"potencia_inclinado": 1420.0, "poa_inclinado": 1000.0,
              "potencia_vertical": 710.0, "poa_vertical": 1000.0,
              "n_inclinado": 12, "n_vertical": 12}


def _dia_pr(nombre: str, **campos) -> dict:
    """Un renglon diario como el que sirve `rendimiento.consultar`. Dia sano.

    Los numeros son los del fixture de `test_analitica_rendimiento`, a proposito:
    las dos suites tienen que poder cruzarse a mano sin traducir nada.
    """
    base = {
        "dia": nombre, "horas_sol": 12.0, "horas_rad": 12.0, "horas_ele": 12.0,
        "ghi_wh_m2": 4000.0, "ghi_wh_m2_literal": 4000.0,
        "poa1_bif_wh_m2": 4500.0, "poa2_bif_wh_m2": 3400.0,
        "poa1_front_wh_m2": 4000.0, "poa2_front_wh_m2": 1700.0,
        "e1_integral_wh": 4000.0, "e2_integral_wh": 2800.0,
        "e1_contador_kwh": 4.0, "e2_contador_kwh": 2.8,
    }
    return {**base, **campos}


DIAS_PR = [_dia_pr("2026-01-15"), _dia_pr("2026-02-15")]


def test_los_totales_acumulan_el_periodo_y_el_rendimiento_especifico():
    # Given dos periodos con energia medida
    # When se reduce
    r = reducir(PERIODOS, CURVA, DIAS_PR, PERIODOS, "mes", EMPAREJADO)
    inclinado = r["totales"][INCLINADO]

    # Then la energia es la suma y el especifico es esa energia por Wp instalado
    assert inclinado["energia_wh"]["valor"] == pytest.approx(1500.0)
    assert inclinado["rendimiento_especifico_kwh_kwp"]["valor"] == pytest.approx(
        1500 / 1420, abs=1e-3)
    assert r["totales"][VERTICAL]["energia_wh"]["valor"] == pytest.approx(1200.0)


def test_un_arreglo_sin_lecturas_da_None_y_nunca_cero():
    # Given un periodo en que la columna del vertical no vino (el caso real de
    # noviembre 2025 a febrero 2026 con la potencia AC)
    periodos = [{"periodo": "2026-01-01T00:00:00+00:00", "energia_inclinado_wh": 1000.0,
                 "energia_vertical_wh": None, "n_inclinado": 100, "n_vertical": 0,
                 "dias_con_datos": 31}]

    # When se reduce
    r = reducir(periodos, [], [], periodos, "mes")

    # Then el vertical sale sin valor y con motivo: "no genero" y "no se sabe" no
    # se pueden ver iguales
    assert r["totales"][VERTICAL]["energia_wh"]["valor"] is None
    assert r["totales"][VERTICAL]["energia_wh"]["motivo"]
    assert r["diferencia"]["ganador"] is None


def test_la_diferencia_dice_cual_gano_y_por_cuanto():
    # Given los totales de los dos arreglos
    r = reducir(PERIODOS, CURVA, DIAS_PR, PERIODOS, "mes", EMPAREJADO)

    # When se lee la diferencia
    diferencia = r["diferencia"]

    # Then nombra al ganador, la brecha absoluta y la relativa
    assert diferencia["ganador"] == INCLINADO
    assert diferencia["diferencia_wh"] == pytest.approx(300.0)
    assert diferencia["diferencia_pct"] == pytest.approx(25.0)
    assert "inclinado" in diferencia["lectura"]


def test_el_empate_no_inventa_un_ganador_con_porcentaje_absurdo():
    # Given dos arreglos que generaron lo mismo (y uno de ellos, cero)
    cero = {"energia_wh": {"valor": 0.0, "n": 5, "unidad": "Wh"}}

    # When se comparan
    diferencia = comparar_totales(cero, cero)

    # Then la diferencia es cero y el porcentaje no existe (no se divide por cero)
    assert diferencia["diferencia_wh"] == 0.0
    assert diferencia["diferencia_pct"] is None


def test_la_franja_horaria_muestra_donde_se_separan_los_arreglos():
    # Given el perfil de un dia tipico
    # When se busca la separacion
    franja = separacion_horaria(CURVA)

    # Then el vertical gana las puntas, el inclinado el mediodia, y la hora sin
    # medir de los dos lados no cuenta
    assert franja["gana_vertical"] == [6, 7, 16, 17]
    assert franja["gana_inclinado"] == [12]
    assert franja["horas_comparables"] == 5
    assert franja["pico_inclinado"] == {"hora": 12, "diferencia_w": 600.0}
    assert franja["pico_vertical"] == {"hora": 7, "diferencia_w": 50.0}
    # Las horas contiguas se leen como franja, no como lista suelta
    assert "6-7, 16-17" in franja["lectura"]


def test_el_pr_es_literalmente_el_de_rendimiento():
    """LA COSTURA QUE ESTE MODULO CERRO: una sola definicion de PR en el sistema.

    No se comprueba que "de parecido" al de `rendimiento`: se comprueba que sea el
    mismo objeto calculado por la misma funcion sobre las mismas filas. Dos
    definiciones del mismo indicador conviviendo es peor que una mala, porque el
    experto ve dos numeros para lo mismo y no sabe cual creer.
    """
    # Given los mismos renglones diarios que consumiria `rendimiento`
    # When se reduce el comparativo
    r = reducir(PERIODOS, CURVA, DIAS_PR, PERIODOS, "mes", EMPAREJADO)

    # Then el PR es el que devuelve `rendimiento` sobre esas mismas filas
    esperado = rendimiento.resumen_pr(rendimiento.matriz(
        [rendimiento.evaluar_dia(dia) for dia in DIAS_PR]))
    assert r["rendimiento"]["pr"] == esperado["pr"]
    # y es el DIARIO de R1: 8 kWh de contador contra 8 kWh/m2 de GHI en dos dias
    # dan 0,704 para el inclinado, no el cociente de dos sumas de 5 minutos
    assert r["rendimiento"]["metodo"] == "diario_y_mensual"
    assert (r["rendimiento"]["pr"][rendimiento.CONTADOR][rendimiento.GHI][INCLINADO]
            == pytest.approx(0.704))
    assert (r["rendimiento"]["pr"][rendimiento.CONTADOR][rendimiento.GHI][VERTICAL]
            == pytest.approx(0.493))


def test_un_pr_imposible_sigue_viajando_marcado_en_el_comparativo():
    # Given el caso real: contra POA solo frontal el vertical se va por encima de 1
    # When se reduce
    r = reducir(PERIODOS, CURVA, DIAS_PR, PERIODOS, "mes", EMPAREJADO)

    # Then la marca sobrevive al recorte. Sin ella un 1,16 se leeria como el mejor
    # resultado de la serie en vez de como la prueba de que su irradiancia esta mal
    assert (r["rendimiento"]["pr"][rendimiento.CONTADOR][rendimiento.POA_FRONTAL]
            [VERTICAL] == pytest.approx(1.16))
    assert "contador/poa_frontal/vertical" in r["rendimiento"]["supera_limite_fisico"]


def test_el_bloque_de_cinco_minutos_ya_no_publica_ningun_pr():
    # Given el cruce punto a punto, que R1 avala para analisis a 5 min
    # When se reduce
    r = reducir(PERIODOS, CURVA, DIAS_PR, PERIODOS, "mes", EMPAREJADO)
    fino = r["emparejamiento_5min"]

    # Then sigue dando energia, insolacion y su cociente, y ni una clave `pr`: lo
    # que no puede quedar es que algo LLAMADO PR se calcule cada 5 minutos
    assert "pr" not in fino[INCLINADO] and "pr" not in fino[VERTICAL]
    assert fino[INCLINADO]["kwh_por_kwh_m2"]["valor"] == pytest.approx(1.42)
    assert fino[VERTICAL]["kwh_por_kwh_m2"]["valor"] == pytest.approx(0.71)


def test_sin_POA_solo_se_apagan_las_variantes_que_dependen_de_ella():
    # Given una ventana anterior al 2025-09-05, cuando la POA todavia no existia:
    # hay GHI y energia, y ninguna de las cuatro columnas transpuestas
    sin_poa = "la ventana termina el 2025-03-01 y estas variables no existen antes"
    sin_transposicion = [_dia_pr("2025-02-14", poa1_bif_wh_m2=None, poa2_bif_wh_m2=None,
                                 poa1_front_wh_m2=None, poa2_front_wh_m2=None)]

    # When se reduce con ese motivo
    r = reducir(PERIODOS, CURVA, sin_transposicion, PERIODOS, "mes",
                cobertura_poa=sin_poa)
    pr = r["rendimiento"]["pr"]

    # Then las variantes contra POA salen vacias, con el codigo de motivo y con el
    # tramo en que SI habria dato, que es lo unico accionable para quien pregunto
    assert pr[rendimiento.CONTADOR][rendimiento.POA_BIFACIAL][INCLINADO] is None
    assert r["rendimiento"]["cobertura"]["motivo"] == FUERA_DE_COBERTURA
    assert r["rendimiento"]["cobertura"]["desde"] == "2025-09-05"
    assert r["rendimiento"]["cobertura"]["fuera_de_cobertura"] == sin_poa
    # Y el PR contra GHI SI se calcula, que es lo que antes se perdia: no depende de
    # ninguna transposicion, y antes del 2025-09-05 el comparativo se quedaba sin
    # ningun PR pudiendo dar este
    assert pr[rendimiento.CONTADOR][rendimiento.GHI][INCLINADO] == pytest.approx(0.704)
    # La energia, que tampoco depende de la POA, se sigue reportando
    assert r["totales"][INCLINADO]["energia_wh"]["valor"] == pytest.approx(1500.0)


def test_la_estacionalidad_descarta_los_meses_a_medio_medir():
    # Given dos meses completos y uno con cinco dias de 31
    meses = PERIODOS + [{"periodo": "2026-03-01T00:00:00+00:00",
                         "energia_inclinado_wh": 90.0, "energia_vertical_wh": 80.0,
                         "n_inclinado": 9, "n_vertical": 9, "dias_con_datos": 5}]

    # When se evalua la estacionalidad
    r = estacionalidad(meses)

    # Then marzo queda fuera con su motivo y no arrastra la comparacion
    assert [m["mes"] for m in r["meses"]] == ["2026-01", "2026-02"]
    assert r["descartados"] == [{"mes": "2026-03", "cobertura": 0.161,
                                 "motivo": "cobertura_insuficiente"}]
    assert r["suficiente"] is True


def test_con_un_solo_mes_util_no_se_habla_de_estacionalidad():
    # Given un unico mes con cobertura suficiente
    # When se evalua
    r = estacionalidad(PERIODOS[:1])

    # Then se dice que no alcanza en vez de dibujar una curva anual inventada
    assert r["suficiente"] is False
    assert "estacionalidad" in r["advertencia"]
