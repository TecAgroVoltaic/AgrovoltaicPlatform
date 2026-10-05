"""
Tests de humo de la API del Historico: contrato HTTP, sin DB ni LLM.

El pool de db.py es perezoso, así que la app se importa sin exigir Supabase.
Lo que se prueba acá es el BORDE: status codes, política de API key y el
despacho de tools. Los números los cubren los tests de cada tool.
Estructura Given-When-Then.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from historico import api, db
from historico.analitica import catalogo, correlacion, rendimiento, series
from historico.analitica import energia as energia_analitica
from historico.api import ENV_API_KEY, app
from historico.calidad import contexto, corrida
from historico.calidad.pruebas import Corrida, Evaluacion, Hallazgo
from historico.calidad.pruebas.contrato import AVISO, CRUDO, SIN_FUENTE

CLIENTE = TestClient(app)
CLAVE = "clave-de-prueba"


def test_health_responde_ok_y_lista_las_tools():
    # Given/When
    r = CLIENTE.get("/health")

    # Then: sirve de smoke test del arranque (import + registro de tools)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["status"] == "ok"
    assert len(cuerpo["tools"]) > 0


def test_tools_publica_los_esquemas():
    # Given/When
    r = CLIENTE.get("/tools")

    # Then: cada schema tiene lo que VisioneFlow necesita para cablear el nodo
    assert r.status_code == 200
    esquemas = r.json()["tools"]
    assert esquemas and all("name" in s and "input_schema" in s for s in esquemas)


def test_tool_desconocida_da_404_y_lista_las_validas():
    # Given/When
    r = CLIENTE.post("/tool/no_existe", json={})

    # Then: el error dice qué sí existe (el LLM puede corregirse solo)
    assert r.status_code == 404
    assert "no_existe" in r.json()["detail"]


def test_health_no_exige_clave(monkeypatch):
    # Given: API key configurada
    monkeypatch.setenv(ENV_API_KEY, CLAVE)

    # When/Then: /health queda abierto para monitoreo
    assert CLIENTE.get("/health").status_code == 200


def test_tool_exige_la_clave_si_esta_configurada(monkeypatch):
    # Given
    monkeypatch.setenv(ENV_API_KEY, CLAVE)

    # When: sin header
    r = CLIENTE.post("/tool/catalogo", json={})

    # Then
    assert r.status_code == 401


def test_tool_acepta_la_clave_correcta(monkeypatch):
    # Given
    monkeypatch.setenv(ENV_API_KEY, CLAVE)
    monkeypatch.setitem(api.tools.DISPATCH, "_falsa", lambda **kw: {"ok": True})

    # When
    r = CLIENTE.post("/tool/_falsa", json={}, headers={"x-api-key": CLAVE})

    # Then: pasa el borde y ejecuta la tool
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_parametro_invalido_de_una_tool_da_400(monkeypatch):
    # Given: una tool con firma FIJA (como las reales), que no acepta ese parámetro
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    monkeypatch.setitem(api.tools.DISPATCH, "_falsa", lambda dias=7: {"ok": True})

    # When
    r = CLIENTE.post("/tool/_falsa", json={"parametro_que_no_existe": 1})

    # Then: culpa del cliente, no 500, y con código para distinguirlo sin leer texto
    assert r.status_code == 400
    assert r.json()["codigo"] == "parametro_invalido"


# ── Analítica: la API sí manda los arrays, y los errores de parámetro son 4xx ──
@pytest.fixture
def sin_clave(monkeypatch):
    """Sin API key en el entorno la verificación se desactiva (ver `_verificar_api_key`).

    Va como fixture y no repetido en cada test porque el que se olvide de ponerlo
    no falla: pasa a probar el 401 sin darse cuenta.
    """
    monkeypatch.delenv(ENV_API_KEY, raising=False)


def test_el_endpoint_si_manda_la_nube_completa(sin_clave, monkeypatch):
    # Given una correlación con sus 2.000 puntos de dibujo
    payload = {"ventana": {}, "confianza": {}, "ajuste": {"r2": {"valor": 0.9}},
               "puntos": [[1.0, 2.0]] * 2000, "puntos_mostrados": 2000}
    monkeypatch.setattr(correlacion, "dispersion", lambda *a, **k: payload)

    # When la pide la consola (no el LLM)
    r = CLIENTE.get("/analitica/correlacion",
                    params={"x": "irradiancia_incidente_wm2", "y": "potencia_pv1_w"})

    # Then viaja entera: el que dibuja necesita los puntos que la tool recorta
    assert r.status_code == 200
    assert len(r.json()["puntos"]) == 2000


def test_las_variables_viajan_separadas_por_coma(sin_clave, monkeypatch):
    # Given un pedido de dos variables sobre el mismo eje
    recibido = {}

    def espia(ventana, variables, media_movil):
        recibido.update(variables=variables, media_movil=media_movil)
        return {"series": []}

    monkeypatch.setattr(series, "serie_temporal", espia)

    # When llegan por query string
    r = CLIENTE.get("/analitica/series",
                    params={"variables": "potencia_pv1_w, potencia_pv2_w",
                            "media_movil": 3})

    # Then el algoritmo recibe una lista limpia, no la cadena
    assert r.status_code == 200
    assert recibido == {"variables": ["potencia_pv1_w", "potencia_pv2_w"],
                        "media_movil": 3}


def test_los_endpoints_de_analitica_exigen_la_clave(monkeypatch):
    # Given API key configurada
    monkeypatch.setenv(ENV_API_KEY, CLAVE)

    # When se pide sin header
    r = CLIENTE.get("/analitica/resumen")

    # Then no se filtra ni un dato
    assert r.status_code == 401


@pytest.mark.parametrize("params,codigo", [
    ({"desde": "el lunes pasado"}, "fecha_ilegible"),
    ({"desde": "2026-02-01", "hasta": "2026-01-01"}, "rango_vacio"),
    ({"granularidad": "quincena"}, "granularidad_desconocida"),
])
def test_una_ventana_mal_pedida_da_400_con_su_codigo(sin_clave, params, codigo):
    # Given un rango que el cliente escribió mal

    # When se pide cualquier análisis
    r = CLIENTE.get("/analitica/completitud", params=params)

    # Then es culpa de quien preguntó (400), no del servidor (500), y se dice cuál
    assert r.status_code == 400
    assert r.json()["codigo"] == codigo
    assert isinstance(r.json()["detail"], str)


def test_una_variable_inexistente_da_400_y_no_500(sin_clave):
    # Given una clave que no está en el catálogo (el LLM se equivocó de nombre)

    # When se pide su distribución
    r = CLIENTE.get("/analitica/distribucion", params={"variable": "potencia_pv3_w"})

    # Then 400 con código: el modelo puede corregirse sin parsear el mensaje
    assert r.status_code == 400
    assert r.json()["codigo"] == "variable_desconocida"


def test_una_variable_sin_fuente_da_422(sin_clave):
    # Given una variable que el documento pide y ninguna tabla tiene

    # When se pide su distribución
    r = CLIENTE.get("/analitica/distribucion",
                    params={"variable": "humedad_relativa_pct"})

    # Then no es un error de escritura sino algo que no se puede servir
    assert r.status_code == 422
    assert r.json()["codigo"] == "fuente_ausente"


def test_una_ventana_demasiado_grande_da_422(sin_clave):
    # Given el histórico entero pedido como diagrama de carpeta

    # When se pide sin acotar el rango
    r = CLIENTE.get("/analitica/carpeta", params={"variable": "potencia_pv1_w"})

    # Then se rechaza ANTES de consultar, diciendo qué hacer
    assert r.status_code == 422
    assert r.json()["codigo"] == "ventana_demasiado_fina"


def test_un_valueerror_suelto_del_algoritmo_da_400(sin_clave):
    # Given una petición de crestas sin ningún grupo

    # When se pide
    r = CLIENTE.get("/analitica/crestas", params={"grupos": ""})

    # Then el ValueError del algoritmo sale como parámetro inválido, no como 500
    assert r.status_code == 400
    assert r.json()["codigo"] == "parametro_invalido"


def test_una_tool_con_variable_inexistente_da_400(sin_clave):
    # Given que los parámetros de una tool los elige el LLM y se equivoca

    # When manda una variable que no existe
    r = CLIENTE.post("/tool/correlacion_variables",
                     json={"x": "no_existe", "y": "potencia_pv1_w"})

    # Then el manejador compartido también cubre /tool: 400, no 500
    assert r.status_code == 400
    assert r.json()["codigo"] == "variable_desconocida"


def test_las_pruebas_de_calidad_devuelven_una_evaluacion_por_prueba(sin_clave,
                                                                    monkeypatch):
    # Given una corrida con una prueba que corrió y otra sin fuente
    hallazgo = Hallazgo(fecha=date(2026, 1, 5), fuente="sin_fuente",
                        variable="humedad_relativa_pct", tipo="sin_fuente",
                        severidad=AVISO, n_afectadas=None, detalle={"motivo": "no hay"})
    evaluacion = Evaluacion("bajo_minimo", "validez_fisica", "humedad_relativa_pct",
                            "sin_fuente", CRUDO, SIN_FUENTE, "no hay tabla", ())
    monkeypatch.setattr(corrida, "evaluar",
                        lambda *a, **k: Corrida((evaluacion,), (hallazgo,)))

    # When la consola pide el informe
    r = CLIENTE.get("/calidad/pruebas", params={"variable": "humedad_relativa_pct"})

    # Then la prueba que no corrió aparece con su estado, y el hallazgo con su fecha
    cuerpo = r.json()
    assert r.status_code == 200
    assert cuerpo["evaluaciones"][0]["estado"] == SIN_FUENTE
    assert cuerpo["resumen"][SIN_FUENTE] == 1
    assert cuerpo["hallazgos"][0]["fecha"] == "2026-01-05"
    assert cuerpo["variable"]["disponible"] is False


def test_una_fecha_ilegible_da_el_mismo_codigo_en_toda_la_api(sin_clave):
    # Given la misma fecha mal escrita en dos rutas distintas

    # When se piden hallazgos de un día y un análisis
    hallazgos = CLIENTE.get("/calidad/hallazgos", params={"fecha": "el lunes"})
    analisis = CLIENTE.get("/analitica/resumen", params={"desde": "el lunes"})

    # Then el cliente no tiene que aprenderse una regla por ruta
    assert hallazgos.status_code == analisis.status_code == 400
    assert hallazgos.json()["codigo"] == analisis.json()["codigo"] == "fecha_ilegible"


# ── Rendimiento y energía: los dos endpoints que la consola no tenía ───────────
# Lo que se defiende acá es el CONTRATO, no la cuenta (esa la cubren
# `test_analitica_rendimiento.py` y `test_analitica_energia.py`): que el cuerpo sea
# el MISMO que el de la tool, porque cuatro consolas derivan su esquema del payload
# de `performance_ratio` y `energia_por_arreglo`, y que los dos arrays que la tool
# recorta lleguen cuando se piden.
CONFIANZA = {"dias_utilizables": 2, "dias_totales": 2,
             "disponibilidad": {"dias_con_planta_parada": 0}}


def _fila_pr(dia: str, **campos) -> dict:
    """Un renglón diario sano, con la forma que devuelve `rendimiento.consultar`."""
    base = {
        "dia": dia, "horas_sol": 12.0, "horas_rad": 12.0, "horas_ele": 12.0,
        "ghi_wh_m2": 4000.0, "ghi_wh_m2_literal": 4000.0,
        "poa1_bif_wh_m2": 4500.0, "poa2_bif_wh_m2": 3400.0,
        "poa1_front_wh_m2": 4000.0, "poa2_front_wh_m2": 1700.0,
        "e1_integral_wh": 4000.0, "e2_integral_wh": 2800.0,
        "e1_contador_kwh": 4.0, "e2_contador_kwh": 2.8,
    }
    return {**base, **campos}


def _pr_calculado(filas: list[dict]):
    """`rendimiento.calcular` sin base de datos: el sobre real sobre esas filas."""
    def falso(v, insumo=rendimiento.GHI):
        return {"ventana": v.como_dict(), "confianza": CONFIANZA,
                **rendimiento.componer(filas, insumo),
                "cobertura_poa": {"fuera_de_cobertura": None}}
    return falso


@pytest.fixture
def pr_de_dos_dias(monkeypatch):
    """Dos días: uno sano y uno descartado por no tener eléctrico."""
    filas = [_fila_pr("2026-04-15"),
             _fila_pr("2026-04-16", horas_ele=0.0, e1_integral_wh=None,
                      e2_integral_wh=None, e1_contador_kwh=None,
                      e2_contador_kwh=None)]
    monkeypatch.setattr(rendimiento, "calcular", _pr_calculado(filas))
    return filas


def test_rendimiento_devuelve_el_mismo_cuerpo_que_la_tool(sin_clave, pr_de_dos_dias):
    # Given el mismo cálculo detrás de la tool y del endpoint

    # When se piden los dos
    r = CLIENTE.get("/analitica/rendimiento")
    de_la_tool = api.tools.performance.run()

    # Then el esquema Zod derivado de la tool sirve tal cual para el endpoint:
    # misma forma hasta en el PR pelado de `total`, que la tool saca del sobre
    assert r.status_code == 200
    cuerpo = r.json()
    assert set(cuerpo) == set(de_la_tool)
    assert {k: v for k, v in cuerpo.items() if k != "nota"} == \
           {k: v for k, v in de_la_tool.items() if k != "nota"}
    assert isinstance(cuerpo["total"]["contador"]["ghi"]["inclinado"]["pr"], float)


def test_rendimiento_sin_detalle_no_paga_los_arrays(sin_clave, pr_de_dos_dias):
    # Given el tablero, que dibuja el total y los meses

    # When pide sin `detalle`
    cuerpo = CLIENTE.get("/analitica/rendimiento").json()

    # Then no carga con los 228 renglones ni con el anexo de descartes
    assert "por_dia" not in cuerpo
    assert "detalle_descartados" not in cuerpo["dias"]
    assert "`detalle=true`" in cuerpo["nota"]


def test_rendimiento_con_detalle_manda_el_dia_a_dia_y_el_motivo_del_descarte(
        sin_clave, pr_de_dos_dias):
    # Given la vista comparativa, que sí necesita el renglón día a día

    # When lo pide explícitamente
    r = CLIENTE.get("/analitica/rendimiento", params={"detalle": "true"})

    # Then llegan los dos arrays, y el descarte llega CON su motivo
    assert r.status_code == 200
    cuerpo = r.json()
    assert [d["dia"] for d in cuerpo["por_dia"]] == ["2026-04-15", "2026-04-16"]
    descartados = cuerpo["dias"]["detalle_descartados"]
    assert [d["dia"] for d in descartados] == ["2026-04-16"]
    assert rendimiento.SIN_ELECTRICO in descartados[0]["motivos_descarte"]


def test_rendimiento_conserva_los_bloques_que_la_consola_muestra(sin_clave,
                                                                 pr_de_dos_dias):
    # Given una respuesta cualquiera

    # When la consola la lee
    cuerpo = CLIENTE.get("/analitica/rendimiento").json()

    # Then siguen ahí los bloques que la UI tiene que mostrar
    assert cuerpo["confianza"]["disponibilidad"] == CONFIANZA["disponibilidad"]
    assert cuerpo["aval_pendiente"]["estado"] == "pendiente_de_aval_externo"
    assert cuerpo["error_formula_literal"]["aplicable"] is True
    assert cuerpo["fuente_energia"]["principal"] == rendimiento.CONTADOR
    assert "supera_limite_fisico" in cuerpo["por_mes"][0]


def test_rendimiento_sin_datos_devuelve_el_sobre_con_motivo(sin_clave, monkeypatch):
    # Given una ventana real pero sin ni una fila (un mes del hueco de 126 días)
    monkeypatch.setattr(rendimiento, "calcular", _pr_calculado([]))

    # When se pide
    r = CLIENTE.get("/analitica/rendimiento",
                    params={"desde": "2025-02-01", "hasta": "2025-03-01"})

    # Then no es un 500 ni un cero disfrazado: es None con su motivo
    assert r.status_code == 200
    pr = r.json()["total"]["contador"]["ghi"]["inclinado"]
    assert pr["pr"] is None
    assert pr["motivo"] == "sin_lecturas"


@pytest.mark.parametrize("ruta", ["/analitica/rendimiento", "/analitica/energia"])
@pytest.mark.parametrize("params,codigo", [
    ({"desde": "el lunes pasado"}, "fecha_ilegible"),
    ({"desde": "2026-02-01", "hasta": "2026-01-01"}, "rango_vacio"),
])
def test_los_endpoints_nuevos_rechazan_la_ventana_mal_pedida(sin_clave, ruta,
                                                             params, codigo):
    # Given un rango que el cliente escribió mal

    # When lo manda a cualquiera de los dos nuevos
    r = CLIENTE.get(ruta, params=params)

    # Then el mismo 400 con el mismo código que en los nueve anteriores
    assert r.status_code == 400
    assert r.json()["codigo"] == codigo


@pytest.mark.parametrize("ruta", ["/analitica/rendimiento", "/analitica/energia",
                                  "/analitica/variables"])
def test_los_endpoints_nuevos_exigen_la_clave(monkeypatch, ruta):
    # Given API key configurada
    monkeypatch.setenv(ENV_API_KEY, CLAVE)

    # When se piden sin header
    # Then no se filtra ni un dato
    assert CLIENTE.get(ruta).status_code == 401


def _dia_energia(**campos) -> dict:
    """Un renglón diario con la forma que devuelve `energia.por_dia`."""
    base = {"dia": "2026-04-29", "ac_cierre": 6.825, "n_ac": 200,
            "vida_primero": 2490.0, "vida_ultimo": 2496.8, "n_vida": 200,
            "dc_cierre_inclinado": 3.955, "dc_cierre_vertical": 3.2,
            "n_dc_inclinado": 200, "n_dc_vertical": 200,
            "w_inclinado": 47460.0, "w_vertical": 38400.0,
            "n_potencia_inclinado": 200, "n_potencia_vertical": 200, "filas": 200}
    return {**base, **campos}


@pytest.fixture
def energia_de_un_dia(monkeypatch):
    """Un día completo, sin tocar la base ni el store de calidad."""
    monkeypatch.setattr(energia_analitica, "por_dia", lambda v: [_dia_energia()])
    monkeypatch.setattr(contexto, "confianza", lambda *a, **k: dict(CONFIANZA))


def test_energia_devuelve_el_mismo_cuerpo_que_la_tool(sin_clave, energia_de_un_dia):
    # Given el mismo cálculo detrás de la tool y del endpoint

    # When se piden los dos
    r = CLIENTE.get("/analitica/energia")
    de_la_tool = api.tools.energia.run()

    # Then el endpoint es la tool MAS `ventana`: ninguna clave cambia de nombre
    assert r.status_code == 200
    cuerpo = r.json()
    assert set(cuerpo) - set(de_la_tool) == {"ventana"}
    assert {k: v for k, v in cuerpo.items() if k != "ventana"} == de_la_tool
    assert cuerpo["ventana"] == cuerpo["periodo"]


def test_energia_conserva_los_bloques_que_la_consola_muestra(sin_clave,
                                                             energia_de_un_dia):
    # Given una respuesta cualquiera

    # When la consola la lee
    cuerpo = CLIENTE.get("/analitica/energia").json()

    # Then siguen ahí la confianza, las dos energías AC y las claves heredadas en Wh
    assert cuerpo["confianza"]["disponibilidad"] == CONFIANZA["disponibilidad"]
    assert cuerpo["energia_ac"]["registrada_kwh"]["valor"] == 6.83
    assert cuerpo["energia_ac"]["significado"]["no_registrada_kwh"]
    # La clave heredada es la MISMA energía en Wh, no otra cuenta
    assert cuerpo["energia_pv1_inclinado_kwh"]["valor"] == 3.96
    assert cuerpo["energia_pv1_inclinado_wh"] == 3960.0


def test_energia_sin_datos_devuelve_el_sobre_con_motivo(sin_clave, monkeypatch):
    # Given una ventana real pero sin ni una fila
    monkeypatch.setattr(energia_analitica, "por_dia", lambda v: [])
    monkeypatch.setattr(contexto, "confianza", lambda *a, **k: dict(CONFIANZA))

    # When se pide
    r = CLIENTE.get("/analitica/energia",
                    params={"desde": "2025-02-01", "hasta": "2025-03-01"})

    # Then ni 500 ni 0 kWh generados: None con su motivo, que es lo que la UI lee
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["energia_ac"]["registrada_kwh"]["valor"] is None
    assert cuerpo["energia_ac"]["registrada_kwh"]["motivo"] == "sin_lecturas"
    assert cuerpo["energia_pv1_inclinado_kwh"]["valor"] is None
    assert cuerpo["energia_pv1_inclinado_wh"] is None


# ── El catálogo por HTTP: la lista que el frontend estaba espejando a mano ─────
# Los seis nombres de COLUMNA CRUDA que la tool `catalogo_variables` publica y que
# `/analitica/series` rechaza con 400. Están acá con nombre y apellido porque son la
# deuda que este endpoint viene a pagar: si alguno reaparece como clave, volvimos.
CRUDAS_QUE_NO_SON_CLAVES = ("irradiancia_incidente", "irradiancia_reflejada",
                            "irradiancia_incidente_sp722",
                            "irradiancia_reflejada_sp722",
                            "detector_incidente_mv", "detector_reflejado_mv")
# Las que la tool NO trae y sí se pueden graficar.
FALTABAN_EN_LA_TOOL = ("poa_pv1_wm2", "poa_pv2_wm2", "poa_pv1_front_wm2",
                       "poa_pv2_front_wm2", "cs_ghi_wm2", "kt_star")


@pytest.fixture
def sin_base(monkeypatch):
    """Toda consulta devuelve vacío: se ejercita la validación, no los números."""
    monkeypatch.setattr(db, "query", lambda *a, **k: [])


def _variables() -> dict:
    """El catálogo publicado, indexado por clave."""
    r = CLIENTE.get("/analitica/variables")
    assert r.status_code == 200
    return {v["clave"]: v for v in r.json()["variables"]}


def test_variables_publica_los_campos_que_la_consola_necesita(sin_clave):
    # Given la vista de Series, que hoy duplica esta lista a mano

    # When pide el catálogo
    por_clave = _variables()

    # Then cada variable trae los ocho campos del contrato más `graficable`
    esperados = {"clave", "etiqueta", "unidad", "familia", "dato_desde", "dato_hasta",
                 "hueco", "fuente_ausente", "graficable"}
    assert por_clave and all(set(v) == esperados for v in por_clave.values())
    # y las fechas viajan en ISO, no como objetos
    assert por_clave["poa_pv1_wm2"]["dato_desde"] == "2025-09-05"
    assert por_clave["irradiancia_incidente_sp722_wm2"]["dato_hasta"] == "2026-05-28"


def test_toda_clave_graficable_la_acepta_series(sin_clave, sin_base):
    # Given las claves que el endpoint anuncia como dibujables
    graficables = [c for c, v in _variables().items() if v["graficable"]]
    assert graficables

    # When se le pide a `/analitica/series` cada una, una por una
    rechazadas = {
        clave: CLIENTE.get("/analitica/series",
                           params={"variables": clave, "desde": "2026-04-01",
                                   "hasta": "2026-04-08"}).status_code
        for clave in graficables
    }

    # Then ninguna se cae: es el amarre que impide que las dos listas se separen y
    # que el usuario se entere por un 400 en la cara
    assert {c: e for c, e in rechazadas.items() if e != 200} == {}


def test_variables_trae_lo_que_el_diccionario_de_columnas_pierde(sin_clave):
    # Given el problema medido por el equipo de Series contra `catalogo_variables`
    por_clave = _variables()

    # When se compara con lo que publica este endpoint

    # Then ni un nombre de columna cruda se cuela como clave
    assert not [c for c in CRUDAS_QUE_NO_SON_CLAVES if c in por_clave]
    # y las que la tool escondía están, y se pueden graficar
    assert all(por_clave[c]["graficable"] for c in FALTABAN_EN_LA_TOOL)


def test_una_variable_sin_fuente_sale_marcada_y_con_su_porque(sin_clave):
    # Given una variable que el documento pide y ninguna tabla tiene

    # When la consola lee el catálogo
    humedad = _variables()["humedad_relativa_pct"]

    # Then no se ofrece, y se dice por qué: la vista no tiene que probar y fallar
    assert humedad["graficable"] is False
    assert "no esta ingestado" in humedad["fuente_ausente"]


def test_el_hueco_interior_viaja_porque_las_fechas_no_lo_pueden_decir(sin_clave):
    # Given los acumuladores por arreglo: 144 días, ninguno de nov-2025 a feb-2026
    contador = _variables()["energia_pv1_wh"]

    # When la vista se queda sin datos en ese tramo

    # Then puede decir "no existía todavía" en vez de "no hay datos": el agujero es
    # INTERIOR y `dato_desde`/`dato_hasta` no lo pueden expresar
    assert contador["dato_desde"] is None and contador["dato_hasta"] is None
    assert "2025-11" in contador["hueco"] and "144 dias" in contador["hueco"]
    assert catalogo.CATALOGO["energia_pv1_wh"].hueco == contador["hueco"]


# ── Paginación de hallazgos y vigilancia del período ──────────────────────────
# La clave (fecha, fuente, variable, tipo) de `hallazgos_calidad`: es la PRIMARY KEY,
# o sea el único desempate que garantiza un orden TOTAL. Acá se usa para identificar
# cada hallazgo entre páginas.
PK_HALLAZGO = ("fecha", "fuente", "variable", "tipo")


def _pk(hallazgo: dict) -> tuple:
    return tuple(hallazgo[campo] for campo in PK_HALLAZGO)


# Siete hallazgos que EMPATAN en el orden viejo de a pares: el mismo día y el mismo
# tipo escrito por las dos fuentes. Son justo el caso que hacía repetir uno y saltar
# otro entre página y página.
STORE = [
    {"fecha": "2026-04-0%d" % (4 - i // 2), "fuente": f, "variable": "*",
     "tipo": "dia_incompleto", "severidad": "grave", "n_afectadas": 10, "detalle": {}}
    for i, f in enumerate(["radiacion_sc_15s", "monitoreo_sc_electrico"] * 3)
] + [{"fecha": "2026-04-01", "fuente": "radiacion_sc_15s", "variable": "albedo",
      "tipo": "nulos", "severidad": "aviso", "n_afectadas": 3, "detalle": {}}]


@pytest.fixture
def store_paginado(monkeypatch):
    """Una base falsa que respeta LIMIT/OFFSET: se prueba la paginación, no el SQL."""
    visto = {}

    def query(sql, params=()):
        if "count(*)" in sql:
            visto["filtro_del_conteo"] = params
            return [{"n": len(STORE)}]
        visto["filtro_de_la_pagina"] = params[:-2]
        limite, offset = params[-2], params[-1]
        return [dict(f) for f in STORE[offset:offset + limite]]

    monkeypatch.setattr(db, "query", query)
    return visto


def _pagina(offset: int, limite: int = 3, **filtros) -> dict:
    r = CLIENTE.get("/calidad/hallazgos",
                    params={"offset": offset, "limite": limite, **filtros})
    assert r.status_code == 200
    return r.json()


def test_dos_paginas_seguidas_no_comparten_hallazgos_y_juntas_cubren_el_total(
        sin_clave, store_paginado):
    # Given un filtro con más hallazgos que una página

    # When se recorre página por página
    paginas = [_pagina(offset) for offset in (0, 3, 6)]

    # Then ni uno se repite y entre todas está el total: es el test que atrapa el
    # orden ambiguo, que uno de "offset=3 devuelve 3 filas" no atraparía nunca
    vistos = [_pk(h) for pagina in paginas for h in pagina["hallazgos"]]
    assert len(vistos) == len(set(vistos)) == paginas[0]["total"] == len(STORE)


def test_el_total_es_el_del_filtro_y_no_el_de_la_pagina(sin_clave, store_paginado):
    # Given una página de 3 sobre 7 hallazgos

    # When la vista la pide
    primera = _pagina(0)

    # Then puede decir "mostrando 3 de 7": un listado que se corta callado es la
    # versión de interfaz del mismo problema que perseguimos en los datos
    assert (primera["total"], primera["devueltos"]) == (len(STORE), 3)
    assert primera["truncado"] is True
    assert primera["pagina"] == {"offset": 0, "limite": 3, "hay_mas": True,
                                 "siguiente_offset": 3}


def test_la_ultima_pagina_no_ofrece_una_siguiente(sin_clave, store_paginado):
    # Given el final del listado

    # When se pide la última página
    ultima = _pagina(6)

    # Then la vista sabe que llegó al final sin tener que hacer la cuenta
    assert ultima["devueltos"] == 1 and ultima["truncado"] is False
    assert ultima["pagina"]["hay_mas"] is False
    assert ultima["pagina"]["siguiente_offset"] is None


def test_el_conteo_y_la_pagina_miran_el_mismo_filtro(sin_clave, store_paginado):
    # Given un filtro por tipo

    # When se pide una página
    _pagina(0, tipo="dia_incompleto", severidad="grave")

    # Then el total sale del MISMO where que las filas: un total calculado sobre
    # otro filtro se lee como cierto y no lo es
    assert store_paginado["filtro_del_conteo"] == store_paginado["filtro_de_la_pagina"]


def test_el_orden_de_paginacion_es_total(sin_clave):
    # Given que paginar sobre un orden ambiguo repite y saltea sin dar error

    # When se mira por qué ordena el endpoint
    orden = api._ORDEN_HALLAZGOS

    # Then están los cuatro campos de la PRIMARY KEY: no hay dos filas que empaten
    assert all(campo in orden for campo in PK_HALLAZGO)


@pytest.fixture
def resumen_sin_base(monkeypatch):
    """Solo la consulta de vigilancia es real; el resto de la cabecera va stubeada.

    `calidad_periodo` se stubea por `tareas`/`componer` y no por `run`: el endpoint
    pide sus dos consultas SUELTAS para mandarlas en la misma tanda que las otras
    tres. Llamar a `run` desde dentro de un `en_paralelo` las dejaria en fila (ver
    la nota de anidamiento en `db.en_paralelo`) y ese bloque volveria a ser el que
    marca el reloj de la primera pintura de la vista.
    """
    from historico.calidad import reporte
    from historico.tools import calidad_periodo, cielo_periodo
    monkeypatch.setattr(calidad_periodo, "tareas",
                        lambda *a, **k: (lambda: {"dias_utilizables": 0}, lambda: []))
    monkeypatch.setattr(calidad_periodo, "componer",
                        lambda *a, **k: {"veredicto": "ok"})
    monkeypatch.setattr(cielo_periodo, "run", lambda *a, **k: {"dias": 0})
    monkeypatch.setattr(reporte, "hallazgos_por_tipo", lambda *a, **k: [])
    monkeypatch.setattr(db, "query", lambda sql, p=(): [{"variable": "poa_pv1_wm2",
                                                         "n": 19}])


def _vigilancia() -> dict:
    r = CLIENTE.get("/calidad/resumen")
    assert r.status_code == 200
    return r.json()["vigilancia"]


def test_el_resumen_dice_a_que_variables_no_las_miro_nadie(sin_clave, resumen_sin_base):
    # Given la cabecera de la vista de Calidad

    # When la pide
    vigilancia = _vigilancia()
    ciegas = {c["clave"]: c for c in vigilancia["sin_vigilancia"]}

    # Then el examen en blanco deja de leerse como un aprobado, sin tener que
    # reconstruirlo desde `medido_sobre` ni desde `hallazgos?tipo=sin_fuente`
    assert "potencia_pv1_w" in vigilancia["vigiladas"]
    assert {"albedo", "kt_star", "cs_ghi_wm2", "poa_pv1_wm2"} <= set(ciegas)
    assert ciegas["kt_star"]["motivo"] == "variable_derivada"
    assert ciegas["humedad_relativa_pct"]["motivo"] == "sin_fuente_en_la_base"


def test_sin_vigilancia_no_quiere_decir_sin_hallazgos(sin_clave, resumen_sin_base):
    # Given la POA: nadie la barre y sin embargo `radiacion_sc_poa` tiene hallazgos
    poa = {c["clave"]: c for c in _vigilancia()["sin_vigilancia"]}["poa_pv1_wm2"]

    # When la vista lee su renglón

    # Then las dos cosas viajan separadas y no puede afirmar la falsa: TIENE
    # hallazgos, lo que pasa es que el veredicto no los puede ver
    assert poa["hallazgos_en_el_periodo"] == 19
    assert poa["cuentan_para_el_veredicto"] is False
    assert poa["motivo"] == "fuente_sin_denominador"
    # y el caso contrario: su tabla sí se cuenta, solo que el barrido no mira esa columna
    albedo = {c["clave"]: c for c in _vigilancia()["sin_vigilancia"]}["albedo"]
    assert albedo["cuentan_para_el_veredicto"] is True
    assert albedo["motivo"] == "columna_no_barrida"


def test_las_fuentes_del_veredicto_se_derivan_y_no_se_copian(sin_clave,
                                                             resumen_sin_base):
    # Given que los dos nombres viven dentro del CTE `filas_dia` de `contexto`
    from historico.calidad import contexto

    # When el resumen los publica
    fuentes = _vigilancia()["fuentes_del_veredicto"]

    # Then son los mismos: si `contexto` aprende a contar una tercera tabla, esta
    # respuesta no se queda vieja en silencio
    assert fuentes and all(f in contexto._SQL_DIAS for f in fuentes)


def test_la_vigilancia_publica_el_TOTAL_de_hallazgos_que_no_pesan(sin_clave,
                                                                  resumen_sin_base):
    # Given la POA, que acumula hallazgos y ninguno pesa jamas en el veredicto
    vigilancia = _vigilancia()
    ciegas = {c["clave"]: c for c in vigilancia["sin_vigilancia"]}

    # When la vista lee el bloque
    # Then el titular viaja SUMADO. La consola no puede sumarlo (no se calcula en el
    # navegador), asi que sin este total mostraba el corte y la mayor de las partes
    # en vez del numero que hace pesar la advertencia.
    assert ciegas["poa_pv1_wm2"]["hallazgos_en_el_periodo"] == 19
    assert vigilancia["hallazgos_sin_peso"] == 19


def test_el_total_sin_peso_deja_fuera_a_las_que_SI_cuentan():
    # Given dos variables sin vigilancia con hallazgos: una cuya fuente entra en el
    # veredicto (`albedo`) y otra cuya fuente no tiene denominador (la POA)
    conteo = {"albedo": 7, "poa_pv1_wm2": 19}

    # When se arma el bloque
    vigilancia = api._vigilancia(conteo)
    ciegas = {c["clave"]: c for c in vigilancia["sin_vigilancia"]}

    # Then solo suma las que NO pesan. Sumarlas todas diria que el veredicto ignora
    # mas de lo que ignora, que es el error opuesto y igual de falso.
    assert ciegas["albedo"]["cuentan_para_el_veredicto"] is True
    assert ciegas["poa_pv1_wm2"]["cuentan_para_el_veredicto"] is False
    assert vigilancia["hallazgos_sin_peso"] == 19
