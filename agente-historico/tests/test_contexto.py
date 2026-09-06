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


def test_una_fuente_sin_filas_contadas_no_invalida_el_dia():
    """Given un hallazgo grave sobre una fuente cuyas filas nadie cuenta
    (`radiacion_sc_poa` y `radiacion_sc_clearsky` no estan en el CTE `filas_dia`,
    y las pruebas nuevas escriben hallazgos con esas fuentes),
    When se reduce el periodo,
    Then el dia sigue siendo utilizable.

    Sin la guarda `n_dia > 0`, el denominador cero hacia cierta la comparacion
    `n_afectadas >= 0.20 * 0` para CUALQUIER hallazgo, y estrenar esas pruebas
    habria puesto en rojo dias sanos sin ninguna evidencia.
    """
    poa = {"fecha": DIAS[0], "fuente": "radiacion_sc_poa", "variable": "poa_pv1_wm2",
           "tipo": "fuera_de_rango", "severidad": "grave", "n_afectadas": 1}

    r = reducir(DIAS, FILAS, [poa], ["poa_pv1_wm2"], None)

    assert r["dias_utilizables"] == 31


def test_un_tipo_que_invalida_si_pega_aunque_no_haya_denominador():
    """Given un hallazgo de los que matan el dia por su naturaleza, sobre una
    fuente sin filas contadas,
    When se reduce el periodo,
    Then el dia SI queda fuera.

    La guarda del denominador acota la regla de la fraccion, no la lista de tipos
    que invalidan: esos nunca miraron cuantas lecturas tocaban.
    """
    duplicado = {"fecha": DIAS[0], "fuente": "radiacion_sc_poa", "variable": "*",
                 "tipo": "timestamp_duplicado", "severidad": "grave", "n_afectadas": 2}

    r = reducir(DIAS, FILAS, [duplicado], ["poa_pv1_wm2"], None)

    assert r["dias_utilizables"] == 30


# ══════════════════════════════════════════════════════════════════════════
# El CABLEADO de la consulta unica: la forma que devuelve `json_agg`
# ══════════════════════════════════════════════════════════════════════════
# Los tres insumos de `confianza` viajaban en tres consultas y ahora van en una
# sola, porque contra el pooler eran tres viajes de ~225 ms para un bloque que va
# dentro de casi toda respuesta. La fusion trae un modo de fallo nuevo y SILENCIOSO:
# `json_agg` devuelve las fechas como texto ISO, igual que `db.query`, y si algun
# dia devolviera `date` las claves de `filas` y las fechas de `hallazgos` dejarian
# de cruzar. No revienta nada: todos los dias saldrian utilizables, que es
# exactamente el veredicto complaciente que este modulo existe para evitar.
def test_la_consulta_de_confianza_es_UNA_sola(monkeypatch):
    # Given una base que cuenta cuantas veces la consultan
    from historico import db
    from historico.calidad import contexto
    viajes = []

    def falsa(sql, params=()):
        viajes.append(sql)
        return [{"calendario": [], "filas": [], "hallazgos": []}]

    monkeypatch.setattr(db, "query", falsa)

    # When se pide el bloque
    contexto._consultar("2026-01-01", "2026-02-01", ["potencia_pv1_w"], ELE)

    # Then hubo UN viaje. Cada uno de mas cuesta 225 ms en TODOS los endpoints.
    assert len(viajes) == 1


def test_la_fila_unica_se_desarma_con_la_forma_que_manda_json_agg(monkeypatch):
    # Given la fila tal como la arma la base: fechas ISO, filas como tripletas y
    # hallazgos como objetos
    from historico import db
    from historico.calidad import contexto
    fila = {
        "calendario": ["2026-01-01", "2026-01-02"],
        "filas": [["2026-01-01", ELE, 144], ["2026-01-02", ELE, 144]],
        "hallazgos": [{"fecha": "2026-01-01", "fuente": ELE,
                       "variable": "potencia_pv1_w", "tipo": "fuera_de_rango",
                       "severidad": "grave", "n_afectadas": 144}],
    }
    monkeypatch.setattr(db, "query", lambda sql, p=(): [fila])

    # When se reduce
    r = contexto._consultar("2026-01-01", "2026-01-03", ["potencia_pv1_w"], ELE)

    # Then el hallazgo cruza con su dia y lo invalida. Si las fechas no casaran, el
    # dia saldria utilizable y nadie se enteraria de que el filtro dejo de acertar.
    assert r["dias_en_rango"] == 2
    assert r["dias_con_datos"] == 2
    assert r["dias_utilizables"] == 1


def test_sin_calendario_no_se_inventa_nada(monkeypatch):
    # Given un rango sin un solo dia en `ventana_solar`
    from historico import db
    from historico.calidad import contexto
    monkeypatch.setattr(db, "query", lambda sql, p=(): [
        {"calendario": [], "filas": [], "hallazgos": []}])

    # When se pide el bloque
    r = contexto._consultar("2100-01-01", "2100-02-01", ["potencia_pv1_w"], ELE)

    # Then se dice que el rango esta vacio, no que todo esta bien
    assert r["dias_en_rango"] == 0 and r["dias_utilizables"] == 0
    assert "no hay ni un dia de calendario" in r["advertencia"]
