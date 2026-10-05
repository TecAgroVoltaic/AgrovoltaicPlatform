"""Familia 5: disponibilidad del equipo. La planta parada NO es un dato malo.

Todas corren sin base de datos: la prueba es una funcion pura y `reducir()`
tambien, que es lo que permite fijar aca la decision de fondo en vez de
descubrirla corriendo el agente contra produccion.

Lo que se defiende, en orden de importancia:

  1. que un dia entero de `inversor_sin_acoplar` NO baje la confianza del dato
     (`test_un_dia_de_planta_parada_no_baja_la_confianza_del_dato`);
  2. que la prueba NUNCA se calle por falta de irradiancia, que es lo que
     protege los 3 apagones de dia entero de 2025-05-07, 2025-05-26 y 2026-01-05;
  3. que el cruce con la irradiancia vaya por bin de 5 min y no por timestamp
     exacto, que es el error que este proyecto ya cometio una vez.

Cada una fallaria con el codigo anterior a esta tanda: el tipo no existia, el 0
salia `fuera_de_rango` grave y `reducir` lo contaba como material.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta

from historico.analitica import catalogo
from historico.calidad.contexto import (
    TIPOS_DE_DISPONIBILIDAD, TIPOS_QUE_INVALIDAN, reducir,
)
from historico.calidad.pruebas import disponibilidad, registro, umbrales, validez_fisica
from historico.calidad.pruebas.contrato import (
    AVISO, CRUDO, GRAVE, Contexto, NoAplica, Serie,
)

FECHA = date(2026, 3, 15)
ELECTRICO = "monitoreo_sc_electrico"
RADIACION = "radiacion_sc_15s"
SIN_NADA = Contexto()

SOL_PLENO = 620.0            # muy por encima de los 300 W/m2 de R3
POCO_SOL = 90.0              # la banda donde "se desconecto por poca luz" es honesta


def _marcas(desde_hora: int, n: int, cadencia_seg: int = 300, desde_min: int = 0,
            segundos: int = 0, dia: date = FECHA) -> list[datetime]:
    """Marcas de un dia. `segundos` desalinea el reloj, como en la base real."""
    arranque = datetime.combine(dia, datetime.min.time()).replace(
        hour=desde_hora, minute=desde_min, second=segundos)
    return [arranque + timedelta(seconds=cadencia_seg * i) for i in range(n)]


def _serie(clave: str, valores, marcas=None, dia: date = FECHA) -> Serie:
    return Serie(variable=catalogo.obtener(clave), fuente=ELECTRICO, fecha=dia,
                 origen=CRUDO, marcas=marcas or _marcas(12, len(valores)),
                 valores=valores)


def _con_sol(marcas, ghi: float) -> disponibilidad.ContextoDisponibilidad:
    """El contexto con la irradiancia ya emparejada por bin, como en produccion."""
    return disponibilidad.ContextoDisponibilidad(
        irradiancia_por_bin=disponibilidad.irradiancia_por_bin(
            marcas, [ghi] * len(marcas)))


# ══════════════════════════════════════════════════════════════════════════
# La regla: hora para marcar, irradiancia para graduar
# ══════════════════════════════════════════════════════════════════════════
def test_cero_al_mediodia_con_sol_pleno_es_grave():
    """Given el inversor en 0 V al mediodia con 620 W/m2,
    When se evalua la disponibilidad,
    Then hay un `inversor_sin_acoplar` GRAVE.

    Es el caso que la regla existe para ver y el que el codigo viejo llamaba
    `fuera_de_rango` del DATO. Medido: 2.728 lecturas en 69 dias caen aca.
    """
    marcas = _marcas(12, 12)
    serie = _serie("voltaje_vac", [0.0] * 12, marcas)

    hallazgo = disponibilidad.inversor_sin_acoplar(serie, _con_sol(marcas, SOL_PLENO))[0]

    assert (hallazgo.tipo, hallazgo.severidad) == ("inversor_sin_acoplar", GRAVE)
    assert hallazgo.n_afectadas == 12
    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_BAJO_SOL
    assert hallazgo.detalle["lecturas_con_sol"] == 12


def test_el_mismo_cero_con_poca_irradiancia_baja_a_aviso():
    """Given el mismo apagon pero con 90 W/m2,
    Then sigue habiendo hallazgo, en AVISO: la desconexion por poca luz es una
    explicacion admisible, pero no es motivo para no reportarla.
    """
    marcas = _marcas(12, 12)
    serie = _serie("voltaje_vac", [0.0] * 12, marcas)

    hallazgo = disponibilidad.inversor_sin_acoplar(serie, _con_sol(marcas, POCO_SOL))[0]

    assert hallazgo.severidad == AVISO
    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_IRRADIANCIA_BAJA
    assert hallazgo.detalle["lecturas_con_sol"] == 0


def test_sin_dato_de_irradiancia_la_prueba_NO_se_calla():
    """Given un apagon en un dia sin irradiancia (los 46 dias previos al
    2025-07-01, que la vista devuelve en NULL por decision del equipo),
    When se evalua sin mapa de irradiancia,
    Then el hallazgo sale igual, en AVISO y con motivo `sin_irradiancia`.

    ES EL TEST QUE PROTEGE LOS 3 APAGONES DE DIA ENTERO. Con la irradiancia como
    FILTRO (`GHI >= 300`, que con NULL es falso) se perdian 8 dias en silencio,
    tres de ellos completos: 2025-05-07, 2025-05-26 y 2026-01-05. Un detector que
    se apaga solo y no lo dice es peor que no tenerlo.
    """
    dia = date(2025, 5, 7)
    marcas = _marcas(12, 12, dia=dia)
    serie = _serie("voltaje_vac", [0.0] * 12, marcas, dia=dia)

    hallazgo = disponibilidad.inversor_sin_acoplar(serie, SIN_NADA)[0]

    assert (hallazgo.severidad, hallazgo.n_afectadas) == (AVISO, 12)
    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_SIN_IRRADIANCIA
    assert hallazgo.detalle["lecturas_sin_irradiancia"] == 12
    assert hallazgo.detalle["ghi_max_wm2"] is None
    assert "2025-07-01" in hallazgo.detalle["nota"]


def test_un_dia_encapotado_con_apagon_completo_sigue_saliendo():
    """Given el 2026-01-05: apagon de dia entero con pico de GHI de 292 W/m2,
    Then sale igual, como aviso.

    El umbral de 300 lo descarta por 8 W/m2, y a 292 W/m2 un arreglo de 2,84 kWp
    deberia estar dando del orden de 700 W. Como filtro duro, la irradiancia
    enmascara apagones reales; como graduador, solo les baja la severidad.
    """
    dia = date(2026, 1, 5)
    marcas = _marcas(11, 12, dia=dia)
    serie = _serie("voltaje_vac", [0.0] * 12, marcas, dia=dia)

    hallazgos = disponibilidad.inversor_sin_acoplar(serie, _con_sol(marcas, 292.0))

    assert len(hallazgos) == 1
    assert hallazgos[0].severidad == AVISO
    assert hallazgos[0].detalle["ghi_max_wm2"] == 292.0


def test_una_sola_lectura_bajo_sol_pleno_ya_hace_grave_el_dia():
    """Given un dia caido entero del que solo una ventana tuvo sol pleno,
    Then el dia es grave.

    Que el cielo se cerrara a las 15:00 no explica que el inversor estuviera
    caido a las 12:00. Es el criterio que reproduce los 69 dias medidos.
    """
    marcas = _marcas(12, 6)
    mapa = dict.fromkeys(
        (disponibilidad.bin_de_emparejamiento(m) for m in marcas), POCO_SOL)
    mapa[disponibilidad.bin_de_emparejamiento(marcas[0])] = SOL_PLENO
    serie = _serie("voltaje_vac", [0.0] * 6, marcas)

    hallazgo = disponibilidad.inversor_sin_acoplar(
        serie, disponibilidad.ContextoDisponibilidad(irradiancia_por_bin=mapa))[0]

    assert hallazgo.severidad == GRAVE
    assert (hallazgo.detalle["lecturas_con_sol"],
            hallazgo.detalle["lecturas_con_poco_sol"]) == (1, 5)


# ══════════════════════════════════════════════════════════════════════════
# La ventana 07:00-17:00: hora LOCAL, sin convertir zona
# ══════════════════════════════════════════════════════════════════════════
def test_un_cero_a_las_tres_de_la_madrugada_no_genera_nada():
    """Given ceros a las 03:00, fuera del horario operativo de R3,
    Then no hay hallazgo: de noche el inversor en 0 es lo normal.

    Si alguien metiera un `AT TIME ZONE`, las 03:00 locales se leerian como las
    09:00 y este test se pondria rojo. Es la guarda de la regla que no se rompe.
    """
    marcas = _marcas(3, 12)
    serie = _serie("voltaje_vac", [0.0] * 12, marcas)

    assert disponibilidad.inversor_sin_acoplar(serie, _con_sol(marcas, SOL_PLENO)) == []


def test_los_bordes_de_la_ventana_son_07_00_inclusive_y_17_00_exclusivo():
    """Analisis de valores limite: la ventana es [07:00, 17:00)."""
    dentro = [datetime.combine(FECHA, datetime.min.time()).replace(hour=7),
              datetime.combine(FECHA, datetime.min.time()).replace(hour=16, minute=55)]
    fuera = [datetime.combine(FECHA, datetime.min.time()).replace(hour=6, minute=55),
             datetime.combine(FECHA, datetime.min.time()).replace(hour=17)]

    assert all(disponibilidad.en_ventana_operativa(m) for m in dentro)
    assert not any(disponibilidad.en_ventana_operativa(m) for m in fuera)


def test_solo_se_cuentan_los_ceros_de_dentro_de_la_ventana():
    marcas = ([datetime.combine(FECHA, datetime.min.time()).replace(hour=6)] * 1
              + _marcas(12, 3))
    serie = _serie("voltaje_vac", [0.0] * 4, marcas)

    hallazgo = disponibilidad.inversor_sin_acoplar(serie, SIN_NADA)[0]

    assert hallazgo.n_afectadas == 3
    assert hallazgo.detalle["de"] == 4          # el denominador SI es el dia entero


# ══════════════════════════════════════════════════════════════════════════
# El emparejamiento: por BIN de 5 min, jamas por timestamp exacto
# ══════════════════════════════════════════════════════════════════════════
def test_por_bin_se_empareja_casi_todo_y_por_timestamp_exacto_casi_nada():
    """Given lo electrico a 5 min con segundos propios y la radiacion a 15 s,
    When se empareja por bin y por igualdad de timestamp,
    Then por bin se empareja todo y por timestamp exacto no se empareja nada.

    ES EL HALLAZGO CENTRAL DEL PROYECTO Y EL ERROR QUE YA SE COMETIO. Medido
    sobre las 6.330 lecturas marcadas: por bin de 5 min se emparejan 5.979
    (94,5 %), por igualdad de timestamp 818, o sea se pierde el 87,1 %. Las dos
    tablas no comparten reloj y nunca lo van a compartir.
    """
    electrico = _marcas(12, 12, segundos=7)                  # 12:00:07, 12:05:07...
    radiacion = _marcas(12, 12 * 20, cadencia_seg=15, segundos=3)   # 12:00:03, 12:00:18...

    por_bin = disponibilidad.irradiancia_por_bin(radiacion, [SOL_PLENO] * len(radiacion))
    por_timestamp = dict.fromkeys(radiacion, SOL_PLENO)

    emparejadas_por_bin = sum(
        disponibilidad.bin_de_emparejamiento(m) in por_bin for m in electrico)
    emparejadas_exactas = sum(m in por_timestamp for m in electrico)

    assert emparejadas_por_bin == 12                # 100 %
    assert emparejadas_exactas == 0                 # el 87,1 % perdido, en chico


def test_emparejar_por_timestamp_exacto_degrada_la_severidad_del_hallazgo():
    """Given el mismo apagon bajo sol pleno,
    When la irradiancia se pasa indexada por timestamp exacto en vez de por bin,
    Then el hallazgo cae a `aviso` con motivo `sin_irradiancia`.

    Asi se ve la consecuencia del error de emparejamiento: no revienta nada, solo
    convierte 69 dias de planta parada bajo sol en 69 dias "sin poder graduar".
    """
    electrico = _marcas(12, 12, segundos=7)
    radiacion = _marcas(12, 12 * 20, cadencia_seg=15, segundos=3)
    serie = _serie("voltaje_vac", [0.0] * 12, electrico)

    mal = disponibilidad.ContextoDisponibilidad(
        irradiancia_por_bin=dict.fromkeys(radiacion, SOL_PLENO))
    bien = disponibilidad.ContextoDisponibilidad(
        irradiancia_por_bin=disponibilidad.irradiancia_por_bin(
            radiacion, [SOL_PLENO] * len(radiacion)))

    assert disponibilidad.inversor_sin_acoplar(serie, mal)[0].severidad == AVISO
    assert disponibilidad.inversor_sin_acoplar(serie, mal)[0].detalle["motivo"] == (
        umbrales.MOTIVO_SIN_IRRADIANCIA)
    assert disponibilidad.inversor_sin_acoplar(serie, bien)[0].severidad == GRAVE


def test_el_bin_promedia_las_muestras_de_su_ventana():
    """`avg` y no la primera lectura: en 5 min entran ~1,5 muestras de radiacion,
    y quedarse con una sola haria que el bin dependiera del orden de llegada."""
    marcas = _marcas(12, 4, cadencia_seg=60)     # las cuatro caen en el mismo bin
    mapa = disponibilidad.irradiancia_por_bin(marcas, [100.0, 200.0, 300.0, 400.0])

    assert mapa == {datetime.combine(FECHA, datetime.min.time()).replace(hour=12): 250.0}


def test_los_nulos_de_radiacion_no_entran_en_el_promedio_del_bin():
    marcas = _marcas(12, 3, cadencia_seg=60)
    mapa = disponibilidad.irradiancia_por_bin(marcas, [None, 200.0, float("nan")])

    assert list(mapa.values()) == [200.0]


# ══════════════════════════════════════════════════════════════════════════
# Alcance de la prueba: que cuenta como cero y que variables mira
# ══════════════════════════════════════════════════════════════════════════
def test_un_null_NO_es_un_cero():
    """Given los cuatro meses en que la columna AC no vino en el CSV
    (nov-2025 a feb-2026, `frecuencia_hz` y `potencia_total_wac` al 100 % NULL),
    Then no se inventa un apagon: eso es `parametro_faltante`, otra prueba.
    """
    marcas = _marcas(12, 12)
    serie = _serie("frecuencia_hz", [None] * 12, marcas)

    assert disponibilidad.inversor_sin_acoplar(serie, _con_sol(marcas, SOL_PLENO)) == []


def test_las_tres_variables_de_R3_se_vigilan_y_las_demas_no():
    """R3: "lo mismo aplica para frecuencia y potencia total"."""
    marcas = _marcas(12, 12)
    for clave in ("voltaje_vac", "frecuencia_hz", "potencia_total_wac"):
        serie = _serie(clave, [0.0] * 12, marcas)
        assert disponibilidad.inversor_sin_acoplar(serie, SIN_NADA)[0].variable == clave

    ajena = _serie("potencia_pv1_w", [0.0] * 12, marcas)
    try:
        disponibilidad.inversor_sin_acoplar(ajena, SIN_NADA)
    except NoAplica as motivo:
        assert "no dice si el inversor se acoplo" in motivo.motivo
    else:
        raise AssertionError("la potencia DC en 0 no delata el acople: es consecuencia")


def test_la_prueba_esta_registrada_como_las_demas_y_con_tipo_propio():
    """La PK del store es (fecha, fuente, variable, tipo): un tipo repetido se
    pisaria en el ON CONFLICT del barrido y una de las dos pruebas desapareceria."""
    registrada = [p for p in registro.CATALOGO_PRUEBAS if p.tipo == disponibilidad.TIPO]

    assert len(registrada) == 1
    assert registrada[0].familia == registro.DISPONIBILIDAD
    assert disponibilidad.TIPO in registro.TIPOS


def test_un_contexto_pelado_no_revienta_la_prueba():
    """El barrido arma hoy un `Contexto` sin irradiancia. La prueba tiene que
    correr igual y decir que no pudo graduar, nunca fallar ni callarse."""
    serie = _serie("voltaje_vac", [0.0] * 12)

    hallazgo = disponibilidad.inversor_sin_acoplar(serie, SIN_NADA)[0]

    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_SIN_IRRADIANCIA


# ══════════════════════════════════════════════════════════════════════════
# La rampa de arranque: ni se marca como averia ni se lee como sistema sano
# ══════════════════════════════════════════════════════════════════════════
def test_la_rampa_de_arranque_no_se_marca_como_inversor_caido():
    """Given el inversor despertando (99,79 V, con 0 W de salida),
    Then no hay hallazgo de disponibilidad.

    R3 dice "deberian ser MAYORES A CERO", y todo el rendimiento medido de la
    regla sale de ese criterio. Un inversor arrancando no es un inversor
    averiado: marcarlo seria la falsa alarma que Leo pidio evitar. Ademas cae
    solo por el tercer disyunto (`potencia_total_wac = 0`) cuando esa columna
    existe, y casi siempre ocurre antes de las 07:00.
    """
    marcas = _marcas(7, 4)
    serie = _serie("voltaje_vac", [99.79, 80.0, 40.0, 150.0], marcas)

    assert disponibilidad.inversor_sin_acoplar(serie, _con_sol(marcas, SOL_PLENO)) == []


def test_la_rampa_se_CUENTA_en_el_detalle_del_dia_que_si_tiene_apagon():
    """Given un dia con ceros y ademas lecturas de rampa dentro de la ventana,
    Then el hallazgo dice cuantas son.

    El riesgo no es que la regla las marque de mas: es que alguien lea "distinto
    de cero" como "acoplado y exportando". El renglon impide esa lectura sin
    inventar un umbral que nadie midio.
    """
    marcas = _marcas(12, 6)
    serie = _serie("voltaje_vac", [0.0, 0.0, 99.79, 30.0, 210.0, 0.0], marcas)

    hallazgo = disponibilidad.inversor_sin_acoplar(serie, SIN_NADA)[0]

    assert hallazgo.n_afectadas == 3                       # solo los ceros
    assert hallazgo.detalle["lecturas_en_rampa"] == 2      # 99,79 V y 30 V
    assert hallazgo.detalle["piso_de_acople"] == 100.0


def test_la_potencia_ac_no_tiene_banda_de_rampa_y_no_la_inventa():
    """Su piso es 0: entre 0 y 0 no hay banda. El detalle no trae el renglon."""
    serie = _serie("potencia_total_wac", [0.0] * 12)

    detalle = disponibilidad.inversor_sin_acoplar(serie, SIN_NADA)[0].detalle

    assert "lecturas_en_rampa" not in detalle


# ══════════════════════════════════════════════════════════════════════════
# Validez fisica: el 0 de las variables AC deja de ser un valor fuera de rango
# ══════════════════════════════════════════════════════════════════════════
def _con_piso(clave: str, minimo: float, valores) -> Serie:
    """La serie con el piso VIEJO puesto a mano, para que el test siga midiendo.

    El catalogo ya bajo a 0 el minimo de las dos columnas AC, asi que contra el
    catalogo de hoy estos tests pasarian sin ejercitar nada. Reponer el piso es
    lo que los mantiene siendo una prueba de la EXENCION (que es por valor, no
    por rango) y no del numero que el catalogo declare esta semana.
    """
    return Serie(variable=replace(catalogo.obtener(clave), minimo=minimo),
                 fuente=ELECTRICO, fecha=FECHA, origen=CRUDO,
                 marcas=_marcas(12, len(valores)), valores=valores)


def test_un_voltaje_ac_en_cero_ya_no_sale_fuera_de_rango():
    """Given `voltaje_vac` en 0 y el piso de 100 V que declaraba el catalogo,
    When se corre la validez fisica,
    Then no hay hallazgo.

    Con el codigo viejo eran 7.954 lecturas `fuera_de_rango` GRAVE en 238 dias,
    declarando malo un dato perfecto: el sensor registro con exactitud que el
    inversor marcaba 0 V. La exencion es por VALOR (el 0) y no por rango, asi que
    sigue en pie aunque alguien vuelva a subirle el piso a la columna.
    """
    serie = _con_piso("voltaje_vac", 100.0, [0.0] * 12)

    assert validez_fisica.bajo_minimo(serie, SIN_NADA) == []


def test_lo_mismo_para_la_frecuencia_en_cero():
    serie = _con_piso("frecuencia_hz", 55.0, [0.0] * 12)

    assert validez_fisica.bajo_minimo(serie, SIN_NADA) == []


def test_la_rampa_de_arranque_NO_esta_exenta_si_alguien_repone_el_piso():
    """La exencion cubre el 0 y nada mas. Las 82 lecturas de `voltaje_vac` entre
    0 y 100 V son el inversor despertando, y si algun dia vuelve a haber un piso
    de validez fisica tienen que volver a caer bajo el: no son el caso de R3."""
    serie = _con_piso("voltaje_vac", 100.0, [0.0] * 11 + [99.79])

    assert validez_fisica.bajo_minimo(serie, SIN_NADA)[0].n_afectadas == 1


def test_un_valor_genuinamente_imposible_sigue_cayendo():
    """La exencion es del 0, no de la prueba: un voltaje negativo no existe."""
    serie = _serie("voltaje_vac", [0.0] * 11 + [-12.0])

    hallazgo = validez_fisica.bajo_minimo(serie, SIN_NADA)[0]

    assert (hallazgo.tipo, hallazgo.n_afectadas) == ("bajo_minimo_fisico", 1)
    assert hallazgo.detalle["peor"] == -12.0


def test_el_cero_de_una_variable_ajena_sigue_contando():
    """La exencion no se derrama: en la irradiancia el 0 no significa nada de esto."""
    serie = Serie(variable=catalogo.obtener("irradiancia_incidente_wm2"),
                  fuente=RADIACION, fecha=FECHA, origen=CRUDO,
                  marcas=_marcas(12, 2), valores=[0.0, -20.0])

    assert validez_fisica.bajo_minimo(serie, SIN_NADA)[0].n_afectadas == 1


# ══════════════════════════════════════════════════════════════════════════
# LA DECISION DE FONDO: la disponibilidad no entra en el veredicto del dato
# ══════════════════════════════════════════════════════════════════════════
DIAS = [date(2026, 1, d) for d in range(1, 32)]
FILAS = {(d, ELECTRICO): 144 for d in DIAS}


def _hallazgo_de_parada(fecha, variable="voltaje_vac", severidad=GRAVE, n=144):
    return {"fecha": fecha, "fuente": ELECTRICO, "variable": variable,
            "tipo": disponibilidad.TIPO, "severidad": severidad, "n_afectadas": n}


def test_un_dia_de_planta_parada_no_baja_la_confianza_del_dato():
    """Given un mes ENTERO de apagones graves que tocan las 144 lecturas del dia,
    When se reduce el periodo,
    Then los 31 dias siguen siendo utilizables.

    ES EL TEST QUE DEFIENDE LA DECISION DE FONDO. Con la regla vieja, un mes con
    la planta parada la mitad de los dias salia con la confianza hundida y el
    agente concluia "no confies en la energia de este mes"; la verdad es la
    contraria: esa energia es EXACTA, y es baja porque la planta estuvo parada.
    Es un error en la direccion peligrosa, porque esconde la averia detras de una
    advertencia de calidad de dato.
    """
    hallazgos = [_hallazgo_de_parada(d) for d in DIAS]

    r = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELECTRICO)

    assert r["dias_utilizables"] == 31
    assert r["cobertura"] == 1.0
    assert r["advertencia"] is None


def test_la_planta_parada_queda_VISIBLE_en_su_propio_canal():
    """Given los mismos 31 dias de apagon,
    Then el bloque `disponibilidad` los cuenta, con su advertencia propia.

    Fuera del veredicto no es lo mismo que escondido: sin este canal la decision
    anterior seria simplemente perder el hallazgo mas importante de la ronda.
    """
    hallazgos = [_hallazgo_de_parada(d) for d in DIAS[:12]]

    bloque = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELECTRICO)["disponibilidad"]

    assert bloque["dias_con_planta_parada"] == 12
    assert bloque["dias_parada_bajo_sol"] == 12
    assert bloque["de_dias_con_datos"] == 31
    assert "no representa la capacidad" in bloque["advertencia"].replace("NO", "no")


def test_el_mismo_apagon_en_tres_variables_cuenta_como_un_dia_y_no_como_tres():
    """Las tres variables AC dejan un hallazgo cada una sobre el MISMO apagon.
    Sumarlas repetiria el defecto ya documentado de `valor_nulo` /
    `parametro_faltante` / `columna_ausente`, donde un hecho pesa el triple."""
    hallazgos = [_hallazgo_de_parada(DIAS[0], v)
                 for v in ("voltaje_vac", "frecuencia_hz", "potencia_total_wac")]

    bloque = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELECTRICO)["disponibilidad"]

    assert bloque["dias_con_planta_parada"] == 1


def test_un_periodo_sin_apagones_lo_dice_en_vez_de_omitir_el_bloque():
    """Una seccion que no aparece se lee como una seccion limpia. El canal sale
    siempre, con su cero explicito."""
    bloque = reducir(DIAS, FILAS, [], ["potencia_pv1_w"], ELECTRICO)["disponibilidad"]

    assert bloque["dias_con_planta_parada"] == 0
    assert bloque["advertencia"] is None


def test_los_apagones_sin_sol_se_cuentan_pero_no_como_parada_bajo_sol():
    hallazgos = [_hallazgo_de_parada(DIAS[0], severidad=AVISO)]

    bloque = reducir(DIAS, FILAS, hallazgos, ["potencia_pv1_w"], ELECTRICO)["disponibilidad"]

    assert (bloque["dias_con_planta_parada"], bloque["dias_parada_bajo_sol"]) == (1, 0)


def test_el_tipo_de_disponibilidad_NO_puede_estar_entre_los_que_invalidan():
    """Given que alguien, alguna vez, va a querer "arreglar" esto metiendo el tipo
    en TIPOS_QUE_INVALIDAN,
    Then este test se pone rojo y lo dice.

    `reducir` ya saltea el tipo antes de mirar la materialidad, asi que el cambio
    no se notaria en ningun numero: la unica forma de que se note es esta.
    """
    assert set(TIPOS_DE_DISPONIBILIDAD).isdisjoint(TIPOS_QUE_INVALIDAN)


def test_un_hallazgo_de_calidad_de_verdad_sigue_invalidando_el_dia():
    """El canal aparte no es una amnistia general: lo que si es un problema del
    DATO tiene que seguir bajando la confianza igual que antes."""
    parada = [_hallazgo_de_parada(d) for d in DIAS]
    roto = [{"fecha": DIAS[0], "fuente": ELECTRICO, "variable": "potencia_pv1_w",
             "tipo": "fuera_de_rango", "severidad": GRAVE, "n_afectadas": 144}]

    r = reducir(DIAS, FILAS, parada + roto, ["potencia_pv1_w"], ELECTRICO)

    assert r["dias_utilizables"] == 30
