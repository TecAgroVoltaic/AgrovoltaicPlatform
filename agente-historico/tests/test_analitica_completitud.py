"""Pruebas de la completitud por periodo (Fig. 4: puntos en el servidor).

Se prueban las funciones PURAS directo, sin base de datos: la consulta solo trae
el calendario con sus conteos y el salto tipico entre filas de cada dia, y todo el
criterio (cadencia de referencia, esperado contra real, huecos como tramos,
agrupacion) vive aca.
Prioridad a lo que rompe: cadencia mixta, cadencia ausente, periodo vacio, dias en
cero, calendario con saltos y granularidad que el calendario no puede dar.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from historico.analitica import completitud
from historico.analitica.completitud import ELECTRICO, MEDIDA, NOMINAL, RADIACION
from historico.analitica.ventana import VentanaInvalida, crear

# Un dia de 12 h de sol con una fila cada 5 min espera 144 lecturas electricas; con
# una cada 15 s, 2880 de radiacion. Los numeros salen de la cadencia medida (moda de
# los saltos reales entre filas), no de una constante ni de un metadato.
HORAS_SOL = 12.0
CADENCIA_5MIN, CADENCIA_15S, CADENCIA_2S = 300, 15, 2
ESPERADAS_ELECTRICO = 144
ESPERADAS_RADIACION = 2880


def _dia(fecha: date, electrico=ESPERADAS_ELECTRICO, radiacion=ESPERADAS_RADIACION,
         horas_sol=HORAS_SOL, cadencia_electrico=CADENCIA_5MIN,
         cadencia_radiacion=CADENCIA_15S) -> dict:
    """Un renglon del calendario como lo devuelve `_SQL_DIAS`."""
    return {"fecha": fecha, "horas_sol": horas_sol,
            "filas_electrico": electrico, "filas_radiacion": radiacion,
            "cadencia_electrico": cadencia_electrico,
            "cadencia_radiacion": cadencia_radiacion}


def _calendario(inicio: date, n: int, **kw) -> list[dict]:
    return [_dia(inicio + timedelta(days=i), **kw) for i in range(n)]


def test_los_dias_sin_una_sola_fila_siguen_apareciendo_en_la_serie():
    # Given: 5 dias de calendario y los dos del medio sin ninguna lectura.
    dias = _calendario(date(2026, 5, 1), 5)
    dias[2] = _dia(date(2026, 5, 3), electrico=0, radiacion=0, cadencia_electrico=None,
                   cadencia_radiacion=None)
    dias[3] = _dia(date(2026, 5, 4), electrico=0, radiacion=0, cadencia_electrico=None,
                   cadencia_radiacion=None)
    # When
    serie = completitud.serie(dias, "dia", ELECTRICO)
    # Then: la serie tiene los 5 dias porque sale del calendario; una consulta a la
    # tabla de datos solo habria devuelto 3 y el hueco desapareceria del grafico.
    assert len(serie) == 5
    assert serie[2]["lecturas"] == 0
    assert serie[2]["completitud"] == 0.0


def test_electrico_y_radiacion_no_se_funden_en_una_sola_serie():
    # Given: un dia completo para las dos fuentes, cada una a su cadencia.
    dias = _calendario(date(2026, 5, 1), 1)
    # When
    salida = completitud.componer(dias, "dia")
    # Then: cada fuente lleva su cadencia y su conteo; sumarlas escondería que la
    # radiacion se muestreo 20 veces mas seguido ese dia.
    assert salida["series"][ELECTRICO][0]["lecturas"] == ESPERADAS_ELECTRICO
    assert salida["series"][RADIACION][0]["lecturas"] == ESPERADAS_RADIACION
    assert salida["series"][RADIACION][0]["cadencia_seg"] == CADENCIA_15S


def test_la_cadencia_de_referencia_se_mide_y_no_se_supone():
    # Given: mayo 2026 real, donde la radiacion quedo guardada cada 5 min y no cada
    # 15 s (el nombre `radiacion_sc_15s` es el objetivo del resampleo, no lo guardado).
    dias = _calendario(date(2026, 5, 1), 1, radiacion=155, horas_sol=12.4,
                       cadencia_radiacion=CADENCIA_5MIN)
    # When
    punto = completitud.serie(dias, "dia", RADIACION)[0]
    # Then: el dia esta completo. Contra los 15 s nominales habria dado 0,05 y se
    # leeria como perdida catastrofica de datos que nunca se tomaron.
    assert punto["cadencia_seg"] == CADENCIA_5MIN
    assert punto["cadencia_origen"] == MEDIDA
    assert punto["completitud"] == 1.047
    assert completitud.esperadas(12.4, CADENCIA_15S) == 2976   # el objetivo inalcanzable


def test_cadencia_mixta_toma_la_moda_ponderada_por_filas():
    # Given: dos dias de prueba a 2 s con 5 filas cada uno y un dia normal a 5 min
    # con 155. Sin ponderar, la moda seria 2 s por aparecer dos veces.
    dias = [_dia(date(2026, 5, 1), electrico=5, cadencia_electrico=CADENCIA_2S),
            _dia(date(2026, 5, 2), electrico=5, cadencia_electrico=CADENCIA_2S),
            _dia(date(2026, 5, 3), electrico=155, cadencia_electrico=CADENCIA_5MIN)]
    # When
    seg, origen = completitud.cadencia(dias, ELECTRICO)
    # Then: manda donde esta el grueso de las filas, no cuantos dias raros hubo.
    assert (seg, origen) == (CADENCIA_5MIN, MEDIDA)


def test_sin_saltos_medibles_cae_al_nominal_y_lo_deja_marcado():
    # Given: un periodo entero sin filas, o sea sin saltos que medir (ene-abr 2025,
    # el gap largo). Es el unico caso en que se usa la constante del documento.
    dias = _calendario(date(2025, 2, 1), 28, electrico=0, radiacion=0,
                       cadencia_electrico=None, cadencia_radiacion=None)
    # When
    punto = completitud.serie(dias, "mes", ELECTRICO)[0]
    # Then: se usa el objetivo del documento, pero el punto dice que es supuesto.
    assert punto["cadencia_seg"] == completitud.CADENCIA_NOMINAL_SEG[ELECTRICO]
    assert punto["cadencia_origen"] == NOMINAL
    assert punto["completitud"] == 0.0


def test_lo_esperado_sale_de_las_horas_de_sol_y_no_de_las_24_h():
    # Given: un dia de 6 h de sol (el logger solo graba de dia).
    # When
    esperadas = completitud.esperadas(6.0, CADENCIA_5MIN)
    # Then: la mitad de un dia de 12 h, no las 288 lecturas de 24 h.
    assert esperadas == ESPERADAS_ELECTRICO // 2


def test_media_jornada_de_datos_da_media_completitud():
    # Given: un dia que grabo la mitad de las lecturas que le tocaban a su cadencia.
    dias = [_dia(date(2026, 5, 1), electrico=ESPERADAS_ELECTRICO // 2)]
    # When
    resumen = completitud.resumir(dias, ELECTRICO,
                                  completitud.serie(dias, "dia", ELECTRICO))
    # Then: el dia cuenta como "con datos" pero su completitud lo delata.
    assert resumen["dias_con_datos"] == 1
    assert resumen["completitud"] == 0.5


def test_el_resumen_avisa_cuando_el_periodo_mezcla_cadencias():
    # Given: un mes a 2 s y otro a 5 min, agrupados por mes.
    dias = (_calendario(date(2024, 12, 1), 2, electrico=5, cadencia_electrico=CADENCIA_2S)
            + _calendario(date(2026, 5, 1), 2, electrico=155))
    puntos = completitud.serie(dias, "mes", ELECTRICO)
    # When
    resumen = completitud.resumir(dias, ELECTRICO, puntos)
    # Then: sin `cadencias_seg` dos puntos con la misma completitud podrian estar
    # midiendo contra objetivos que difieren en dos ordenes de magnitud.
    assert resumen["cadencias_seg"] == [CADENCIA_2S, CADENCIA_5MIN]
    assert resumen["lecturas_esperadas"] == sum(p["esperadas"] for p in puntos)


def test_separa_el_logger_apagado_de_la_perdida_de_puntos():
    # Given: un mes muestreado muy fino en el que el logger corrio solo 2 de 31 dias.
    dias = (_calendario(date(2024, 12, 1), 2, electrico=1027,
                        cadencia_electrico=CADENCIA_2S)
            + _calendario(date(2024, 12, 3), 29, electrico=0,
                          cadencia_electrico=CADENCIA_2S))
    # When
    punto = completitud.serie(dias, "mes", ELECTRICO)[0]
    # Then: contra el mes entero da casi cero y se lee como perdida masiva, cuando
    # lo que hubo fue un logger apagado 29 dias; contra los dias en que si grabo se
    # ve la perdida real de puntos.
    assert punto["completitud"] < 0.01
    assert punto["completitud_dias_con_datos"] > punto["completitud"] * 10
    assert punto["dias_sin_datos"] == 29


def test_los_huecos_salen_como_tramos_y_no_como_fechas_sueltas():
    # Given: 10 dias con los dias 3 a 7 en cero.
    dias = _calendario(date(2026, 5, 1), 10)
    for i in range(2, 7):
        dias[i] = _dia(date(2026, 5, 1) + timedelta(days=i), electrico=0)
    # When
    tramos = completitud.tramos_sin_datos(dias, ELECTRICO)
    # Then: un tramo con inicio y fin, no cinco fechas sueltas.
    assert tramos == [{"desde": "2026-05-03", "hasta": "2026-05-07", "dias": 5}]


def test_dos_huecos_separados_no_se_funden_en_uno_solo():
    # Given: dos dias vacios con un dia con datos en medio.
    dias = _calendario(date(2026, 5, 1), 3)
    dias[0] = _dia(date(2026, 5, 1), electrico=0)
    dias[2] = _dia(date(2026, 5, 3), electrico=0)
    # When
    tramos = completitud.tramos_sin_datos(dias, ELECTRICO)
    # Then
    assert [t["desde"] for t in tramos] == ["2026-05-01", "2026-05-03"]


def test_un_salto_del_calendario_corta_el_tramo():
    # Given: dos dias vacios que NO son consecutivos en el calendario.
    dias = [_dia(date(2026, 5, 1), electrico=0), _dia(date(2026, 5, 9), electrico=0)]
    # When
    tramos = completitud.tramos_sin_datos(dias, ELECTRICO)
    # Then: reportarlos como un hueco de 9 dias afirmaria algo que no se midio.
    assert len(tramos) == 2
    assert all(t["dias"] == 1 for t in tramos)


def test_agrupa_por_mes_cuando_la_ventana_lo_pide():
    # Given: dos dias de abril y dos de mayo.
    dias = _calendario(date(2026, 4, 29), 4)
    # When
    serie = completitud.serie(dias, "mes", ELECTRICO)
    # Then: un cubo por mes, identificado por su primer dia.
    assert [c["periodo"] for c in serie] == ["2026-04-01", "2026-05-01"]
    assert all(c["dias"] == 2 for c in serie)


def test_la_granularidad_hora_cae_a_dia_porque_el_calendario_es_diario():
    # Given: una ventana corta, para la que `crear` elige granularidad `hora`.
    ventana = crear("2026-05-01", "2026-05-04")
    # When
    salida = completitud.componer(_calendario(date(2026, 5, 1), 3), ventana.granularidad)
    # Then: `ventana_solar` no puede partir un dia, y se dice en vez de disfrazar
    # un cubo diario de horario.
    assert ventana.granularidad == "hora"
    assert salida["granularidad_serie"] == "dia"
    assert salida["granularidad_degradada"] is True


def test_periodo_vacio_no_divide_por_cero_ni_inventa_completitud():
    # Given: una ventana sin ni un dia de calendario.
    # When
    salida = completitud.componer([], "dia")
    # Then
    assert salida["series"][ELECTRICO] == []
    assert salida["resumen"][ELECTRICO]["dias_calendario"] == 0
    assert salida["resumen"][ELECTRICO]["completitud"] is None


def test_un_dia_sin_horas_de_sol_no_inventa_completitud():
    # Given: un dia del calendario sin horas de sol registradas (dato roto).
    dias = [_dia(date(2026, 5, 1), electrico=0, radiacion=0, horas_sol=0.0)]
    # When
    resumen = completitud.resumir(dias, ELECTRICO,
                                  completitud.serie(dias, "dia", ELECTRICO))
    # Then: sin nada que esperar la razon no existe; 0/0 no es 0% ni 100%.
    assert resumen["lecturas_esperadas"] == 0
    assert resumen["completitud"] is None


def test_una_ventana_invertida_se_rechaza_en_el_contrato_antes_de_consultar():
    # Given / When / Then: la validacion vive en `ventana.crear`, no aca.
    with pytest.raises(VentanaInvalida) as error:
        crear("2026-05-09", "2026-05-01")
    assert error.value.codigo == "rango_vacio"
