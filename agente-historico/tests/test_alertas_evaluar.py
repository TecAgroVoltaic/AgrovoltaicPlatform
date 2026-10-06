"""El generador de alertas contra un store en memoria. Sin base.

Lo que se fija (contrato 4.2): idempotencia el mismo dia, ocurrencia nueva en una
alerta abierta, alerta cerrada que no se reabre sola, y la nota de 7 dias una
sola vez.

Estructura Given-When-Then.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from alertas_dobles import AlmacenEnMemoria

from historico.alertas import ciclo, evaluar
from historico.alertas.ciclo import Accion
from historico.analitica.ventana import VentanaInvalida
from historico.calidad.pruebas.contrato import GRAVE, INFO, Hallazgo

DIA = date(2026, 8, 26)
ELECTRICO = "monitoreo_sc_electrico"
CLAVE_INVERSOR = f"inversor_parado_con_sol:{ELECTRICO}:*"


def _apagon(dia: date, variable: str = "voltaje_vac", ghi: float = 1077.9) -> Hallazgo:
    return Hallazgo(dia, ELECTRICO, variable, "inversor_sin_acoplar", GRAVE, 144,
                    {"ghi_max_wm2": ghi, "lecturas_con_sol": 120})


def _ruido(dia: date) -> Hallazgo:
    """Un hallazgo que ninguna regla toma: solo marca hasta donde llego el barrido."""
    return Hallazgo(dia, ELECTRICO, "temp_inclinado", "flatline", INFO, 1, {})


@pytest.fixture
def almacen(monkeypatch) -> AlmacenEnMemoria:
    return AlmacenEnMemoria().instalar(monkeypatch)


def _unica(almacen: AlmacenEnMemoria) -> dict:
    [alerta] = almacen.alertas.values()
    return alerta


def test_un_apagon_crea_una_alerta_nueva_con_su_evento(almacen):
    # Given el apagon del 2026-08-26 visto por las tres variables AC
    almacen.hallazgos_calidad += [_apagon(DIA, v) for v in
                                  ("voltaje_vac", "frecuencia_hz", "potencia_total_wac")]

    # When
    salida = evaluar.evaluar()

    # Then UNA alerta grave de dia entero, con una ocurrencia y su evidencia
    alerta = _unica(almacen)
    assert (salida["creadas"], salida["actualizadas"]) == (1, 0)
    assert (alerta["clave"], alerta["estado"], alerta["severidad"]) == (
        CLAVE_INVERSOR, ciclo.NUEVA, GRAVE)
    assert alerta["ocurrencias"] == 1
    assert alerta["evidencia"]["fechas"] == [DIA.isoformat()]
    assert len(alerta["evidencia"]["hallazgos"]) == 3
    assert alerta["evidencia"]["cifras"]["ghi_max_wm2"] == 1077.9
    assert [e["tipo"] for e in almacen.eventos] == [ciclo.EVENTO_CREADA]


def test_reevaluar_el_mismo_dia_no_suma_nada(almacen):
    # Given una alerta ya creada por ese dia
    almacen.hallazgos_calidad.append(_apagon(DIA))
    evaluar.evaluar()

    # When se vuelve a correr el mismo rango
    salida = evaluar.evaluar()

    # Then nada cambia: ni ocurrencias ni eventos
    assert (salida["creadas"], salida["actualizadas"]) == (0, 0)
    assert _unica(almacen)["ocurrencias"] == 1
    assert len(almacen.eventos) == 1


def test_un_dia_nuevo_suma_una_ocurrencia_a_la_alerta_abierta(almacen):
    # Given la alerta del 26 reconocida, y un apagon nuevo el 31
    almacen.hallazgos_calidad.append(_apagon(DIA))
    evaluar.evaluar()
    almacen.transicionar(1, Accion.RECONOCER, None, "consola")
    otro_dia = date(2026, 8, 31)
    almacen.hallazgos_calidad.append(_apagon(otro_dia, ghi=1041.0))

    # When
    salida = evaluar.evaluar()

    # Then la misma alerta, con dos ocurrencias y el rango estirado
    alerta = _unica(almacen)
    assert (salida["creadas"], salida["actualizadas"]) == (0, 1)
    assert (alerta["ocurrencias"], alerta["fecha_fin"]) == (2, otro_dia.isoformat())
    assert alerta["estado"] == ciclo.RECONOCIDA
    assert alerta["evidencia"]["cifras"]["ghi_max_wm2"] == 1077.9
    assert almacen.eventos[-1]["tipo"] == ciclo.EVENTO_OCURRENCIA


def test_una_alerta_cerrada_no_se_reabre_y_lo_posterior_abre_otra(almacen):
    # Given la alerta del 26 descartada
    almacen.hallazgos_calidad.append(_apagon(DIA))
    evaluar.evaluar()
    almacen.transicionar(1, Accion.DESCARTAR, "falsa alarma", "consola")

    # When se re-evalua el mismo dia
    assert evaluar.evaluar()["creadas"] == 0

    # And aparece un apagon posterior
    almacen.hallazgos_calidad.append(_apagon(DIA + timedelta(days=1)))
    salida = evaluar.evaluar()

    # Then la descartada sigue descartada y hay una nueva solo con el dia nuevo
    assert salida["creadas"] == 1
    assert almacen.alertas[1]["estado"] == ciclo.DESCARTADA
    assert almacen.alertas[2]["evidencia"]["fechas"] == [(DIA + timedelta(days=1)).isoformat()]


def _en_seguimiento_y_barrido_hasta(almacen, dias_despues: int) -> None:
    almacen.hallazgos_calidad.append(_apagon(DIA))
    evaluar.evaluar()
    almacen.transicionar(1, Accion.RECONOCER, None, "consola")
    almacen.transicionar(1, Accion.SEGUIMIENTO, "tecnico avisado", "consola")
    almacen.hallazgos_calidad.append(_ruido(DIA + timedelta(days=dias_despues)))


def test_siete_dias_sin_ocurrencias_dejan_una_nota_una_sola_vez(almacen):
    # Given una alerta en seguimiento y el barrido 7 dias mas adelante
    _en_seguimiento_y_barrido_hasta(almacen, 7)

    # When se evalua dos veces
    primera, segunda = evaluar.evaluar(), evaluar.evaluar()

    # Then la nota sale una vez, y el estado no cambia
    notas = [e for e in almacen.eventos if e["tipo"] == ciclo.EVENTO_NOTA]
    assert (primera["notas"], segunda["notas"]) == (1, 0)
    assert notas[0]["nota"] == f"sin ocurrencias desde {DIA.isoformat()}; se puede resolver"
    assert almacen.alertas[1]["estado"] == ciclo.EN_SEGUIMIENTO


def test_seis_dias_sin_ocurrencias_todavia_no_dejan_nota(almacen):
    # Given el barrido solo 6 dias despues
    _en_seguimiento_y_barrido_hasta(almacen, 6)

    # When / Then
    assert evaluar.evaluar()["notas"] == 0


def test_los_7_dias_se_cuentan_hasta_el_ultimo_dia_barrido_no_hasta_hoy(almacen):
    # Given una alerta en seguimiento y NINGUN dato posterior: la carga se atraso
    _en_seguimiento_y_barrido_hasta(almacen, 0)

    # When se evalua pidiendo un rango que llega mucho mas alla
    salida = evaluar.evaluar(DIA, DIA + timedelta(days=60))

    # Then no hay nota: no tener datos no es que el problema se fue
    assert salida["notas"] == 0
    assert salida["referencia_sin_ocurrencias"] == DIA.isoformat()


def test_con_el_store_de_hallazgos_vacio_lo_dice(almacen):
    # When
    salida = evaluar.evaluar()

    # Then no son ceros mudos
    assert salida["rango"] is None and "vacio" in salida["advertencia"]


def test_un_rango_invertido_es_error_de_parametro(almacen):
    almacen.hallazgos_calidad.append(_apagon(DIA))
    with pytest.raises(VentanaInvalida):
        evaluar.evaluar(DIA, DIA)
