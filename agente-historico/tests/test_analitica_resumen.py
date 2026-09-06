"""Pruebas de los 9 KPIs del dashboard (Fig. 2).

Se prueban las funciones PURAS directo, sin base de datos: ahi vive el criterio
(frescura, ventana de 7 dias, energia ausente contra energia cero, anualizacion).
Prioridad a los casos limite y de fallo, que son los que este dataset tiene de
verdad: 4 meses de columnas AC en NULL y un sistema que dejo de reportar en junio.

ACTUALIZADO 2026-08-31 (R7 de Leo Cardinale): la casilla de energia total del
tablero ya NO es la integral de la potencia DC. Es la energia ALTERNA leida del
contador `energia_hoy_wh` del inversor, y por eso los casos de energia total de
este archivo se prueban contra `total_ac_kwh`. Las casillas por arreglo siguen
siendo DC integrada, porque el inversor no reporta AC por arreglo.
"""
from __future__ import annotations

from datetime import date

import pytest

from historico import db
from historico.analitica import energia, resumen
from historico.analitica.resultado import COLUMNA_AUSENTE, SIN_LECTURAS
from historico.analitica.ventana import VentanaInvalida, crear
from historico.calidad import contexto

ULTIMO_REAL = "2026-06-01T11:55:00+00:00"   # ultimo dato del tramo may-jun 2026
HOY = date(2026, 8, 28)

# El estado REAL de la base: sigue entrando dato. Lo de abajo existe porque el
# tablero llego a decir "detenida, 92 dias sin reportar" teniendo dato de ayer, solo
# porque se le pidio un rango que terminaba en junio.
ULTIMO_GLOBAL = "2026-08-31T17:55:00+00:00"
HOY_CON_DATO_DE_AYER = date(2026, 9, 1)

# Cifras reales del historico completo, medidas contra produccion.
DIAS_CALENDARIO = 569
DIAS_CON_DATOS = 274
KWH_INCLINADO_HISTORICO = 921.02


def _dia(fecha="2026-06-01", ac_cierre=6.65, n_ac=144, w_inclinado=17040.0,
         w_vertical=8520.0, n_potencia=144, filas=144) -> dict:
    """Un renglon diario como el que devuelve `analitica.energia.por_dia`."""
    return {"dia": fecha, "ac_cierre": ac_cierre, "n_ac": n_ac,
            "vida_primero": None, "vida_ultimo": None, "n_vida": 0,
            "dc_cierre_inclinado": None, "dc_cierre_vertical": None,
            "n_dc_inclinado": 0, "n_dc_vertical": 0,
            "w_inclinado": w_inclinado, "w_vertical": w_vertical,
            "n_potencia_inclinado": n_potencia, "n_potencia_vertical": n_potencia,
            "filas": filas}


def _energias(dias: list[dict]) -> dict:
    return resumen.energias(dias, energia.resumir(dias))


def test_frescura_marca_alarma_cuando_el_sistema_dejo_de_reportar():
    # Given: el ultimo dato es del 2026-06-01 y hoy es el 2026-08-28.
    # When
    frescura = resumen.evaluar_frescura(ULTIMO_REAL, HOY)
    # Then: 88 dias no es un dato neutro, es una alarma con su umbral a la vista.
    assert frescura["antiguedad_dias"] == 88
    assert frescura["estado"] == resumen.DETENIDA
    assert frescura["alarmante"] is True
    assert frescura["umbral_alarmante_dias"] == resumen.DIAS_ANTIGUEDAD_ALARMANTE


def test_frescura_cambia_de_estado_en_los_bordes_de_sus_umbrales():
    # Given: un dia justo en cada borde de los dos umbrales con nombre.
    tolerable = date(2026, 6, 1 + resumen.DIAS_ANTIGUEDAD_TOLERABLE)
    ultimo_rezagado = date(2026, 6, resumen.DIAS_ANTIGUEDAD_ALARMANTE)
    alarmante = date(2026, 6, 1 + resumen.DIAS_ANTIGUEDAD_ALARMANTE)
    # When / Then: el borde inferior todavia es normal y el superior ya es alarma.
    assert resumen.evaluar_frescura(ULTIMO_REAL, tolerable)["estado"] == resumen.AL_DIA
    assert resumen.evaluar_frescura(ULTIMO_REAL, ultimo_rezagado)["estado"] == resumen.REZAGADA
    assert resumen.evaluar_frescura(ULTIMO_REAL, alarmante)["estado"] == resumen.DETENIDA


def test_frescura_sin_ninguna_lectura_no_finge_estar_al_dia():
    # Given: la ventana no tiene una sola lectura del inversor.
    # When
    frescura = resumen.evaluar_frescura(None, HOY)
    # Then: sin dato no es "al dia", es su propio estado y tambien alarma.
    assert frescura["estado"] == resumen.SIN_DATOS
    assert frescura["alarmante"] is True
    assert frescura["antiguedad_dias"] is None


# ── La frescura es del SISTEMA, no del rango que se mira ─────────────────────
def _tablero(monkeypatch, ventana, ultimo_en_ventana, dias=None,
             ultimo_global=ULTIMO_GLOBAL, hoy=HOY_CON_DATO_DE_AYER):
    """`calcular` con la base doblada: la ventana devuelve un dato y la base otro.

    Se dobla `db.uno` y no una funcion con nombre nuevo a proposito: asi la prueba no
    sabe COMO se pide cada cosa, solo que la consulta CON rango (la que lleva
    parametros) es la del periodo y la que va sin rango es la del sistema. Esa es la
    unica diferencia que importa y es justo la que se habia perdido.
    """
    monkeypatch.setattr(db, "uno", lambda sql, params=(): {
        "ultimo": ultimo_en_ventana if params else ultimo_global})
    monkeypatch.setattr(energia, "por_dia",
                        lambda v: [_dia()] if dias is None else list(dias))
    monkeypatch.setattr(contexto, "confianza", lambda *a, **k: {"dias_con_datos": 1})
    return resumen.calcular(ventana, hoy=hoy)


def test_la_frescura_no_reporta_sistema_caido_por_mirar_un_rango_historico(monkeypatch):
    # Given: la base tiene dato de ayer, y se pide el rango que disparaba el defecto
    # (mayo 2026), cuyo ultimo registro es del 2026-06-01.
    # When
    salida = _tablero(monkeypatch, crear("2026-05-03", "2026-06-02"), ULTIMO_REAL)
    # Then: la planta esta reportando. Acotada al rango, esta casilla decia
    # "detenida, 92 dias sin reportar" y con ese texto se reporto una averia que no
    # existia: cualquier ventana que no toque el presente la disparaba.
    assert salida["actualizacion"]["estado"] == resumen.AL_DIA
    assert salida["actualizacion"]["alarmante"] is False
    assert salida["actualizacion"]["ultimo_dato"] == ULTIMO_GLOBAL
    assert salida["actualizacion"]["mensaje"] is None


def test_un_rango_dentro_de_un_gap_tampoco_declara_al_sistema_caido(monkeypatch):
    # Given: enero 2025, dentro del gap de 126 dias: la ventana no tiene ni una fila.
    # When
    salida = _tablero(monkeypatch, crear("2025-01-01", "2025-02-01"), None, dias=[])
    # Then: el hueco es del PERIODO. El sistema sigue al dia y no hay alarma, que es
    # lo contrario de lo que decia antes ("sin_datos", alarmante).
    assert salida["actualizacion"]["estado"] == resumen.AL_DIA
    assert salida["actualizacion"]["alarmante"] is False
    assert salida["ultimo_dato_del_periodo"]["ultimo_dato"] is None


def test_el_ultimo_dato_de_la_ventana_se_informa_aparte_y_sin_alarma(monkeypatch):
    # Given: el mismo rango de mayo 2026.
    # When
    salida = _tablero(monkeypatch, crear("2026-05-03", "2026-06-02"), ULTIMO_REAL)
    # Then: quien mira mayo puede saber que su ventana termina el 1 de junio, pero
    # sin un solo campo con forma de semaforo que se pueda pintar como alarma.
    periodo = salida["ultimo_dato_del_periodo"]
    assert periodo["ultimo_dato"] == ULTIMO_REAL
    assert not {"estado", "alarmante", "antiguedad_dias"} & set(periodo)


def test_los_7_dias_siguen_al_dato_de_la_ventana_y_no_a_la_frescura_global(monkeypatch):
    # Given: el mismo rango, con la base tres meses mas adelante que la ventana.
    # When
    salida = _tablero(monkeypatch, crear("2026-05-03", "2026-06-02"), ULTIMO_REAL)
    # Then: los KPIs de 7 dias describen el PERIODO. Contarlos contra el ultimo dato
    # global los sacaria de la ventana pedida y saldrian los tres vacios.
    assert salida["ventana_reciente"] == {"desde": "2026-05-26", "hasta": "2026-06-02",
                                          "dias": 7, "granularidad": "dia"}
    assert salida["energia_reciente"]["total_ac_kwh"]["valor"] == pytest.approx(6.65)


def test_la_frescura_da_lo_mismo_mire_el_rango_que_mire(monkeypatch):
    # Given: los cuatro rangos de la verificacion (historico viejo, el que fallaba,
    # el historico completo y sin rango), cada uno con su propio ultimo dato.
    rangos = [(crear("2025-01-01", "2025-02-01"), None),
              (crear("2026-05-03", "2026-06-02"), ULTIMO_REAL),
              (crear("2024-11-10", "2026-09-02"), ULTIMO_GLOBAL),
              (crear(), ULTIMO_GLOBAL)]
    # When
    frescuras = [_tablero(monkeypatch, v, u)["actualizacion"] for v, u in rangos]
    # Then: es la MISMA pregunta, asi que tiene que dar la misma respuesta. Si esta
    # falla, alguien volvio a acotar la frescura a la ventana.
    assert all(f == frescuras[0] for f in frescuras)
    assert frescuras[0]["alarmante"] is False


def test_periodo_sin_ni_una_fila_da_none_con_motivo_y_jamas_cero():
    # Given: un periodo vacio (ni filas ni lecturas).
    # When
    energias = _energias([])
    # Then: un cero aqui afirmaria que el sistema no genero, que es falso.
    assert energias["total_ac_kwh"]["valor"] is None
    assert energias["total_ac_kwh"]["motivo"] == SIN_LECTURAS
    assert energias["inclinado_kwh"]["valor"] is None


def test_columna_vacia_se_distingue_de_no_haber_filas():
    # Given: noviembre 2024, que tiene AC y cero DC: hay filas, pero las columnas
    # de potencia de los arreglos vinieron NULL.
    dias = [_dia("2024-11-10", n_potencia=0, filas=174)]
    # When
    energias = _energias(dias)
    # Then: el motivo separa "no hubo datos" de "la columna no vino en el CSV".
    assert energias["inclinado_kwh"]["valor"] is None
    assert energias["inclinado_kwh"]["motivo"] == COLUMNA_AUSENTE
    # Y el total AC, que si existe en noviembre 2024, se sigue reportando.
    assert energias["total_ac_kwh"]["valor"] == pytest.approx(6.65)


def test_el_total_del_tablero_es_ac_de_contador_y_no_la_suma_de_los_arreglos():
    # Given: un dia con 6,65 kWh de cierre AC y 25.560 W sumados entre los dos
    # arreglos, que integrados a 5 min dan 2,13 kWh de DC.
    dias = [_dia()]
    # When
    energias = _energias(dias)
    # Then: R7 manda. El total es el contador AC del inversor, no la integral DC,
    # y los dos numeros conviven porque miden cosas distintas.
    assert energias["total_ac_kwh"]["valor"] == pytest.approx(6.65)
    assert energias["inclinado_kwh"]["valor"] == pytest.approx(1.42)
    assert energias["vertical_kwh"]["valor"] == pytest.approx(0.71)


def test_el_tablero_ac_tiene_dato_entre_noviembre_2025_y_febrero_2026():
    # Given: los cuatro meses en que `potencia_total_wac` y `energia_total_wh`
    # estan al 100% en NULL. Hasta hoy el tablero mostraba ahi un hueco.
    dias = [_dia(f"2025-12-{d:02d}", ac_cierre=5.0) for d in range(1, 5)]
    # When
    energias = _energias(dias)
    # Then: `energia_hoy_wh` cubre esa ventana (13.922 lecturas en 118 dias) y la
    # casilla se llena con energia AC real.
    assert energias["total_ac_kwh"]["valor"] == pytest.approx(20.0)
    assert "motivo" not in energias["total_ac_kwh"]      # hay dato, no hay excusa
    # Y el respaldo es real: 144 lecturas por dia sostienen el numero.
    assert energias["total_ac_kwh"]["n"] == 4 * 144


def test_los_ultimos_7_dias_se_cuentan_contra_el_ultimo_dia_con_datos():
    # Given: todo el historico y un ultimo dato del 2026-06-01.
    ventana = crear("2024-11-10", "2026-08-28")
    # When
    reciente = resumen.ventana_reciente(ventana, ULTIMO_REAL)
    # Then: contra hoy los tres KPIs de 7 dias saldrian en cero; contra el ultimo
    # dia con datos el tramo incluye el 2026-06-01 (el fin es exclusivo).
    assert (reciente.desde, reciente.hasta) == (date(2026, 5, 26), date(2026, 6, 2))
    assert reciente.dias == resumen.DIAS_VENTANA_RECIENTE


def test_la_ventana_reciente_no_se_sale_de_la_ventana_pedida():
    # Given: una ventana de 3 dias mas corta que los 7 del KPI.
    ventana = crear("2026-05-30", "2026-06-05")
    # When
    reciente = resumen.ventana_reciente(ventana, ULTIMO_REAL)
    # Then: se recorta por la izquierda en vez de inventar dias fuera del pedido.
    assert (reciente.desde, reciente.hasta) == (date(2026, 5, 30), date(2026, 6, 2))


def test_el_tramo_reciente_se_recorta_de_los_mismos_dias_del_periodo():
    # Given: los siete ultimos dias reales del historico, con sus cierres, mas un
    # dia viejo que NO tiene que entrar.
    cierres = {"2026-05-26": 6.7, "2026-05-27": 3.3, "2026-05-28": 3.9,
               "2026-05-29": 4.0, "2026-05-30": 10.2, "2026-05-31": 6.3,
               "2026-06-01": 3.6}
    dias = [_dia("2026-01-15", ac_cierre=99.0)] + [
        _dia(f, ac_cierre=v) for f, v in cierres.items()]
    reciente = resumen.ventana_reciente(crear("2024-11-10", "2026-08-28"), ULTIMO_REAL)
    # When
    recortado = resumen.tramo(dias, reciente)
    # Then: entran los siete y solo los siete. El recorte es en memoria, sobre la
    # misma consulta que el periodo: dos viajes con dos filtros distintos serian
    # dos oportunidades de que los dos totales dejen de ser comparables.
    assert [d["dia"] for d in recortado] == sorted(cierres)
    assert _energias(recortado)["total_ac_kwh"]["valor"] == pytest.approx(38.0)


def test_sin_ultimo_dato_no_hay_tramo_reciente_y_tampoco_un_cero():
    # Given: una ventana sin ninguna lectura, asi que no hay contra que contar.
    # When
    recortado = resumen.tramo([_dia()], None)
    # Then: el tramo es vacio y su energia sale ausente, no en cero.
    assert recortado == []
    assert _energias(recortado)["total_ac_kwh"]["valor"] is None


def test_el_anualizado_se_normaliza_por_dias_con_datos_y_no_por_calendario():
    # Given: la energia real del arreglo inclinado en todo el historico, que tiene
    # 569 dias de calendario y solo 274 con datos.
    energia_arreglo = {"valor": KWH_INCLINADO_HISTORICO, "n": 34363, "unidad": "kWh"}
    # When
    sobre_datos = resumen.rendimiento(energia_arreglo, DIAS_CON_DATOS)
    sobre_calendario = resumen.rendimiento(energia_arreglo, DIAS_CALENDARIO)
    # Then: 864 contra 416. Los 295 dias que faltan son un hueco de LOGGING, no de
    # generacion: dividir por calendario castiga a la planta por el datalogger.
    assert sobre_datos["anualizado_sobre_dias_con_datos_kwh_kwp_ano"]["valor"] == 864.0
    assert sobre_calendario["anualizado_sobre_dias_con_datos_kwh_kwp_ano"]["valor"] == 416.1


def test_rendimiento_especifico_reporta_el_acumulado_ademas_del_anual():
    # Given: la misma energia del arreglo inclinado (1,42 kWp).
    energia_arreglo = {"valor": KWH_INCLINADO_HISTORICO, "n": 34363, "unidad": "kWh"}
    # When
    rendimiento = resumen.rendimiento(energia_arreglo, DIAS_CON_DATOS)
    # Then: el documento deja abierta la unidad, asi que salen las dos con nombre.
    assert rendimiento["periodo_kwh_kwp"]["valor"] == 648.61
    assert rendimiento["periodo_kwh_kwp"]["unidad"] == "kWh/kWp"
    assert rendimiento["anualizado_sobre_dias_con_datos_kwh_kwp_ano"]["unidad"] == "kWh/kWp/ano"


def test_rendimiento_sin_energia_ni_dias_con_datos_no_inventa_un_cero():
    # Given: una energia ausente y, aparte, un periodo sin un solo dia con datos.
    ausente = {"valor": None, "n": 0, "unidad": "kWh", "motivo": COLUMNA_AUSENTE}
    # When
    sin_energia = resumen.rendimiento(ausente, DIAS_CON_DATOS)
    sin_dias = resumen.rendimiento({"valor": 142.0, "n": 100, "unidad": "kWh"}, 0)
    # Then: ninguno de los dos puede dividir, y ninguno devuelve cero.
    assert sin_energia["periodo_kwh_kwp"]["valor"] is None
    assert sin_energia["periodo_kwh_kwp"]["motivo"] == COLUMNA_AUSENTE
    assert sin_dias["anualizado_sobre_dias_con_datos_kwh_kwp_ano"]["valor"] is None


def test_componer_arma_los_nueve_kpis_de_un_solo_dia():
    # Given: un unico dia con datos.
    dias = [_dia()]
    # When
    kpis = resumen.componer(ULTIMO_REAL, ULTIMO_REAL, dias, dias, 1, HOY)
    # Then: las 9 casillas estan y el anualizado extrapola ese unico dia.
    assert kpis["dias_con_datos"] == 1
    assert kpis["actualizacion"]["estado"] == resumen.DETENIDA
    assert kpis["energia_periodo"]["total_ac_kwh"]["valor"] == pytest.approx(6.65)
    assert kpis["energia_reciente"]["inclinado_kwh"]["valor"] == pytest.approx(1.42)
    assert kpis["rendimiento_especifico"]["vertical"][
        "anualizado_sobre_dias_con_datos_kwh_kwp_ano"]["valor"] == 182.5


def test_componer_incluye_las_dos_energias_ac_y_el_control_de_r7():
    # Given: el mismo dia unico.
    dias = [_dia()]
    # When
    kpis = resumen.componer(ULTIMO_REAL, ULTIMO_REAL, dias, dias, 1, HOY)
    # Then: el bloque AC viaja entero. "Cuanto registramos" y "cuanto produjo la
    # planta" son preguntas distintas y ninguna se esconde, y el control AC/DC va
    # en el payload para poder mirarlo sin correr la suite.
    ac = kpis["energia_ac"]
    assert ac["registrada_kwh"]["valor"] == pytest.approx(6.65)
    assert set(ac["significado"]) == {"registrada_kwh", "planta_kwh", "no_registrada_kwh"}
    assert "coherencia_ac_dc" in ac


def test_una_ventana_invertida_se_rechaza_en_el_contrato_antes_de_calcular():
    # Given / When / Then: la validacion vive en `ventana.crear`, no aca; el KPI
    # nunca recibe una ventana imposible.
    with pytest.raises(VentanaInvalida) as error:
        crear("2026-06-05", "2026-06-01")
    assert error.value.codigo == "rango_vacio"
