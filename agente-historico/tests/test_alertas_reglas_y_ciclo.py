"""Las cuatro reglas v1 y la maquina de estados. Puras, sin base.

La tabla de transiciones validas se escribe ACA a mano y no se lee de
`ciclo.TRANSICIONES`: comparar el modulo contra si mismo no detectaria nada.

Estructura Given-When-Then.
"""
from __future__ import annotations

from datetime import date
from itertools import product

import pytest

from historico.alertas import ciclo, reglas
from historico.alertas.ciclo import Accion
from historico.calidad.pruebas.contrato import AVISO, GRAVE, INFO, Hallazgo
from historico.errores import traducir
from historico.tools import hallazgos as tool_hallazgos

FECHA = date(2026, 8, 26)
ELECTRICO, RADIACION = "monitoreo_sc_electrico", "radiacion_sc_15s"


def _h(tipo, variable, severidad=GRAVE, fuente=ELECTRICO, **detalle) -> Hallazgo:
    return Hallazgo(FECHA, fuente, variable, tipo, severidad, 10, detalle)


# ══ Reglas ══════════════════════════════════════════════════════════════════
def test_inversor_parado_solo_con_sol_pleno_y_como_dia_entero():
    # Given el apagon visto por dos variables AC (grave) y un dia nublado (aviso)
    hallazgos = [_h("inversor_sin_acoplar", "voltaje_vac"),
                 _h("inversor_sin_acoplar", "frecuencia_hz"),
                 _h("inversor_sin_acoplar", "potencia_total_wac", severidad=AVISO)]

    # When
    candidatos = reglas.inversor_parado_con_sol(hallazgos)

    # Then dos candidatos con la MISMA clave de dia entero: una sola alerta
    assert {c.clave for c in candidatos} == {
        f"inversor_parado_con_sol:{ELECTRICO}:{reglas.DIA_ENTERO}"}
    assert len(candidatos) == 2


def test_saturado_85_es_aviso_por_variable():
    # Given
    [candidato] = reglas.sensor_temperatura_saturado([_h("saturado_85", "temp_vertical")])

    # Then
    assert candidato.variable == "temp_vertical"
    assert candidato.definicion.severidad == AVISO


def test_irradiancia_imposible_une_los_dos_nombres_del_mismo_sensor():
    # Given el cielo con el nombre crudo y la prueba con el del catalogo
    hallazgos = [_h("kt_imposible", "irradiancia_incidente", fuente=RADIACION),
                 _h("sobre_maximo_fisico", "irradiancia_incidente_wm2", fuente=RADIACION),
                 _h("sobre_maximo_fisico", "temp_inclinado")]

    # When
    candidatos = reglas.irradiancia_imposible(hallazgos)

    # Then una sola clave, y la temperatura fuera de rango no entra
    assert {c.clave for c in candidatos} == {
        f"irradiancia_imposible:{RADIACION}:irradiancia_incidente_wm2"}


def test_incongruencia_ignora_los_dias_que_no_se_pudieron_juzgar():
    # Given un dia incongruente y uno sin irradiancia (info, estado sin_fuente)
    hallazgos = [_h("incongruencia_temp_irradiancia", "temp_inclinado"),
                 _h("incongruencia_temp_irradiancia", "temp_vertical", severidad=INFO)]

    # When
    [candidato] = reglas.incongruencia_temp_irradiancia(hallazgos)

    # Then
    assert candidato.variable == "temp_inclinado"
    assert candidato.definicion.severidad == GRAVE


def test_un_hallazgo_ajeno_a_las_reglas_no_produce_nada():
    assert reglas.candidatos([_h("flatline", "temp_inclinado")]) == []


def test_cada_tipo_de_alerta_tiene_titulo_y_que_es():
    # Then la ficha siempre tiene que decir algo
    for tipo, definicion in reglas.DEFINICIONES.items():
        assert definicion.titulo and definicion.que_es, tipo


def test_las_reglas_solo_leen_tipos_que_algun_detector_escribe():
    # Given los tipos de hallazgo que las reglas consultan
    leidos = set(reglas.TIPOS_DE_HALLAZGO)

    # Then todos existen: un tipo mal escrito seria una regla que nunca dispara
    assert leidos <= set(tool_hallazgos.TIPOS_QUE_SE_ESCRIBEN)


# ══ Maquina de estados ══════════════════════════════════════════════════════
VALIDAS = {
    (ciclo.NUEVA, Accion.RECONOCER): ciclo.RECONOCIDA,
    (ciclo.NUEVA, Accion.DESCARTAR): ciclo.DESCARTADA,
    (ciclo.RECONOCIDA, Accion.SEGUIMIENTO): ciclo.EN_SEGUIMIENTO,
    (ciclo.RECONOCIDA, Accion.DESCARTAR): ciclo.DESCARTADA,
    (ciclo.EN_SEGUIMIENTO, Accion.SEGUIMIENTO): ciclo.EN_SEGUIMIENTO,
    (ciclo.EN_SEGUIMIENTO, Accion.RESOLVER): ciclo.RESUELTA,
    (ciclo.EN_SEGUIMIENTO, Accion.DESCARTAR): ciclo.DESCARTADA,
    (ciclo.RESUELTA, Accion.REABRIR): ciclo.RECONOCIDA,
    (ciclo.DESCARTADA, Accion.REABRIR): ciclo.RECONOCIDA,
}
TODAS = list(product(ciclo.ESTADOS, Accion))


@pytest.mark.parametrize("estado, accion", [p for p in TODAS if p in VALIDAS])
def test_transicion_valida_llega_a_su_destino(estado, accion):
    assert ciclo.transicion(estado, accion).destino == VALIDAS[(estado, accion)]


@pytest.mark.parametrize("estado, accion", [p for p in TODAS if p not in VALIDAS])
def test_transicion_invalida_levanta_error_tipado(estado, accion):
    # When
    with pytest.raises(ciclo.TransicionInvalida) as error:
        ciclo.transicion(estado, accion)

    # Then dice de donde y a donde se queria ir
    assert error.value.datos == {"de": estado, "a": ciclo.TRANSICIONES[accion].destino}


def test_la_transicion_invalida_sale_409_con_de_y_a():
    # Given resolver una descartada, el ejemplo del contrato
    with pytest.raises(ciclo.TransicionInvalida) as error:
        ciclo.transicion(ciclo.DESCARTADA, Accion.RESOLVER)

    # When
    estado, cuerpo = traducir(error.value)

    # Then
    assert estado == 409
    assert (cuerpo["codigo"], cuerpo["de"], cuerpo["a"]) == (
        "transicion_invalida", ciclo.DESCARTADA, ciclo.RESUELTA)
