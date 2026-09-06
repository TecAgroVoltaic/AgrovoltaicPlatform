"""Las diez tools de analitica: registro, esquema y RECORTE del payload. Sin base.

Lo que se verifica aca es lo unico que las tools hacen: que esten registradas, que
su esquema le diga al modelo algo que pueda elegir, que traduzcan los parametros y
que NO le manden al LLM los arrays que solo sirven para dibujar. El calculo lo
prueban los tests de `analitica`, y por eso cada funcion de algoritmo se sustituye
con `monkeypatch`: si un test de tool necesitara base de datos, estaria probando
otra cosa.

Estructura Given-When-Then.
"""
from __future__ import annotations

import inspect
from datetime import date

import pytest

from historico import tools
from historico.analitica import (
    carpeta, catalogo, comparativa, completitud, correlacion, crestas,
    distribucion, resumen, series,
)
from historico.calidad import corrida
from historico.calidad.pruebas import Corrida, Evaluacion, Hallazgo
from historico.calidad.pruebas.contrato import CRUDO, EVALUADA, GRAVE, SIN_FUENTE
from historico.tools import (
    carpeta_dia_hora, comparativa_arreglos, completitud_datos, correlacion_variables,
    crestas_distribucion, distribucion_mensual, irradiacion_mensual, opciones,
    pruebas_calidad, resumen_dashboard, serie_variable,
)

# Las diez tools de esta tanda con la familia que les toca. Escrito a mano a
# proposito: es el contrato que el registro tiene que cumplir, y derivarlo del
# propio registro haria un test que no puede fallar.
TOOLS_NUEVAS = {
    "resumen_dashboard": "analisis",
    "serie_variable": "analisis",
    "distribucion_mensual": "analisis",
    "irradiacion_mensual": "analisis",
    "carpeta_dia_hora": "analisis",
    "correlacion_variables": "analisis",
    "crestas_distribucion": "analisis",
    "comparativa_arreglos": "analisis",
    "completitud_datos": "calidad",
    "pruebas_calidad": "calidad",
}

VENTANA = {"desde": "2026-01-01", "hasta": "2026-02-01", "dias": 31, "granularidad": "dia"}
CONFIANZA = {"dias_con_datos": 20, "advertencia": None}


def _sobre(**payload) -> dict:
    """Un sobre de `analitica.resultado` cualquiera, con la forma real."""
    return {"ventana": VENTANA, "confianza": CONFIANZA, **payload}


# ── Registro y esquemas ──────────────────────────────────────────────────────
@pytest.mark.parametrize("nombre,familia", sorted(TOOLS_NUEVAS.items()))
def test_cada_tool_nueva_esta_registrada_con_su_familia(nombre, familia):
    # Given el registro de tools

    # When se busca la tool por nombre
    # Then esta en el dispatch (el lazo la puede ejecutar) y en la familia correcta
    assert nombre in tools.DISPATCH
    assert tools.FAMILIA[nombre] == familia


@pytest.mark.parametrize("esquema", tools.SCHEMAS, ids=lambda e: e["name"])
def test_el_schema_es_valido_para_el_modelo(esquema):
    # Given el esquema que se le manda al LLM
    entrada = esquema["input_schema"]

    # When se revisa su forma
    # Then tiene nombre, descripcion util y un objeto cerrado de parametros
    assert esquema["name"] and len(esquema["description"]) > 40
    assert entrada["type"] == "object"
    assert entrada["additionalProperties"] is False
    assert set(entrada.get("required", [])) <= set(entrada["properties"])
    for propiedad in entrada["properties"].values():
        assert propiedad.get("description"), "cada parametro se explica o el modelo adivina"


@pytest.mark.parametrize("tool", tools._TOOLS, ids=lambda t: t.SCHEMA["name"])
def test_el_schema_y_la_firma_de_run_dicen_lo_mismo(tool):
    # Given lo que el esquema le promete al modelo
    prometidos = set(tool.SCHEMA["input_schema"]["properties"])

    # When se compara con lo que `run` acepta de verdad
    aceptados = set(inspect.signature(tool.run).parameters)

    # Then no hay parametro fantasma ni parametro invisible: el modelo manda el
    # esquema tal cual, y una diferencia sale como TypeError en produccion
    assert prometidos == aceptados


def test_el_enum_de_variables_se_genera_desde_el_catalogo():
    # Given las claves disponibles del catalogo
    esperadas = [v.clave for v in catalogo.disponibles()]

    # When se mira el esquema de las tools que piden una variable
    variables = serie_variable.SCHEMA["input_schema"]["properties"]["variables"]
    eje_x = correlacion_variables.SCHEMA["input_schema"]["properties"]["x"]

    # Then el enum ES el catalogo, no una lista transcrita
    assert variables["items"]["enum"] == esperadas
    assert eje_x["enum"] == esperadas
    assert "potencia_pv1_w" in esperadas


def test_la_irradiacion_solo_ofrece_variables_que_se_pueden_integrar():
    # Given que integrar una temperatura no da ninguna magnitud

    # When se mira el enum de la tool de irradiacion
    enum = irradiacion_mensual.SCHEMA["input_schema"]["properties"]["variable"]["enum"]

    # Then solo aparecen las irradiancias, en W/m2
    assert enum == opciones.claves(unidad=distribucion.UNIDAD_IRRADIANCIA)
    assert all(catalogo.obtener(c).unidad == "W/m2" for c in enum)
    assert "temp_inclinado" not in enum


def test_solo_las_pruebas_de_calidad_ofrecen_variables_sin_fuente():
    # Given que `humedad_relativa_pct` no existe en ninguna tabla
    sin_fuente = "humedad_relativa_pct"

    # When se comparan los dos enums
    de_pruebas = pruebas_calidad.SCHEMA["input_schema"]["properties"]["variable"]["enum"]
    de_analisis = serie_variable.SCHEMA["input_schema"]["properties"]["variables"]

    # Then se puede pedir su PRUEBA (dira `sin_fuente`) pero no graficarla
    assert sin_fuente in de_pruebas
    assert sin_fuente not in de_analisis["items"]["enum"]


# ── El payload grande NO viaja al modelo ─────────────────────────────────────
def test_la_serie_va_sin_sus_puntos_pero_con_la_tendencia(monkeypatch):
    # Given una serie de 1.500 buckets, el techo del graficador
    puntos = [{"t": "2026-01-01T00:00", "valor": 1.0, "n": 3} for _ in range(1500)]
    tendencia = {"pendiente": {"valor": 0.5}, "intercepto": 1.0, "r2": 0.8}
    monkeypatch.setattr(series, "serie_temporal", lambda *a, **k: _sobre(
        buckets_media_movil=7,
        series=[{"clave": "potencia_pv1_w", "unidad": "W", "puntos": puntos,
                 "n_con_dato": 1500, "tendencia": tendencia, "resumen": {}}]))

    # When la pide el agente
    salida = serie_variable.run(variables=["potencia_pv1_w"])

    # Then no viajan los 1.500 puntos, pero si lo que se puede narrar
    serie = salida["series"][0]
    assert "puntos" not in serie
    assert serie["buckets"] == 1500
    assert serie["tendencia"] == tendencia
    assert salida["confianza"] == CONFIANZA


def test_la_correlacion_va_sin_la_nube_pero_con_el_ajuste(monkeypatch):
    # Given una nube en el techo de 2.000 pares
    ajuste = {"r2": {"valor": 0.91}, "ecuacion": "y = 2*x + 1", "n": 2000}
    monkeypatch.setattr(correlacion, "dispersion", lambda *a, **k: _sobre(
        x={"clave": "irradiancia_incidente_wm2"}, y={"clave": "potencia_pv1_w"},
        pares=2000, lecturas_x=94868, lecturas_y=36469, ajuste=ajuste,
        puntos=[[1.0, 2.0]] * 2000, puntos_mostrados=2000, submuestreado=False))

    # When la pide el agente
    salida = correlacion_variables.run(x="irradiancia_incidente_wm2", y="potencia_pv1_w")

    # Then se va el dibujo y queda el numero, con el contraste de pares vs lecturas
    assert "puntos" not in salida and "submuestreado" not in salida
    assert salida["ajuste"] == ajuste
    assert (salida["pares"], salida["lecturas_x"]) == (2000, 94868)


def test_las_crestas_van_sin_las_densidades_pero_con_los_estadisticos(monkeypatch):
    # Given dos grupos con su densidad de 200 puntos
    estadisticos = {"mediana": {"valor": 42.0, "n": 10}}
    grupo = {"grupo": "temp_inclinado", "n": 5000, "n_usadas": 5000,
             "estadisticos": estadisticos, "prob_sobre_umbral": {"valor": 0.12},
             "densidad": [0.01] * 200, "prob_cola": [0.5] * 200, "motivo": None}
    monkeypatch.setattr(crestas, "densidades", lambda *a, **k: _sobre(
        unidad="C", rejilla=[0.0] * 200, umbral=60.0, cola="superior",
        grupos=[grupo, {**grupo, "grupo": "temp_vertical"}]))

    # When las pide el agente
    salida = crestas_distribucion.run(grupos=["temp_inclinado", "temp_vertical"],
                                      umbral=60.0)

    # Then no viaja ni la rejilla ni una sola curva, y si la probabilidad decisiva
    assert "rejilla" not in salida
    assert all("densidad" not in g and "prob_cola" not in g for g in salida["grupos"])
    assert salida["grupos"][0]["estadisticos"] == estadisticos
    assert salida["grupos"][0]["prob_sobre_umbral"] == {"valor": 0.12}


def test_la_carpeta_va_sin_la_matriz_y_con_la_hora_del_pico(monkeypatch):
    # Given dos dias en que la hora 11 es la de mas generacion
    fila = [None] * 24
    fila[10], fila[11] = 100.0, 300.0
    conteo = [0] * 24
    conteo[10] = conteo[11] = 12
    monkeypatch.setattr(carpeta, "diagrama", lambda *a, **k: _sobre(
        variable={"clave": "potencia_pv1_w", "unidad": "W"}, agregacion="promedio",
        dias=["2026-01-01", "2026-01-02"], horas=list(range(24)),
        matriz=[list(fila), list(fila)], conteo=[list(conteo), list(conteo)],
        rango={"minimo": {"valor": 100.0}}, celdas_con_dato=4, celdas_totales=48))

    # When la pide el agente
    salida = carpeta_dia_hora.run(variable="potencia_pv1_w")

    # Then no viajan las 48 celdas, y si la hora del pico y el perfil de 24 horas
    assert "matriz" not in salida and "conteo" not in salida
    assert salida["hora_pico"]["hora"] == 11
    assert salida["hora_pico"]["media"] == 300.0
    assert len(salida["perfil_horario"]) == 24
    assert salida["dias"] == {"total": 2, "desde": "2026-01-01", "hasta": "2026-01-02"}


def test_una_hora_sin_celdas_no_se_reporta_como_cero():
    # Given una hora de la madrugada sin una sola celda con dato
    matriz = [[None] * 24]
    conteo = [[0] * 24]

    # When se arma el perfil
    perfil = carpeta_dia_hora.perfil_horario(matriz, conteo, [0, 1])

    # Then el valor es None y `dias` lo explica: nadie midio, no es que midiera cero
    assert perfil[0]["media"] is None and perfil[0]["dias"] == 0
    assert carpeta_dia_hora.hora_pico(perfil) is None


def test_la_completitud_va_sin_la_serie_y_con_los_huecos_mas_grandes(monkeypatch):
    # Given cuatro tramos sin datos, uno de ellos el gran hueco de 2025
    tramos = [{"desde": "2025-01-01", "hasta": "2025-05-06", "dias": 126},
              {"desde": "2025-07-01", "hasta": "2025-09-10", "dias": 71},
              {"desde": "2026-05-22", "hasta": "2026-05-24", "dias": 3},
              {"desde": "2026-03-02", "hasta": "2026-03-02", "dias": 1}]
    monkeypatch.setattr(completitud, "calcular", lambda *a, **k: _sobre(
        granularidad_serie="dia", granularidad_degradada=False,
        series={"electrico": [{"periodo": "2026-01-01"}] * 569, "radiacion": []},
        resumen={"electrico": {"dias_calendario": 569, "completitud": 0.48,
                               "tramos_sin_datos": tramos},
                 "radiacion": {"dias_calendario": 569, "tramos_sin_datos": []}}))

    # When la pide el agente
    salida = completitud_datos.run()

    # Then se va la serie de 569 puntos y quedan los tramos mas largos, con su total
    electrico = salida["resumen"]["electrico"]
    assert "series" not in salida
    assert [t["dias"] for t in electrico["tramos_sin_datos"]] == [126, 71, 3]
    assert electrico["tramos_sin_datos_total"] == 4
    assert electrico["completitud"] == 0.48


def test_la_comparativa_va_sin_la_curva_pero_con_la_franja_horaria(monkeypatch):
    # Given un comparativo con serie por periodo y curva de 24 horas
    separacion = {"gana_inclinado": [9, 10, 11], "gana_vertical": [6, 7],
                  "lectura": "el inclinado aventaja al vertical en las horas 9-11"}
    monkeypatch.setattr(comparativa, "arreglos", lambda *a, **k: _sobre(
        granularidad="mes", por_periodo=[{"periodo": "2026-01-01"}] * 19,
        totales={"inclinado": {}}, diferencia={"ganador": "inclinado"},
        curva_horaria=[{"hora": h} for h in range(24)],
        separacion_horaria=separacion, rendimiento={},
        estacionalidad={"suficiente": False, "advertencia": "faltan meses",
                        "meses": [{"mes": "2026-01"}], "descartados": [{"mes": "2025-12"}]},
        nota="PV1 = inclinado."))

    # When lo pide el agente
    salida = comparativa_arreglos.run()

    # Then no viajan los arrays de dibujo y si la lectura que responde el eje 1
    assert "por_periodo" not in salida and "curva_horaria" not in salida
    assert salida["separacion_horaria"] == separacion
    assert salida["estacionalidad"]["meses_comparables"] == 1
    assert salida["estacionalidad"]["advertencia"] == "faltan meses"
    assert "meses" not in salida["estacionalidad"]


def test_la_distribucion_va_sin_las_cajas_y_dice_donde_estan_los_atipicos(monkeypatch):
    # Given tres meses, uno sin datos y otro con todos los outliers
    def caja(mes, n, mediana, bajos=0, altos=0):
        return {"mes": mes, "n": n, "mediana": mediana, "q1": 1.0, "q3": 2.0,
                "minimo": 0.0, "maximo": 3.0, "outliers_bajos": bajos,
                "outliers_altos": altos}

    monkeypatch.setattr(distribucion, "cajas_mensuales", lambda *a, **k: _sobre(
        variable={"clave": "temp_inclinado", "unidad": "C"}, factor_iqr=1.5,
        cajas=[caja("2026-01", 100, 30.0, altos=12), caja("2026-02", 0, None),
               caja("2026-03", 50, 45.0, bajos=1)]))

    # When la pide el agente
    salida = distribucion_mensual.run(variable="temp_inclinado")

    # Then no viajan las cajas, y si el mes mas caliente y donde hay mas atipicos
    assert "cajas" not in salida
    assert salida["meses"] == {"total": 3, "con_datos": 2, "sin_datos": 1}
    assert salida["mediana_mas_alta"] == {"mes": "2026-03", "valor": 45.0, "n": 50}
    assert salida["mediana_mas_baja"]["mes"] == "2026-01"
    assert salida["outliers"]["meses_con_mas"][0] == {"mes": "2026-01", "outliers": 12,
                                                      "n": 100}


def test_la_irradiacion_va_sin_las_barras_y_con_los_meses_extremos(monkeypatch):
    # Given tres meses, uno de ellos sin dato integrable
    def barra(mes, valor, dias):
        return {"mes": mes, "n": 100 if valor else 0, "dias_con_dato": dias,
                "irradiacion": {"valor": valor, "unidad": "kWh/m2"},
                "media_diaria": {"valor": valor and valor / dias}}

    monkeypatch.setattr(distribucion, "irradiacion_mensual", lambda *a, **k: _sobre(
        variable={"clave": "irradiancia_incidente_wm2"}, techo_salto_seg=900,
        total={"valor": 250.0},
        barras=[barra("2026-01", 140.0, 31), barra("2026-02", None, 0),
                barra("2026-03", 110.0, 28)]))

    # When la pide el agente
    salida = irradiacion_mensual.run()

    # Then no viajan las barras y si los dos extremos, con su total intacto
    assert "barras" not in salida
    assert salida["total"] == {"valor": 250.0}
    assert salida["mes_de_mas_sol"]["mes"] == "2026-01"
    assert salida["mes_de_menos_sol"]["mes"] == "2026-03"
    assert salida["meses"] == {"total": 3, "con_datos": 2}


def test_el_resumen_del_dashboard_viaja_entero(monkeypatch):
    # Given los KPIs, que son todos escalares
    kpis = _sobre(actualizacion={"estado": "detenida"}, energia_periodo={},
                  dias_con_datos=274)
    monkeypatch.setattr(resumen, "calcular", lambda *a, **k: kpis)

    # When los pide el agente
    salida = resumen_dashboard.run(desde="2026-01-01")

    # Then no hay nada que recortar: se devuelven tal cual
    assert salida is kpis


# ── Traduccion de parametros ─────────────────────────────────────────────────
def test_la_tool_traduce_las_fechas_a_una_ventana(monkeypatch):
    # Given una tool que recibe fechas ISO como las manda el modelo
    recibido = {}

    def espia(v, variable, agregacion):
        recibido.update(ventana=v, variable=variable, agregacion=agregacion)
        return _sobre(variable={}, dias=[], horas=[], matriz=[], conteo=[],
                      rango={}, celdas_con_dato=0, celdas_totales=0, agregacion=agregacion)

    monkeypatch.setattr(carpeta, "diagrama", espia)

    # When se llama con fechas y agregacion
    carpeta_dia_hora.run(variable="potencia_pv1_w", desde="2026-01-01",
                         hasta="2026-02-01", agregacion=carpeta.INTEGRAL)

    # Then el algoritmo recibe una Ventana ya parseada y el resto sin tocar
    assert recibido["ventana"].desde == date(2026, 1, 1)
    assert recibido["ventana"].hasta == date(2026, 2, 1)
    assert recibido["variable"] == "potencia_pv1_w"
    assert recibido["agregacion"] == carpeta.INTEGRAL


def test_la_serie_pasa_la_granularidad_y_la_media_movil(monkeypatch):
    # Given una serie pedida por semana con media movil de 4
    recibido = {}

    def espia(v, variables, media_movil):
        recibido.update(granularidad=v.granularidad, variables=variables,
                        media_movil=media_movil)
        return _sobre(series=[])

    monkeypatch.setattr(series, "serie_temporal", espia)

    # When se llama
    serie_variable.run(variables=["potencia_pv1_w", "potencia_pv2_w"],
                       desde="2026-01-01", hasta="2026-02-01",
                       granularidad="semana", media_movil=4)

    # Then los tres llegan al algoritmo sin reinterpretarse
    assert recibido == {"granularidad": "semana", "media_movil": 4,
                        "variables": ["potencia_pv1_w", "potencia_pv2_w"]}


def test_las_crestas_pasan_el_umbral_y_la_cola(monkeypatch):
    # Given un umbral de 60 C por la cola inferior
    recibido = {}

    def espia(v, grupos, umbral, cola):
        recibido.update(grupos=grupos, umbral=umbral, cola=cola)
        return _sobre(unidad="C", rejilla=[], umbral=umbral, cola=cola, grupos=[])

    monkeypatch.setattr(crestas, "densidades", espia)

    # When se llama
    crestas_distribucion.run(grupos=["temp_inclinado"], umbral=60.0,
                             cola=crestas.INFERIOR)

    # Then el algoritmo los recibe tal cual
    assert recibido == {"grupos": ["temp_inclinado"], "umbral": 60.0,
                        "cola": crestas.INFERIOR}


# ── Pruebas de calidad: lo que NO corrio tiene que verse ─────────────────────
def _corrida_falsa() -> Corrida:
    """Una corrida con una prueba que corrio y otra que no tuvo fuente."""
    hallazgo = Hallazgo(fecha=date(2026, 1, 5), fuente="radiacion_sc_15s",
                        variable="irradiancia_incidente_wm2", tipo="outlier_iqr",
                        severidad=GRAVE, n_afectadas=7, detalle={"de": 100})
    evaluada = Evaluacion("outlier_iqr", "anomalias", "irradiancia_incidente_wm2",
                          "radiacion_sc_15s", CRUDO, EVALUADA, None, (hallazgo,))
    sin_fuente = Evaluacion("bajo_minimo", "validez_fisica", "humedad_relativa_pct",
                            "sin_fuente", CRUDO, SIN_FUENTE,
                            "ninguna tabla la contiene", ())
    return Corrida((evaluada, sin_fuente), ())


def test_las_pruebas_sin_fuente_llegan_al_modelo(monkeypatch):
    # Given una corrida donde una prueba no tuvo de donde leer
    monkeypatch.setattr(corrida, "evaluar", lambda *a, **k: _corrida_falsa())

    # When el agente pide las pruebas
    salida = pruebas_calidad.run(variable="irradiancia_incidente_wm2")

    # Then la prueba que no corrio viaja con su motivo, y no como un aprobado
    sin_fuente = salida["sin_correr"]["sin_fuente"]
    assert [p["prueba"] for p in sin_fuente] == ["bajo_minimo"]
    assert sin_fuente[0]["motivo"] == "ninguna tabla la contiene"
    assert salida["resumen"]["sin_fuente"] == 1


def test_las_pruebas_dicen_que_variables_nadie_vigilaba(monkeypatch):
    # Given una corrida sobre variables que el barrido no revisa
    monkeypatch.setattr(corrida, "evaluar", lambda *a, **k: _corrida_falsa())

    # When el agente pide las pruebas
    salida = pruebas_calidad.run(variable="humedad_relativa_pct")

    # Then el resumen dice para cuales es la PRIMERA revision, no una confirmacion
    assert "humedad_relativa_pct" in salida["resumen"]["sin_vigilancia_previa"]


def test_una_variable_que_todavia_no_existia_lo_dice(monkeypatch):
    # Given el SP722, que corrio dieciocho dias de mayo 2026
    monkeypatch.setattr(corrida, "evaluar", lambda *a, **k: _corrida_falsa())

    # When se piden sus pruebas sobre 2024
    salida = pruebas_calidad.run(variable="irradiancia_incidente_sp722_wm2",
                                 desde="2024-11-10", hasta="2025-01-01")

    # Then se dice que la ventana no toca su tramo: los nulos de ese rango son un
    # sensor sin instalar, no un sensor roto
    assert "no existen antes del 2026-05-11" in salida["fuera_de_cobertura"]


def test_los_hallazgos_viajan_contados_por_tipo_y_no_uno_por_uno(monkeypatch):
    # Given una corrida con un hallazgo grave
    monkeypatch.setattr(corrida, "evaluar", lambda *a, **k: _corrida_falsa())

    # When el agente pide las pruebas
    salida = pruebas_calidad.run(variable="irradiancia_incidente_wm2")

    # Then va el conteo por tipo, no el detalle JSON de cada dia
    assert salida["hallazgos"]["total"] == 1
    assert salida["hallazgos"]["por_tipo"] == [
        {"tipo": "outlier_iqr", "severidad": GRAVE, "dias": 1, "lecturas": 7}]
