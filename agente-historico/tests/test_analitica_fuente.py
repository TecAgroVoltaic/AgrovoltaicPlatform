"""Pruebas de la resolucion de fuente: donde vive cada variable y cuanto pesa su fila.

Tres cosas se prueban aca, y las tres son modos de fallo SILENCIOSOS: ninguna
revienta, todas devuelven un numero con buena cara.

  1. Que el peso temporal de una lectura sea el salto real ACOTADO. Sin techo, la
     ultima fila del atardecer se integra como doce horas de sol.
  2. Que la variable se resuelva siempre contra la vista corregida.
  3. Que los nombres que llegan a `contexto.confianza` sean los que
     `hallazgos_calidad` conoce. Pasar la clave del catalogo encontraba cero
     hallazgos de los 321 reales y devolvia una confianza impecable.
"""
from __future__ import annotations

from datetime import date

import pytest

from historico.analitica import catalogo, fuente
from historico.analitica.ventana import DIA, HORA, MES, SEMANA, Ventana, VentanaInvalida


# ── El peso temporal de una lectura ──────────────────────────────────────────

def test_cada_lectura_pesa_su_salto_real_aunque_la_cadencia_cambie():
    # Given los saltos reales que conviven en la tabla de radiacion segun la epoca
    saltos = [15, 30, 45, 60, 75, 300, 315, 330]
    # When se pesa cada uno
    pesos = [fuente.peso_temporal(s) for s in saltos]
    # Then ninguno se toca: la cadencia varia y el peso la sigue
    assert pesos == [15.0, 30.0, 45.0, 60.0, 75.0, 300.0, 315.0, 330.0]


def test_el_salto_nocturno_queda_acotado_por_el_techo():
    # Given el salto mas grande medido en la base: toda la noche entre dos jornadas
    salto_nocturno = 43_800
    # When se pesa
    peso = fuente.peso_temporal(salto_nocturno)
    # Then cuenta como el techo, no como doce horas de irradiancia
    assert peso == float(fuente.TECHO_SALTO_SEG)
    assert peso < salto_nocturno


def test_el_salto_nocturno_acotado_no_domina_el_total_del_dia():
    # Given un dia de 11 lecturas a 300 s y una ultima cuyo salto es la noche entera
    jornada = [fuente.peso_temporal(300) for _ in range(11)]
    atardecer = fuente.peso_temporal(43_800)
    # When se suma la cobertura del dia
    total = sum(jornada) + atardecer
    # Then la jornada real pesa mas que el hueco: sin techo el hueco seria el 93 %
    assert sum(jornada) / total > 0.75
    assert 43_800 / (sum(jornada) + 43_800) > 0.9   # lo que pasaria sin acotar


def test_la_ultima_fila_de_la_ventana_no_inventa_cobertura():
    # Given la ultima lectura, que no tiene salto siguiente
    # When se pesa
    # Then no aporta: no se sabe cuanto cubrio y no se supone
    assert fuente.peso_temporal(None) == 0.0


def test_el_sql_acota_el_salto_en_vez_de_ampliarlo():
    # Given la subconsulta que pesa cada lectura
    sql = fuente.lecturas_pesadas(fuente.origen("irradiancia_incidente_wm2"))
    # Then usa el salto real al siguiente registro, acotado por arriba con el techo
    assert 'lead("timestamp") OVER (ORDER BY "timestamp")' in sql
    assert "least(" in sql and str(fuente.TECHO_SALTO_SEG) in sql
    assert "greatest(" not in sql          # acotar por abajo ampliaria el hueco
    assert "intervalo_original_seg" not in sql   # el metadato miente, no se usa


# ── La allowlist que protege el SQL ──────────────────────────────────────────

def test_una_variable_desconocida_no_llega_al_sql():
    # Given una clave que no esta en el catalogo
    with pytest.raises(catalogo.VariableDesconocida):
        fuente.origen("potencia_pv1_w; DROP TABLE monitoreo_sc_electrico")


def test_una_variable_sin_fuente_falla_diciendo_por_que():
    # Given una variable que el documento pide y la base no tiene
    with pytest.raises(fuente.FuenteAusente) as exc:
        fuente.origen("humedad_relativa_pct")
    # Then el error explica el hueco en vez de devolver una serie vacia muda
    assert exc.value.codigo == "fuente_ausente"
    assert "ninguna tabla" in str(exc.value)


def test_lo_electrico_nunca_se_lee_de_la_tabla_cruda():
    # La cruda tiene 26.503.162 W de potencia en un arreglo de 1.420 Wp.
    assert fuente.origen("potencia_pv1_w").relacion == "v_sc_electrico_corregido"


def test_la_radiacion_se_lee_filtrada_por_validez_y_qc():
    # Given una variable de irradiancia
    o = fuente.origen("irradiancia_incidente_wm2")
    # Then sin este filtro entrarian los valores previos a julio 2025, descartados
    assert o.relacion == "v_sc_radiacion_calibrada"
    assert "valido" in o.filtro and "qc_ok" in o.filtro


# ── La rejilla de buckets ────────────────────────────────────────────────────

def test_la_rejilla_de_un_dia_por_hora_tiene_24_buckets():
    # Given una ventana de un solo dia pedida por hora
    buckets = fuente.rejilla(Ventana(date(2026, 3, 1), date(2026, 3, 2), HORA))
    # Then hay una hora local por columna, de la 0 a la 23
    assert len(buckets) == 24
    assert buckets[0].hour == 0 and buckets[-1].hour == 23


def test_la_rejilla_mensual_avanza_de_primero_a_primero():
    # Given una ventana que arranca a mitad de mes
    buckets = fuente.rejilla(Ventana(date(2026, 1, 15), date(2026, 4, 1), MES))
    # Then el bucket es el mes entero que la contiene, y el fin es exclusivo
    assert [t.strftime("%Y-%m-%d") for t in buckets] == ["2026-01-01", "2026-02-01",
                                                         "2026-03-01"]


def test_la_rejilla_semanal_arranca_en_lunes_como_date_trunc():
    # Given una ventana que empieza un miercoles
    buckets = fuente.rejilla(Ventana(date(2026, 3, 4), date(2026, 3, 18), SEMANA))
    # Then el primer bucket es el lunes anterior, para coincidir con date_trunc('week')
    assert buckets[0].strftime("%Y-%m-%d") == "2026-03-02"


def test_una_ventana_demasiado_fina_se_rechaza_antes_de_consultar():
    # Given todo el historico pedido por hora (~13.000 puntos)
    with pytest.raises(VentanaInvalida) as exc:
        fuente.validar_tamano(Ventana(date(2024, 11, 10), date(2026, 6, 1), HORA))
    # Then se rechaza con codigo, sin haber tocado la base
    assert exc.value.codigo == "ventana_demasiado_fina"


# ── Los nombres con que se pide la confianza ─────────────────────────────────

def _espiar_confianza(monkeypatch) -> dict:
    """Given: `contexto.confianza` reemplazado para ver con que lo llaman."""
    visto = {}

    def _falso(desde, hasta, variables, fuente_):
        visto.update(desde=desde, hasta=hasta, variables=variables, fuente=fuente_)
        return {"dias_utilizables": 0, "advertencia": None}

    monkeypatch.setattr(fuente.contexto, "confianza", _falso)
    return visto


def test_la_irradiancia_pide_sus_hallazgos_con_el_nombre_CRUDO(monkeypatch):
    # Given la clave del catalogo, que no es la que guarda `hallazgos_calidad`
    visto = _espiar_confianza(monkeypatch)
    v = Ventana(date(2026, 3, 1), date(2026, 4, 1), DIA)
    # When se pide la confianza
    fuente.confianza_de(v, ["irradiancia_incidente_wm2"])
    # Then llega traducida: con `..._wm2` encontraba 0 hallazgos de los 321 reales
    assert visto["variables"] == ["irradiancia_incidente"]
    assert visto["fuente"] == "radiacion_sc_15s"
    assert (visto["desde"], visto["hasta"]) == ("2026-03-01", "2026-04-01")


def test_variables_de_dos_tablas_no_fuerzan_una_sola_fuente(monkeypatch):
    # Given un cruce de irradiancia contra potencia
    visto = _espiar_confianza(monkeypatch)
    v = Ventana(date(2026, 3, 1), date(2026, 4, 1), DIA)
    # When se pide la confianza
    fuente.confianza_de(v, ["potencia_pv1_w", "irradiancia_incidente_wm2"])
    # Then la fuente queda sin fijar, que en `confianza` significa "mira las dos"
    assert visto["fuente"] is None
    assert set(visto["variables"]) == {"potencia_pv1_w", "irradiancia_incidente"}


def test_una_variable_que_nadie_vigila_se_reporta_como_tal(monkeypatch):
    # Given el albedo, que el barrido de calidad nunca reviso
    _espiar_confianza(monkeypatch)
    v = Ventana(date(2026, 3, 1), date(2026, 4, 1), DIA)
    # When se pide la confianza
    bloque = fuente.confianza_de(v, ["albedo"])
    # Then el bloque lo dice: cero hallazgos no es limpieza, es que nadie miro
    assert bloque["sin_vigilancia"]["variables"] == ["albedo"]
    assert "nadie" in bloque["sin_vigilancia"]["nota"]


def test_una_variable_vigilada_no_arrastra_la_advertencia(monkeypatch):
    # Given una variable que el barrido si revisa
    _espiar_confianza(monkeypatch)
    v = Ventana(date(2026, 3, 1), date(2026, 4, 1), DIA)
    # When se pide la confianza
    bloque = fuente.confianza_de(v, ["potencia_pv1_w"])
    # Then no se agrega ruido al bloque
    assert "sin_vigilancia" not in bloque
