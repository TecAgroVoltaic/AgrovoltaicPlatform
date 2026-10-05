"""Las dos tools de calidad: el veredicto del periodo y el detalle de hallazgos.

Aca no se prueba el criterio (eso vive en `test_contexto`) sino el CABLEADO, que
es donde estan los fallos silenciosos de estas dos:

  * `calidad_periodo` le pasaba la `fuente` a `confianza()` en la posicion de
    `variables`. Como `variables` es una lista de columnas y le llegaba una
    cadena, se consumia letra por letra: ninguna columna se llama `m`, ni `o`, ni
    `n`, ningun hallazgo por variable cruzaba el filtro y TODOS los dias salian
    utilizables. La tool que existe para decir si los datos sirven contestaba que
    si, siempre, y no habia forma de notarlo mirando la salida.
  * `hallazgos_calidad` traduce el tipo al castellano con `QUE_ES`, que ademas es
    el `enum` del filtro. Un tipo que falte ahi no sale mal traducido: sale
    INFILTRABLE. Se habia quedado con los doce tipos del primer detector mientras
    el barrido escribia dieciocho mas.

`historico.db` se sustituye por un doble. `contexto` y las dos tools hacen
`from historico import db`, o sea que guardan la referencia al MODULO: parchear
sus atributos alcanza para los tres.

Estructura Given-When-Then.
"""
from __future__ import annotations

import pytest

from historico import db
from historico.calidad import contexto
from historico.tools import calidad_periodo, hallazgos

ELE = "monitoreo_sc_electrico"
RAD = "radiacion_sc_15s"
DESDE, HASTA = "2026-01-01", "2026-02-01"
DIAS = [f"2026-01-{d:02d}" for d in range(1, 32)]        # enero entero
LECTURAS = 144                                            # dia completo a 5 min


def _hallazgo(fecha, variable, tipo="fuera_de_rango", severidad="grave",
              n=LECTURAS, fuente=ELE):
    return {"fecha": fecha, "fuente": fuente, "variable": variable, "tipo": tipo,
            "severidad": severidad, "n_afectadas": n}


class BaseFalsa:
    """Doble de `historico.db` que RESPETA el filtro de la consulta de hallazgos.

    Filtrar en el doble no es adorno: el defecto que estas pruebas fijan vive
    exactamente ahi. La consulta de confianza pide
    `variable = ANY(%s) OR variable = '*' OR tipo = ANY(%s)`, y con `variables`
    convertido en una lista de letras el primer disyunto no acierta nunca. Un
    doble que devolviera todo lo que tiene no podria distinguir el codigo roto del
    arreglado.

    Los tres insumos de `confianza` viajan en UNA sola consulta desde que se
    fusionaron (eran tres viajes al pooler para un bloque que va dentro de casi
    toda respuesta), asi que el doble devuelve la fila unica con sus tres arreglos
    y con la MISMA forma que arma `json_agg` en `_SQL_CONFIANZA`: el calendario
    como fechas ISO, las filas por dia como tripletas y los hallazgos como objetos.
    """

    def __init__(self, hallazgos_guardados=(), filas=None, calendario=None):
        self.hallazgos = list(hallazgos_guardados)
        self.filas = ({(d, ELE): LECTURAS for d in DIAS} if filas is None else filas)
        self.calendario = DIAS if calendario is None else calendario
        self.variables_pedidas: list = []

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        if "AS calendario" in sql:
            # Las variables y los tipos son los dos ultimos parametros del bloque
            # de hallazgos; los seis primeros son los tres pares desde/hasta.
            variables, tipos = params[8], params[9]
            self.variables_pedidas.append(variables)
            return [{
                "calendario": list(self.calendario),
                "filas": [[f, s, n] for (f, s), n in self.filas.items()],
                "hallazgos": [h for h in self.hallazgos
                              if h["variable"] in variables or h["variable"] == "*"
                              or h["tipo"] in tipos],
            }]
        if "GROUP BY tipo, severidad" in sql:
            return []                       # `problemas_mas_frecuentes`: no se mide aca
        raise AssertionError(f"consulta inesperada: {sql}")


@pytest.fixture
def base(monkeypatch):
    def instalar(**kw) -> BaseFalsa:
        doble = BaseFalsa(**kw)
        monkeypatch.setattr(db, "query", doble.query)
        return doble
    return instalar


# ══════════════════════════════════════════════════════════════════════════
# El defecto: la fuente se colaba en la lista de variables
# ══════════════════════════════════════════════════════════════════════════
def test_acotar_por_fuente_sigue_condenando_los_dias_que_corresponden(base):
    # Given un DS18B20 muerto todo enero: un grave que toca las 144 lecturas de
    # cada dia, o sea material por donde se lo mire
    base(hallazgos_guardados=[_hallazgo(d, "temp_inclinado") for d in DIAS])

    # When se pregunta por la calidad de esa fuente
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then ni un dia es utilizable. Con la fuente en la posicion de `variables`,
    # los 31 salian utilizables y la tool declaraba el mes sano.
    assert salida["veredicto"]["dias_con_datos"] == 31
    assert salida["veredicto"]["dias_utilizables"] == 0


def test_la_fuente_viaja_por_su_nombre_y_no_como_lista_de_columnas(base):
    # Given cualquier periodo
    doble = base()

    # When se acota por fuente
    calidad_periodo.run(DESDE, HASTA, ELE)

    # Then lo que llego a `variables` son columnas de verdad, no las letras de la
    # fuente. Es la forma exacta del defecto y se comprueba en la consulta misma.
    pedidas = doble.variables_pedidas[0]
    assert "temp_inclinado" in pedidas and "voltaje_vac" in pedidas
    assert not any(len(v) == 1 for v in pedidas), "la fuente se consumio letra a letra"


def test_el_veredicto_dice_sobre_que_columnas_se_midio(base):
    # Given un mes cualquiera
    base()

    # When se pide el veredicto
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then `medido_sobre` es la lista de columnas y nunca "sin acotar": una lista
    # vacia no significa "todas", significa "ninguna", y con ella `reducir()` no
    # tiene sobre que llevar la cuenta y aprueba el periodo entero.
    medido = salida["veredicto"]["medido_sobre"]
    assert isinstance(medido, list) and medido


def test_una_columna_rota_no_condena_a_las_demas(base):
    # Given la frecuencia AC rota todo enero y el resto impecable
    base(hallazgos_guardados=[_hallazgo(d, "frecuencia_hz") for d in DIAS])

    # When se pregunta por la fuente electrica
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then el titular es conservador (0 dias) pero el desglose salva lo que si
    # sirve: sin el, "enero no sirve" descartaria una potencia DC impecable.
    veredicto = salida["veredicto"]
    assert veredicto["dias_utilizables"] == 0
    assert veredicto["por_variable"]["potencia_pv1_w"]["dias_utilizables"] == 31
    assert veredicto["por_variable"]["frecuencia_hz"]["dias_utilizables"] == 0


def test_un_hallazgo_puntual_no_condena_el_dia(base):
    # Given 5 lecturas de 144 fuera de rango en un solo dia
    base(hallazgos_guardados=[_hallazgo(DIAS[0], "potencia_pv1_w", n=5)])

    # When se pregunta por el mes
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then no pasa nada: arreglar el filtro no puede convertirse en lo contrario,
    # condenar el calendario entero por hallazgos que no son materiales.
    assert salida["veredicto"]["dias_utilizables"] == 31


def test_el_periodo_sin_datos_no_inventa_dias_utilizables(base):
    # Given un mes de calendario sin ninguna lectura
    base(filas={})

    # When se pregunta
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then se ve el vacio en vez de un aprobado
    assert salida["veredicto"]["dias_con_datos"] == 0
    assert "no tiene datos" in salida["veredicto"]["advertencia"]


# ══════════════════════════════════════════════════════════════════════════
# La planta parada llega al usuario, y por su propio canal
# ══════════════════════════════════════════════════════════════════════════
def test_la_planta_parada_se_reporta_y_NO_baja_los_dias_utilizables(base):
    # Given doce dias de enero con el inversor sin acoplar bajo sol pleno
    parados = DIAS[:12]
    base(hallazgos_guardados=[_hallazgo(d, "voltaje_vac", tipo="inversor_sin_acoplar")
                              for d in parados])

    # When se pregunta por la calidad del mes
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then el dato de esos dias sigue siendo bueno (la energia de un mes con la
    # planta parada es EXACTA, y es baja por la parada)
    veredicto = salida["veredicto"]
    assert veredicto["dias_utilizables"] == 31
    # y la averia se ve, por un canal propio y con su propia advertencia
    disponibilidad = veredicto["disponibilidad"]
    assert disponibilidad["dias_con_planta_parada"] == 12
    assert disponibilidad["dias_parada_bajo_sol"] == 12
    assert "NO baja" in disponibilidad["nota"]


def test_la_disponibilidad_llega_aunque_la_variable_no_este_en_la_lista(base):
    # Given un apagon sobre una columna AC que el filtro por variable no pidiera
    base(hallazgos_guardados=[_hallazgo(DIAS[0], "potencia_total_wac",
                                        tipo="inversor_sin_acoplar")])

    # When se pregunta acotando a la fuente
    salida = calidad_periodo.run(DESDE, HASTA, ELE)

    # Then igual se cuenta: que la planta estuviera parada es un hecho del DIA, y
    # `confianza` lo pide por tipo ademas de por variable justamente para eso.
    assert salida["veredicto"]["disponibilidad"]["dias_con_planta_parada"] == 1


# ══════════════════════════════════════════════════════════════════════════
# `variables_vigiladas`: derivada del catalogo, con el nombre del store
# ══════════════════════════════════════════════════════════════════════════
def test_las_variables_salen_con_el_nombre_con_que_el_store_las_guarda():
    # Given el catalogo llama `irradiancia_incidente_wm2` a lo que la tabla de
    # hallazgos guarda como `irradiancia_incidente`
    vigiladas = calidad_periodo.variables_vigiladas(RAD)

    # Then se pide el nombre del STORE: con el del catalogo el filtro no
    # encontraria nada, y cero hallazgos se lee como dato impecable.
    assert "irradiancia_incidente" in vigiladas
    assert "irradiancia_incidente_wm2" not in vigiladas


def test_acotar_por_fuente_deja_fuera_las_columnas_de_la_otra():
    # Given las dos fuentes
    electricas = calidad_periodo.variables_vigiladas(ELE)
    radiacion = calidad_periodo.variables_vigiladas(RAD)

    # Then no se mezclan: pedir el veredicto electrico no puede condenarse con un
    # piranometro roto, ni al reves
    assert "voltaje_vac" in electricas and "irradiancia_incidente" not in electricas
    assert set(electricas).isdisjoint(radiacion)


def test_sin_fuente_se_miran_las_columnas_de_las_dos():
    # Given ninguna fuente pedida
    todas = calidad_periodo.variables_vigiladas()

    # Then estan las de las dos tablas, que es lo que significa "omitir la fuente"
    assert set(calidad_periodo.variables_vigiladas(ELE)) <= set(todas)
    assert set(calidad_periodo.variables_vigiladas(RAD)) <= set(todas)


def test_solo_entran_las_que_el_barrido_de_verdad_vigila():
    # Given variables del catalogo que nadie revisa (la POA es modelada, `kt_star`
    # es derivada): su ausencia de hallazgos no dice que esten sanas
    todas = calidad_periodo.variables_vigiladas()

    # Then no entran al veredicto: contarlas como limpias seria afirmar algo que
    # nadie midio.
    assert "poa_pv1_wm2" not in todas and "kt_star" not in todas
    assert todas, "sin variables el veredicto aprueba el periodo entero"


# ══════════════════════════════════════════════════════════════════════════
# `QUE_ES` contra el registro: que no se puedan desincronizar en silencio
# ══════════════════════════════════════════════════════════════════════════
def test_QUE_ES_explica_TODOS_los_tipos_que_los_detectores_escriben():
    # Given los tipos derivados de los tres detectores que llenan la tabla
    escritos = set(hallazgos.TIPOS_QUE_SE_ESCRIBEN)

    # Then el diccionario los explica a todos. `QUE_ES` es ademas el `enum` del
    # filtro: un tipo que falte no sale mal traducido, sale INFILTRABLE.
    faltan = sorted(escritos - set(hallazgos.QUE_ES))
    assert not faltan, f"tipos que el barrido escribe y `QUE_ES` no explica: {faltan}"


def test_QUE_ES_no_explica_tipos_que_nadie_escribe():
    # Then tampoco sobra ninguno: un tipo de mas en el `enum` es una opcion que el
    # modelo puede elegir para no traer jamas una fila.
    sobran = sorted(set(hallazgos.QUE_ES) - set(hallazgos.TIPOS_QUE_SE_ESCRIBEN))
    assert not sobran, f"tipos ofrecidos que ningun detector escribe: {sobran}"


def test_el_hallazgo_de_la_planta_parada_se_puede_filtrar_y_viene_traducido():
    # Given el tipo que estrena la quinta familia
    enum = hallazgos.SCHEMA["input_schema"]["properties"]["tipo"]["enum"]
    assert "inversor_sin_acoplar" in enum

    # Then su traduccion dice lo que hay que entender: el dato es bueno y lo que
    # fallo es el equipo. Es la distincion entera de la familia.
    texto = hallazgos.QUE_ES["inversor_sin_acoplar"]
    assert "EQUIPO" in texto and "DATO" in texto


def test_el_enum_del_filtro_es_el_mismo_diccionario_de_traducciones():
    # Given los dos usos de `QUE_ES`
    enum = hallazgos.SCHEMA["input_schema"]["properties"]["tipo"]["enum"]

    # Then son la misma lista: en dos, una se actualiza y la otra no.
    assert enum == list(hallazgos.QUE_ES)


# ══════════════════════════════════════════════════════════════════════════
# El contrato con `calidad.contexto`
# ══════════════════════════════════════════════════════════════════════════
def test_la_tool_llama_a_confianza_con_la_firma_que_confianza_declara():
    # Given la firma de `confianza(desde, hasta, variables, fuente)`
    import inspect

    parametros = list(inspect.signature(contexto.confianza).parameters)

    # Then el tercer parametro es `variables` y el cuarto `fuente`. Este test
    # existe porque el defecto fue exactamente confundirlos, y una firma que
    # cambie de orden lo volveria a habilitar sin que nada reviente.
    assert parametros[:4] == ["desde", "hasta", "variables", "fuente"]
