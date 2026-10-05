"""Pruebas de la clasificacion del cielo.

La estadistica (kt, VI, energias) es SQL y se verifica corriendola contra la base.
Lo que se prueba aca es la REGLA: dado cuanto sol hubo y que tan a saltos, que
clase de dia fue. Esa regla es la que se discute con el equipo.
"""
from __future__ import annotations

from historico import config
from historico.calidad.cielo import clasificar


def test_mucho_sol_y_curva_suave_es_dia_despejado():
    assert clasificar(0.85, 1.1) == "despejado"


def test_poco_sol_y_curva_suave_es_capa_uniforme_de_nubes():
    assert clasificar(0.20, 1.3) == "cubierto"


def test_la_variabilidad_manda_sobre_el_kt():
    # Un dia puede promediar mucho sol y aun asi ser el peor caso para el inversor
    # si el sol entro y salio todo el dia. El VI tiene que ganarle al promedio.
    assert clasificar(0.85, 6.0) == "variable"
    assert clasificar(0.20, 6.0) == "variable"


def test_lo_de_enmedio_es_parcial():
    assert clasificar(0.50, 1.5) == "parcial"


def test_sin_kt_no_se_inventa_una_clase():
    assert clasificar(None, 2.0) == "sin_datos"


def test_sin_vi_se_clasifica_igual_por_kt():
    # El VI puede faltar (un dia con una sola muestra no tiene largo de arco).
    assert clasificar(0.85, None) == "despejado"
    assert clasificar(0.10, None) == "cubierto"


def test_las_bandas_de_kt_son_configurables(monkeypatch):
    assert clasificar(0.72, 1.0) == "despejado"
    monkeypatch.setattr(config, "KT_DESPEJADO", 0.80)
    assert clasificar(0.72, 1.0) == "parcial"


def test_el_umbral_de_variabilidad_esta_calibrado_sobre_esta_serie():
    # No es un numero de la literatura: se midio la distribucion real de los 228
    # dias (mediana 4,29 · p75 5,62) y con el 3,0 que suele citarse el 77 % de los
    # dias caian en "variable", o sea que la etiqueta no distinguia nada. Si
    # alguien lo baja sin volver a medir, esta prueba se lo dice.
    assert config.VI_VARIABLE == 6.0
    assert clasificar(0.50, 5.9) == "parcial"      # justo debajo: no es variable
    assert clasificar(0.50, 6.0) == "variable"     # el umbral es inclusivo
