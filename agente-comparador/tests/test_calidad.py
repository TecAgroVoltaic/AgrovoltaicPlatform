"""Pruebas de la POLITICA de deteccion: dada la estadistica de un dia, que hallazgos salen.

Se prueba `_hallazgos_del_dia` directo, sin DB: es donde vive la decision de que
cuenta como problema y con que gravedad, o sea lo que de verdad se puede discutir
con el equipo. La estadistica en si es SQL y se verifica corriendola.
"""
from __future__ import annotations

import json
from datetime import date

import pytest

from comparador import config
from comparador.calidad import _hallazgos_del_dia

FECHA = date(2026, 3, 15)


def _dia(**kw):
    """Un dia sano del regimen de 5 min: 12 h de sol cubiertas de punta a punta."""
    base = dict(fecha=FECHA, filas=144, ts_distintos=144, cadencia=300.0,
                primera="2026-03-15T05:45:00+00:00", ultima="2026-03-15T17:45:00+00:00",
                n_huecos=0, hueco_max=0, horas_sol=12.0, horas_cubiertas=12.0)
    base.update(kw)
    return base


def _tipos(hallazgos):
    return {h[3] for h in hallazgos}


def _por_tipo(hallazgos, tipo):
    return next(h for h in hallazgos if h[3] == tipo)


def test_un_dia_sano_no_genera_hallazgos():
    assert _hallazgos_del_dia("radiacion_sc_15s", _dia(), {}, None) == []


def test_timestamps_repetidos_son_grave_y_cuentan_cuantos():
    h = _hallazgos_del_dia("radiacion_sc_15s", _dia(filas=150, ts_distintos=144), {}, None)
    dup = _por_tipo(h, "duplicado_timestamp")
    assert dup[4] == "grave"
    assert dup[5] == 6


def test_un_dia_con_dos_lecturas_se_marca_y_no_se_sigue_analizando():
    # Sin muestras suficientes la cadencia no es fiable: seguir seria inventar.
    h = _hallazgos_del_dia("radiacion_sc_15s", _dia(filas=2, ts_distintos=2), {}, None)
    assert _tipos(h) == {"dia_incompleto"}
    assert json.loads(h[0][6])["motivo"] == "muy pocas muestras"


def test_cobertura_baja_marca_el_dia_incompleto():
    # Grabo 6 de las 12 horas de sol: arranco tarde o se cayo a media tarde.
    h = _hallazgos_del_dia("radiacion_sc_15s", _dia(horas_cubiertas=6.0, filas=72), {}, None)
    inc = _por_tipo(h, "dia_incompleto")
    assert json.loads(inc[6])["motivo"] == "cobertura solar baja"
    assert json.loads(inc[6])["cobertura"] == 0.5


def test_cobertura_muy_baja_es_grave_y_la_intermedia_solo_aviso():
    grave = _por_tipo(_hallazgos_del_dia(
        "radiacion_sc_15s", _dia(horas_cubiertas=3.0, filas=36), {}, None), "dia_incompleto")
    aviso = _por_tipo(_hallazgos_del_dia(
        "radiacion_sc_15s", _dia(horas_cubiertas=8.0, filas=96), {}, None), "dia_incompleto")
    assert grave[4] == "grave"
    assert aviso[4] == "aviso"


def test_dia_largo_pero_agujereado_se_detecta_por_densidad():
    # Cobertura perfecta (12 h de punta a punta) pero con la mitad de las muestras.
    # Es justo el caso que una sola metrica de completitud no ve.
    h = _hallazgos_del_dia("radiacion_sc_15s", _dia(filas=72, ts_distintos=72), {}, None)
    assert "dia_incompleto" not in _tipos(h)
    hueco = _por_tipo(h, "hueco")
    assert json.loads(hueco[6])["presentes"] == 72
    assert json.loads(hueco[6])["esperadas"] == 145


def test_cambio_de_cadencia_se_reporta_solo_cuando_cambia():
    igual = _hallazgos_del_dia("radiacion_sc_15s", _dia(), {}, 300.0)
    distinto = _hallazgos_del_dia("radiacion_sc_15s", _dia(), {}, 60.0)
    assert "cambio_de_cadencia" not in _tipos(igual)
    assert "cambio_de_cadencia" in _tipos(distinto)


def test_valores_fuera_del_rango_fisico_son_graves():
    cols = {"irradiancia_incidente__n": 144, "irradiancia_incidente__rango": 7,
            "irradiancia_incidente__sd": 300.0}
    h = _hallazgos_del_dia("radiacion_sc_15s", _dia(), cols, None)
    fuera = _por_tipo(h, "fuera_de_rango")
    assert fuera[2] == "irradiancia_incidente"
    assert fuera[4] == "grave"
    assert fuera[5] == 7


def test_sensor_trabado_se_detecta_por_desviacion_cero():
    # Clavado todo el dia en 42,5: ni el 85 del DS18B20 ni un cero. Eso si es un
    # sensor trabado, y el hallazgo tiene que decir en que valor se quedo.
    cols = {"temp_vertical__n": 144, "temp_vertical__sd": 0.0, "temp_vertical__min": 42.5}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    plano = _por_tipo(h, "sensor_plano")
    assert plano[4] == "grave"
    assert json.loads(plano[6])["valor_constante"] == 42.5


def test_un_sensor_con_pocas_lecturas_no_se_declara_trabado():
    # Con 3 lecturas iguales no se puede afirmar que este trabado.
    cols = {"temp_vertical__n": 3, "temp_vertical__sd": 0.0, "temp_vertical__min": 42.5}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    assert "sensor_plano" not in _tipos(h)


def test_una_serie_clavada_en_85_no_se_reporta_dos_veces():
    # 85 constante es el DS18B20 desconectado. `saturado_85` lo dice con nombre y
    # causa; agregarle `sensor_plano` encima seria ruido sobre el mismo hecho.
    cols = {"temp_inclinado__n": 144, "temp_inclinado__sd": 0.0,
            "temp_inclinado__min": 85.0, "temp_inclinado__sat": 144,
            "temp_inclinado__rango": 144}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    assert "saturado_85" in _tipos(h)
    assert "sensor_plano" not in _tipos(h)


def test_una_serie_clavada_en_cero_no_es_un_sensor_roto():
    # Todas las variables electricas en 0 todo el dia significa que el inversor no
    # genero. Es un hecho operativo real y merece aviso, no el "grave" de un sensor
    # averiado: el sensor funciona perfecto, lo que no hubo fue produccion.
    cols = {"potencia_pv1_w__n": 144, "potencia_pv1_w__sd": 0.0, "potencia_pv1_w__min": 0.0}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    cero = _por_tipo(h, "constante_en_cero")
    assert cero[4] == "aviso"
    assert "sensor_plano" not in _tipos(h)


def test_una_columna_entera_en_null_es_esquema_no_datos_faltantes():
    # Si TODAS las filas del dia tienen la columna en NULL, no es que se perdieron
    # lecturas: es que esa columna no vino en el CSV. Se arregla en el mapeo del
    # ETL, no en el sensor, y por eso lleva otro nombre.
    cols = {"frecuencia_hz__n": 0, "frecuencia_hz__nulos": 144}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    assert "columna_ausente" in _tipos(h)
    assert "nulos" not in _tipos(h)


def test_nulos_parciales_siguen_siendo_solo_nulos():
    cols = {"frecuencia_hz__n": 100, "frecuencia_hz__nulos": 44, "frecuencia_hz__sd": 0.1}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    assert _por_tipo(h, "nulos")[4] == "info"
    assert "columna_ausente" not in _tipos(h)


def test_el_85_del_ds18b20_se_reporta_aparte_del_rango():
    # 85.0 cae fuera del rango 10-80, pero merece su propio tipo: no es "un valor
    # raro", es la firma de un sensor desconectado.
    cols = {"temp_inclinado__n": 144, "temp_inclinado__sd": 5.0,
            "temp_inclinado__rango": 20, "temp_inclinado__sat": 20}
    h = _hallazgos_del_dia("monitoreo_sc_electrico", _dia(), cols, None)
    assert {"fuera_de_rango", "saturado_85"} <= _tipos(h)
    assert _por_tipo(h, "saturado_85")[5] == 20


def test_el_offset_nocturno_es_info_y_no_invalida_el_dia():
    cols = {"irradiancia_incidente__n": 144, "irradiancia_incidente__sd": 300.0,
            "irradiancia_incidente__offset": 40}
    h = _hallazgos_del_dia("radiacion_sc_15s", _dia(), cols, None)
    off = _por_tipo(h, "offset_nocturno")
    assert off[4] == "info"
    assert off[5] == 40


def test_los_umbrales_son_configurables(monkeypatch):
    # Con el umbral por defecto (0.80) una cobertura de 0.85 pasa; subiendolo, no.
    dia = _dia(horas_cubiertas=10.2, filas=122)
    assert "dia_incompleto" not in _tipos(_hallazgos_del_dia("radiacion_sc_15s", dia, {}, None))
    monkeypatch.setattr(config, "COBERTURA_MINIMA", 0.95)
    assert "dia_incompleto" in _tipos(_hallazgos_del_dia("radiacion_sc_15s", dia, {}, None))


def test_fuente_desconocida_falla_fuerte():
    from comparador.calidad import barrer
    with pytest.raises(ValueError, match="fuente desconocida"):
        barrer(FECHA, FECHA, fuentes=("tabla_que_no_existe",))
