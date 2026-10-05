"""Pruebas del PR diario y mensual. Sin base de datos: lo que se prueba es la DECISION.

Cada prueba defiende un fallo que YA se midio contra la base y que una implementacion
ingenua vuelve a cometer:

  * aplicar el `5/60` literal de R1 y multiplicar por veinte la irradiacion de los
    tramos a 15 s (el error medido va de +860% a -6,6% segun el mes);
  * integrar sin techo y contar el salto nocturno de 40.200 s como once horas de sol;
  * dejar entrar un dia en que el piranometro grabo doce horas y el inversor seis;
  * devolver 0 donde no hay dato;
  * devolver un PR > 1 sin decir que es fisicamente imposible;
  * leer el acumulador diario como si el reinicio de medianoche fuera una caida.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from historico.analitica.rendimiento import (
    COBERTURA_INSUFICIENTE,
    CONTADOR,
    DESFASE_EXCESIVO,
    GHI,
    HORAS_FORMULA_LITERAL,
    INCLINADO,
    INTEGRAL,
    KWP_POR_ARREGLO,
    POA_FRONTAL,
    SIN_ELECTRICO,
    TECHO_DT_SEG,
    VERTICAL,
    cierre_del_contador,
    componer,
    evaluar_dia,
    integrar,
    performance_ratio,
    variante,
)

INICIO = datetime(2026, 4, 15, 6, 0)
IRRADIANCIA = 800.0          # W/m2 constantes durante una hora
UNA_HORA_A_800 = 800.0       # Wh/m2 exactos que esa hora deposita


def _serie(paso_seg: int, segundos: int = 3600) -> list[tuple[datetime, float]]:
    """Una hora de irradiancia constante a la cadencia pedida.

    Cierra con una lectura en cero justo al cumplirse la hora, que es lo que hace
    comparables dos cadencias distintas: sin ella la ultima lectura de cada serie
    se lleva la cadencia nominal y las dos horas medirian distinto.
    """
    pasos = segundos // paso_seg
    serie = [(INICIO + timedelta(seconds=i * paso_seg), IRRADIANCIA)
             for i in range(pasos)]
    return serie + [(INICIO + timedelta(seconds=segundos), 0.0)]


def _formula_literal(serie: list[tuple[datetime, float]]) -> float:
    """La formula tal cual la escribio Leo en R1: `Irradiancia * 5/60`, por lectura."""
    return sum(valor for _, valor in serie) * HORAS_FORMULA_LITERAL


def _dia(nombre: str, **campos) -> dict:
    """Un dia completo y sano, con los campos que se quieran pisar."""
    base = {
        "dia": nombre, "horas_sol": 12.0, "horas_rad": 12.0, "horas_ele": 12.0,
        "ghi_wh_m2": 4000.0, "ghi_wh_m2_literal": 4000.0,
        "poa1_bif_wh_m2": 4500.0, "poa2_bif_wh_m2": 3400.0,
        "poa1_front_wh_m2": 4000.0, "poa2_front_wh_m2": 1700.0,
        "e1_integral_wh": 4000.0, "e2_integral_wh": 2800.0,
        "e1_contador_kwh": 4.0, "e2_contador_kwh": 2.8,
    }
    return {**base, **campos}


# ── 1. La generalizacion del dt: la prueba que defiende la decision ─────────────
def test_la_misma_energia_a_15_s_y_a_5_min_da_la_misma_irradiacion_diaria():
    # Given la MISMA hora de sol registrada a dos cadencias distintas
    a_15s, a_5min = _serie(15), _serie(300)

    # When se integra con el dt real acotado
    quince, cinco = integrar(a_15s), integrar(a_5min)

    # Then las dos dan la misma irradiacion, porque la irradiacion es del SOL y no
    # de cada cuanto grabo el registrador
    assert quince["total"] == pytest.approx(UNA_HORA_A_800)
    assert cinco["total"] == pytest.approx(UNA_HORA_A_800)
    assert quince["total"] == pytest.approx(cinco["total"])


def test_el_5_60_literal_multiplica_por_veinte_la_hora_grabada_a_15_s():
    # Given la misma hora de sol a 15 s y a 5 min
    a_15s, a_5min = _serie(15), _serie(300)

    # When se aplica la formula LITERAL de R1, que le da 5 min a cada lectura
    literal_15s, literal_5min = _formula_literal(a_15s), _formula_literal(a_5min)

    # Then la de 15 s sale veinte veces mayor: 300/15. La formula literal no
    # introduce un sesgo constante que se pueda descontar, sino una estacionalidad
    # falsa dictada por cuando cambio la cadencia del registrador (+860% en octubre
    # 2025, -6,6% en diciembre). Por eso este modulo NO la implementa.
    assert literal_5min == pytest.approx(UNA_HORA_A_800)
    assert literal_15s == pytest.approx(UNA_HORA_A_800 * 20)
    assert literal_15s / integrar(a_15s)["total"] == pytest.approx(20.0)


# ── 2. El techo del dt ──────────────────────────────────────────────────────────
def test_el_salto_nocturno_no_se_integra_como_once_horas_de_sol():
    # Given dos lecturas separadas por el salto nocturno real de la serie
    salto_nocturno_seg = 40_200
    serie = [(INICIO, 500.0),
             (INICIO + timedelta(seconds=salto_nocturno_seg), 0.0)]

    # When se integra
    r = integrar(serie)

    # Then esa lectura pesa el TECHO y no las 11,2 h del salto: sin techo daria
    # 5.583 Wh/m2 de una sola muestra, mas que un dia entero de sol
    sin_techo = 500.0 * salto_nocturno_seg / 3600.0
    assert sin_techo > 5_500.0
    assert r["total"] == pytest.approx(500.0 * TECHO_DT_SEG / 3600.0)
    assert r["horas"] <= 2 * TECHO_DT_SEG / 3600.0


# ── 3. El dia con cobertura insuficiente ────────────────────────────────────────
def test_el_dia_con_medio_registro_se_descarta_y_dice_por_que():
    # Given el 2026-03-09 real: 4,97 h de radiacion contra 9,67 h de electrico
    fila = _dia("2026-03-09", horas_sol=12.01, horas_rad=4.97, horas_ele=9.67)

    # When se evalua
    d = evaluar_dia(fila)

    # Then queda fuera, y el motivo viaja con el dia
    assert d["valido"] is False
    assert COBERTURA_INSUFICIENTE in d["motivos_descarte"]
    assert DESFASE_EXCESIVO in d["motivos_descarte"]
    assert d["desfase_h"] == pytest.approx(4.70, abs=0.01)


def test_el_desfase_descarta_un_dia_que_las_dos_coberturas_aprueban_por_separado():
    # Given el 2026-01-03 real: las dos coberturas pasan el 0,90 comodas...
    fila = _dia("2026-01-03", horas_sol=11.54, horas_rad=10.45, horas_ele=11.58)

    # When se evalua
    d = evaluar_dia(fila)

    # Then igual se descarta, y SOLO por el desfase. Es el criterio que de verdad
    # filtra: si el piranometro y el inversor cubren tramos distintos del dia, el PR
    # sale a la mitad sin que ninguna cobertura se vea mal sola.
    assert d["cobertura_radiacion"] >= 0.90 and d["cobertura_electrico"] >= 0.90
    assert d["motivos_descarte"] == [DESFASE_EXCESIVO]
    assert d["valido"] is False


def test_el_dia_descartado_no_entra_al_agregado_y_sale_listado_con_su_motivo():
    # Given un dia sano y otro al que le falta la mitad de la radiacion
    sano = _dia("2026-04-14")
    roto = _dia("2026-04-15", horas_rad=5.0)

    # When se compone el periodo
    r = componer([sano, roto])

    # Then el agregado se calcula sobre uno solo, y el otro aparece con su razon
    assert r["dias"] == {"con_dato": 2, "validos": 1, "descartados": 1,
                         "detalle_descartados": r["dias"]["detalle_descartados"]}
    assert r["total"][INTEGRAL][GHI][INCLINADO]["dias"] == 1
    descartado = r["dias"]["detalle_descartados"][0]
    assert descartado["dia"] == "2026-04-15"
    assert COBERTURA_INSUFICIENTE in descartado["motivos_descarte"]


# ── 4. Un rango sin datos no es un cero ─────────────────────────────────────────
def test_un_rango_sin_datos_devuelve_none_con_motivo_y_nunca_cero():
    # Given un periodo sin una sola fila
    r = componer([])

    # When se mira cualquiera de las seis variantes
    pr = r["total"][CONTADOR][GHI][INCLINADO]["pr"]

    # Then el PR es None con motivo, no 0: un PR de 0 es un dia con el inversor
    # caido, que es un hecho, y no puede confundirse con "no se midio"
    assert pr["valor"] is None
    assert pr["n"] == 0
    assert pr["motivo"] and pr["explicacion"]
    assert r["total"][INTEGRAL][GHI][VERTICAL]["energia_kwh"]["valor"] is None


def test_un_dia_sin_electrico_no_aporta_un_cero_al_periodo():
    # Given un dia en que el piranometro grabo y el inversor no
    r = componer([_dia("2026-04-14"),
                  _dia("2026-04-15", horas_ele=None, e1_integral_wh=None,
                       e2_integral_wh=None, e1_contador_kwh=None,
                       e2_contador_kwh=None)])

    # Then el dia queda fuera por falta de fuente, no promediado como generacion nula
    assert SIN_ELECTRICO in r["dias"]["detalle_descartados"][0]["motivos_descarte"]
    assert r["total"][INTEGRAL][GHI][INCLINADO]["dias"] == 1


# ── 5. El PR > 1 sale marcado, no callado ───────────────────────────────────────
def test_un_pr_mayor_que_uno_viaja_marcado_con_su_aviso():
    # Given el resultado real del vertical contra POA frontal sola: 1,217
    energia_kwh, irradiacion_kwh_m2 = 499.92, 289.22

    # When se calcula el PR
    pr = performance_ratio(energia_kwh, irradiacion_kwh_m2, n=197)

    # Then sale con el valor Y con la marca: un PR > 1 es fisicamente imposible y es
    # la señal de que el insumo de irradiancia de ese arreglo esta mal
    assert pr["valor"] == pytest.approx(1.217, abs=0.001)
    assert pr["supera_limite_fisico"] is True
    assert "imposible" in pr["aviso"]


def test_un_pr_normal_no_lleva_la_marca():
    # Given el resultado real del inclinado contra POA bifacial
    pr = performance_ratio(708.10, 769.71, n=197)

    # Then no hay marca que distraiga: la marca solo aparece cuando hay que mirarla
    assert pr["valor"] == pytest.approx(0.648, abs=0.001)
    assert "supera_limite_fisico" not in pr and "aviso" not in pr


def test_la_variante_cuenta_cuantos_dias_superaron_el_limite_y_cual_fue_el_peor():
    # Given tres dias iguales en energia y con la POA frontal del vertical cada vez
    # mas baja: en dos de ellos el denominador ya no alcanza para sostener la energia
    dias = [_dia(f"2026-04-{d:02d}", poa2_front_wh_m2=front)
            for d, front in ((14, 3000.0), (15, 900.0), (16, 700.0))]

    # When se calcula la variante contra POA frontal con la integral de la potencia
    v = variante(dias, POA_FRONTAL, INTEGRAL)

    # Then no basta con el agregado: se dice en cuantos dias se rompio la fisica y
    # hasta donde llego el peor, que es lo que hace imposible leerlo como buen dato
    assert v[VERTICAL]["dias_pr_mayor_a_uno"] == 2
    assert v[VERTICAL]["pr_diario_maximo"] == pytest.approx(
        (2.8 / KWP_POR_ARREGLO) / 0.7, abs=0.001)


# ── 6. El acumulador diario ─────────────────────────────────────────────────────
def test_el_contador_del_dia_es_el_maximo_del_dia():
    # Given un dia de lecturas del acumulador, que crece y cierra en 4,0 kWh
    dia = [(datetime(2026, 4, 15, 10, 15), 0.0),
           (datetime(2026, 4, 15, 11, 0), 0.595),
           (datetime(2026, 4, 15, 13, 0), 2.186),
           (datetime(2026, 4, 15, 17, 55), 4.0)]

    # Then el cierre es su maximo
    assert cierre_del_contador(dia) == pytest.approx(4.0)


def test_el_reinicio_de_medianoche_no_se_cuenta_como_caida():
    # Given el cierre de un dia y la apertura del siguiente, que abre en 0,000
    ayer = [(datetime(2026, 4, 15, 17, 55), 4.0)]
    hoy = [(datetime(2026, 4, 16, 6, 5), 0.0),
           (datetime(2026, 4, 16, 17, 55), 5.3)]

    # Then cada dia se lee entero por separado: el salto negativo de las 00:00
    # separa dos dias y no es una caida del contador
    assert cierre_del_contador(ayer) == pytest.approx(4.0)
    assert cierre_del_contador(hoy) == pytest.approx(5.3)


def test_un_retroceso_intradia_no_borra_lo_ya_acumulado():
    # Given el 2026-04-24 real: el inversor se reinicia al amanecer y el contador
    # baja de 0,23 a 0,02 y a 0,00 kWh
    dia = [(datetime(2026, 4, 24, 7, 0), 0.23),
           (datetime(2026, 4, 24, 7, 5), 0.02),
           (datetime(2026, 4, 24, 7, 10), 0.0)]

    # Then el maximo conserva los 0,23 kWh que si se generaron; el ULTIMO valor
    # los perderia enteros y el dia saldria con PR cero
    assert cierre_del_contador(dia) == pytest.approx(0.23)


def test_la_fila_contaminada_del_piranometro_no_pasa_por_su_firma_fisica():
    # Given el 2025-10-07, con la fila que trae 203.194,6 en `energia_pv1_wh`
    dia = [(datetime(2025, 10, 7, 7, 40), 0.4),
           (datetime(2025, 10, 7, 7, 45), 203_194.6),
           (datetime(2025, 10, 7, 17, 50), 4.7)]

    # Then el cierre es el del inversor y no el de la fila colada: 1,42 kWp no puede
    # acumular 203 MWh en un dia, y esa firma fisica basta para descartarla
    assert cierre_del_contador(dia) == pytest.approx(4.7)


# ── El PR agregado: la formula y la prohibicion de mezclar fuentes ──────────────
def test_el_pr_del_periodo_se_pondera_por_energia_y_no_promedia_los_pr_diarios():
    # Given un dia soleado con buen PR y otro nublado con PR bajo
    dias = [_dia("2026-04-14", ghi_wh_m2=6000.0, e1_integral_wh=5680.0),
            _dia("2026-04-15", ghi_wh_m2=1000.0, e1_integral_wh=284.0)]

    # When se agrega el periodo
    v = variante(dias, GHI, INTEGRAL)

    # Then PR = sum(E) / (P0 * sum(H)), la forma estandar de subir un PR a un periodo
    # (IEC 61724), y NO la media de 0,667 y 0,200 que daria 0,433
    esperado = (5.964 / KWP_POR_ARREGLO) / 7.0
    assert v[INCLINADO]["pr"]["valor"] == pytest.approx(round(esperado, 3), abs=0.001)
    assert v[INCLINADO]["pr"]["valor"] != pytest.approx(0.433, abs=0.01)


def test_el_contador_y_la_integral_se_agregan_sobre_sus_propios_dias():
    # Given dos dias validos, uno de ellos sin acumulador (nov-2025 a feb-2026 no lo
    # trae: la columna no vino en el CSV)
    dias = [_dia("2026-04-14"),
            _dia("2025-12-14", e1_contador_kwh=None, e2_contador_kwh=None)]

    # When se compone
    r = componer(dias)

    # Then cada camino declara sobre cuantos dias se calculo, y no se funden en un
    # solo numero: el subconjunto con contador no representa el periodo
    assert r["total"][CONTADOR][GHI][INCLINADO]["dias"] == 1
    assert r["total"][INTEGRAL][GHI][INCLINADO]["dias"] == 2
    assert r["fuente_energia"]["principal"] == CONTADOR
    assert r["fuente_energia"]["respaldo"] == INTEGRAL
    assert r["fuente_energia"]["dias_con_contador"] == 1
    assert "sesgo estacional" in r["fuente_energia"]["advertencia"]


def test_las_variantes_contra_poa_salen_marcadas_como_pendientes_de_aval():
    # Given cualquier periodo
    r = componer([_dia("2026-04-14")])

    # Then el PR contra POA no se da por cerrado: R2 confirmo el principio pero dejo
    # la ecuacion de transposicion a la espera de Hugo
    aval = r["aval_pendiente"]
    assert aval["estado"] == "pendiente_de_aval_externo"
    assert aval["quien"] == "Hugo"
    assert POA_FRONTAL in aval["insumos_provisionales"]


def test_el_error_de_la_formula_literal_se_publica_con_el_periodo():
    # Given un periodo grabado a 15 s, donde el `5/60` infla por veinte
    dias = [_dia("2025-10-25", ghi_wh_m2=5026.0, ghi_wh_m2_literal=100_521.0)]

    # When se compone
    e = componer(dias)["error_formula_literal"]

    # Then el costo de haber obedecido la letra de R1 viaja junto al resultado
    assert e["aplicable"] is True
    assert e["factor"] == pytest.approx(20.0, abs=0.01)
    assert e["error_pct"] == pytest.approx(1900.0, abs=1.0)
