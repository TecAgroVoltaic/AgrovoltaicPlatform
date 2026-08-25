"""Pruebas del criterio de confianza: cuantos dias de un periodo son utilizables.

Se prueba `reducir()` directo, sin base: es donde vive la decision, y es donde
aparecieron los DOS defectos que solo se vieron corriendo el agente contra datos
reales. Los dos tienen su prueba abajo para que no vuelvan.
"""
from __future__ import annotations

from datetime import date

from historico.calidad.contexto import reducir

ELE = "monitoreo_sc_electrico"
DIAS = [date(2026, 1, d) for d in range(1, 32)]          # enero entero
FILAS = {(d, ELE): 144 for d in DIAS}                     # dia completo a 5 min


def _hallazgo(fecha, variable, tipo="fuera_de_rango", severidad="grave", n=144):
    return {"fecha": fecha, "fuente": ELE, "variable": variable,
            "tipo": tipo, "severidad": severidad, "n_afectadas": n}


def test_sin_hallazgos_todos_los_dias_sirven():
    r = reducir(DIAS, FILAS, [], ["potencia_pv1_w"], ELE)
    assert r["dias_utilizables"] == 31
    assert r["cobertura"] == 1.0
    assert r["advertencia"] is None


def test_un_dia_sin_lecturas_no_cuenta_como_utilizable():
    filas = {k: v for k, v in FILAS.items() if k[0] != DIAS[0]}
    r = reducir(DIAS, filas, [], ["potencia_pv1_w"], ELE)
    assert r["dias_con_datos"] == 30
    assert r["dias_utilizables"] == 30


def test_una_columna_rota_NO_condena_a_las_demas():
    # DEFECTO REAL, encontrado corriendo el agente: enero 2026 daba "0 de 31 dias
    # utilizables" para la energia DC cuando potencia_pv1_w estaba impecable. Los
    # graves eran de otras columnas de la misma tabla. Un veredicto que mira la
    # tabla entera marca todo en rojo y ademas miente.
    hallazgos = [_hallazgo(d, "frecuencia_hz") for d in DIAS]
    r = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELE)
    assert r["dias_utilizables"] == 31


def test_variables_con_distinta_salud_se_desglosan():
    # DEFECTO REAL, el segundo: `energia_por_arreglo` devuelve tres numeros y en
    # enero dos eran fiables y el tercero no existia. Un solo veredicto miente en
    # las dos direcciones: descarta datos buenos o avala uno inexistente.
    hallazgos = [_hallazgo(d, "potencia_total_wac", tipo="columna_ausente") for d in DIAS]
    r = reducir(DIAS, FILAS, hallazgos,
                ["potencia_pv1_w", "potencia_pv2_w", "potencia_total_wac"], ELE)
    assert r["por_variable"]["potencia_pv1_w"]["dias_utilizables"] == 31
    assert r["por_variable"]["potencia_total_wac"]["dias_utilizables"] == 0
    assert "NO van juntas" in r["advertencia"]


def test_sin_desglose_cuando_las_variables_van_juntas():
    # Si todas estan igual de sanas el desglose es ruido: no se incluye.
    r = reducir(DIAS, FILAS, [], ["potencia_pv1_w", "potencia_pv2_w"], ELE)
    assert "por_variable" not in r


def test_el_global_es_el_peor_caso():
    # El titular tiene que ser conservador; el desglose dice la verdad fina.
    hallazgos = [_hallazgo(d, "potencia_total_wac") for d in DIAS]
    r = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w", "potencia_total_wac"], ELE)
    assert r["dias_utilizables"] == 0


def test_un_hallazgo_puntual_no_invalida_el_dia():
    # 5 lecturas de 144 fuera de rango no arruinan el dia: por debajo de la quinta
    # parte no es material. Sin este matiz el veredicto no distingue nada.
    hallazgos = [_hallazgo(DIAS[0], "potencia_pv1_w", n=5)]
    r = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELE)
    assert r["dias_utilizables"] == 31


def test_un_hallazgo_de_dia_entero_afecta_a_todas_las_variables():
    # `variable = '*'` son los de dia entero (falta media jornada, timestamps
    # repetidos). No son de ninguna columna: son de todas.
    hallazgos = [_hallazgo(DIAS[0], "*", tipo="dia_incompleto", n=10)]
    r = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w", "potencia_pv2_w"], ELE)
    assert r["dias_utilizables"] == 30


def test_los_avisos_no_invalidan_el_dia():
    hallazgos = [_hallazgo(d, "potencia_pv1_w", severidad="aviso") for d in DIAS]
    r = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELE)
    assert r["dias_utilizables"] == 31


def test_periodo_sin_calendario_lo_dice_en_vez_de_dividir_por_cero():
    r = reducir([], {}, [], ["potencia_pv1_w"], ELE)
    assert r["dias_en_rango"] == 0
    assert "ni un dia de calendario" in r["advertencia"]


def test_advertencia_escalonada_segun_cuanto_se_pierde():
    pocos = [_hallazgo(d, "potencia_pv1_w") for d in DIAS[:26]]   # quedan 5 de 31
    medio = [_hallazgo(d, "potencia_pv1_w") for d in DIAS[:15]]   # quedan 16 de 31
    r_pocos = reducir(DIAS, FILAS, pocos, ["potencia_pv1_w"], ELE)
    r_medio = reducir(DIAS, FILAS, medio, ["potencia_pv1_w"], ELE)
    assert "NO representan el periodo" in r_pocos["advertencia"]
    assert "como parciales" in r_medio["advertencia"]
