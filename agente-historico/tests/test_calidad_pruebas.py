"""Pruebas del CRITERIO de las cuatro familias. Corren sin base de datos.

Se prueban las funciones puras: reciben la serie ya traida y devuelven hallazgos.
Es donde vive la decision, es lo que se discute con el equipo y es lo unico que
puede estar mal de una forma que los numeros no delaten.

Diseño: particion de equivalencia (valido / invalido por umbral), ANALISIS DE
VALORES LIMITE (justo dentro, justo en el umbral, justo fuera: los umbrales del
documento son todos fronteras) y caminos de error (serie vacia, un solo punto,
todo NULL, variable sin fuente).
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from historico.analitica import catalogo
from historico.calidad import barrido
from historico.calidad.pruebas import (
    anomalias, cadencia, completitud, consistencia_temporal, registro, umbrales,
    validez_fisica,
)
from historico.calidad.pruebas.contrato import (
    AVISO, CORREGIDA, CRUDO, DERIVADA, GRAVE, INFO, Contexto, Serie, VentanaSolar,
)

FECHA = date(2026, 3, 15)
ELECTRICO = "monitoreo_sc_electrico"
RADIACION = "radiacion_sc_15s"
AMANECER = datetime(2026, 3, 15, 5, 26)
ATARDECER = datetime(2026, 3, 15, 17, 20)
CON_SOL = Contexto(ventanas_solares={FECHA: VentanaSolar(AMANECER, ATARDECER)})
SIN_NADA = Contexto()


def _serie(clave, valores, cadencia_seg=300, inicio=None, fuente=ELECTRICO,
           intervalos=None, dispositivos=(), marcas=None, origen=CRUDO):
    """Una serie de un dia, con marcas parejas salvo que se pidan explicitas."""
    arranque = inicio or datetime.combine(FECHA, datetime.min.time()) + timedelta(hours=6)
    if marcas is None:
        marcas = [arranque + timedelta(seconds=cadencia_seg * i)
                  for i in range(len(valores))]
    return Serie(variable=catalogo.obtener(clave), fuente=fuente, fecha=FECHA,
                 origen=origen, marcas=marcas, valores=valores,
                 intervalos=intervalos or [], dispositivos=dispositivos)


# ══════════════════════════════════════════════════════════════════════════
# El contrato: lo que hace que estas pruebas se puedan persistir y recorrer
# ══════════════════════════════════════════════════════════════════════════
def test_cada_prueba_deja_un_tipo_de_hallazgo_propio():
    # Given la PK del store es (fecha, fuente, variable, tipo)
    # When se recorre el catalogo de pruebas
    tipos = [p.tipo for p in registro.CATALOGO_PRUEBAS]
    # Then ninguna comparte tipo con otra: si lo hicieran, el ON CONFLICT del
    # barrido dejaria una sola fila y la otra prueba desapareceria sin error.
    assert len(tipos) == len(set(tipos))


def test_ningun_tipo_choca_con_los_que_ya_escriben_el_barrido_y_el_cielo():
    # Given el barrido borra por tipo antes de reinsertar (`_LIMPIAR_RANGO`)
    ajenos = set(barrido.TIPOS_PROPIOS) | {"kt_imposible"}
    # Then un tipo compartido haria que cada barrido borrara estos hallazgos
    assert ajenos.isdisjoint(registro.TIPOS)


def test_el_hallazgo_sale_con_la_forma_exacta_del_insert_del_barrido():
    # Given una serie con un valor imposible
    serie = _serie("irradiancia_incidente_wm2", [0.0, -12.0], fuente=RADIACION)
    # When se evalua
    fila = validez_fisica.bajo_minimo(serie, SIN_NADA)[0].como_fila()
    # Then la tupla calza con VALUES (fecha, fuente, variable, tipo, severidad,
    # n_afectadas, detalle::jsonb) sin adaptador de por medio
    assert fila[:6] == (FECHA, RADIACION, "irradiancia_incidente_wm2",
                        "bajo_minimo_fisico", GRAVE, 1)
    assert json.loads(fila[6])["peor"] == -12.0


def test_una_serie_con_columnas_de_distinto_largo_no_se_construye():
    # Given columnas paralelas descuadradas (el error clasico al armar la serie)
    try:
        Serie(variable=catalogo.obtener("potencia_pv1_w"), fuente=ELECTRICO,
              fecha=FECHA, origen=CRUDO, marcas=[datetime(2026, 3, 15, 6)],
              valores=[1.0, 2.0])
    except ValueError as error:
        assert "columnas paralelas" in str(error)
    else:
        raise AssertionError("la serie descuadrada tenia que reventar al construirse")


# ══════════════════════════════════════════════════════════════════════════
# Familia 1: completitud
# ══════════════════════════════════════════════════════════════════════════
def test_nan_y_null_se_cuentan_por_separado():
    # Given un dia con un NaN y dos NULL
    serie = _serie("potencia_pv1_w", [1.0, float("nan"), None, None] + [1.0] * 8)
    # Then cada uno tiene su hallazgo: se arreglan en lugares distintos
    assert completitud.valores_nan(serie, SIN_NADA)[0].n_afectadas == 1
    assert completitud.valores_nulos(serie, SIN_NADA)[0].n_afectadas == 2


def test_un_dia_entero_sin_valores_es_parametro_faltante_y_es_grave():
    # Given la columna no vino en el CSV de ese dia (los trece esquemas)
    serie = _serie("potencia_total_wac", [None] * 12)
    # When se evalua
    hallazgo = completitud.parametro_faltante(serie, SIN_NADA)[0]
    # Then es grave: sobre esto no se puede calcular un cero
    assert (hallazgo.severidad, hallazgo.n_afectadas) == (GRAVE, 12)


def test_un_dia_con_valores_no_es_parametro_faltante():
    serie = _serie("potencia_total_wac", [None] * 11 + [3.0])
    assert completitud.parametro_faltante(serie, SIN_NADA) == []


def test_un_dia_sano_no_pierde_timestamps():
    # Given 24 lecturas parejas a 5 min con su cadencia declarada
    serie = _serie("potencia_pv1_w", [1.0] * 24, intervalos=[300.0] * 24)
    assert completitud.timestamps_faltantes(serie, SIN_NADA) == []


def test_un_hueco_interno_cuenta_las_muestras_que_faltan():
    # Given un dia a 5 min al que le falta media hora en el medio
    marcas = ([datetime(2026, 3, 15, 6) + timedelta(minutes=5 * i) for i in range(6)]
              + [datetime(2026, 3, 15, 7) + timedelta(minutes=5 * i) for i in range(6)])
    serie = _serie("potencia_pv1_w", [1.0] * 12, marcas=marcas, intervalos=[300.0] * 12)
    # When se evalua
    hallazgo = completitud.timestamps_faltantes(serie, SIN_NADA)[0]
    # Then reporta las 6 muestras que debieron estar entre 06:25 y 07:00
    assert hallazgo.n_afectadas == 6
    # La referencia sale de los saltos observados, no de `intervalo_original_seg`:
    # ese metadato guarda la cadencia del CSV de origen, que el ETL ya remuestreo.
    assert hallazgo.detalle["cadencia_origen"] == cadencia.INFERIDA


def test_un_dia_sano_no_pierde_minutos_de_sol():
    # Given lecturas a 5 min cubriendo la ventana solar de punta a punta
    valores = [1.0] * 143
    serie = _serie("potencia_pv1_w", valores, inicio=AMANECER, intervalos=[300.0] * 143)
    # Then cada lectura cubre sus 5 minutos y no falta ninguno
    assert completitud.minutos_faltantes(serie, CON_SOL) == []


def test_sin_ventana_solar_los_minutos_faltantes_no_se_inventan():
    # Given no hay `ventana_solar` para el dia (camino de error)
    serie = _serie("potencia_pv1_w", [1.0] * 12)
    # Then la prueba lo dice en vez de pasar en silencio
    try:
        completitud.minutos_faltantes(serie, SIN_NADA)
    except registro.NoAplica as motivo:
        assert "ventana_solar" in motivo.motivo
    else:
        raise AssertionError("sin ventana solar la prueba no puede aprobar el dia")


def test_un_dispositivo_que_no_reporto_se_detecta():
    # Given se esperaban tres canales y solo hablaron dos
    serie = _serie("potencia_pv1_w", [1.0] * 4,
                   dispositivos=["sc1", "sc1", "sc2", "sc2"])
    contexto = Contexto(dispositivos_esperados=("sc1", "sc2", "sc3"))
    # When se evalua
    hallazgo = completitud.dispositivos_faltantes(serie, contexto)[0]
    # Then se nombra al ausente
    assert hallazgo.detalle["faltantes"] == ["sc3"]


# ══════════════════════════════════════════════════════════════════════════
# Familia 2: validez fisica (valores limite y el hueco de las cuatro variables)
# ══════════════════════════════════════════════════════════════════════════
def test_irradiancia_justo_en_los_limites_no_es_invalida():
    # Given los dos bordes exactos del documento: 0 y 1500 W/m2
    serie = _serie("irradiancia_incidente_wm2", [0.0, 1500.0], fuente=RADIACION)
    # Then ninguno se marca: el umbral es "< 0" y "> 1500", no "<=" ni ">="
    assert validez_fisica.bajo_minimo(serie, SIN_NADA) == []
    assert validez_fisica.sobre_maximo(serie, SIN_NADA) == []


def test_irradiancia_justo_fuera_de_los_limites_si_es_invalida():
    # Given un pelo por fuera de cada borde
    serie = _serie("irradiancia_incidente_wm2", [-0.1, 1500.1], fuente=RADIACION)
    assert validez_fisica.bajo_minimo(serie, SIN_NADA)[0].n_afectadas == 1
    assert validez_fisica.sobre_maximo(serie, SIN_NADA)[0].n_afectadas == 1


def test_los_limites_del_documento_estan_todos_en_el_catalogo():
    # Given la lista de pruebas de validez fisica del PDF
    # Then cada una tiene su numero en el catalogo, que es la fuente de verdad:
    # si alguien borrara un limite, la prueba se volveria `no_aplica` y este test
    # es lo que impide que eso pase inadvertido.
    for clave, lado, _texto in umbrales.LIMITES_DEL_DOCUMENTO:
        assert getattr(catalogo.obtener(clave), lado) is not None


def test_las_cuatro_variables_sin_fuente_se_reportan_y_no_desaparecen():
    # Given RH, temperatura ambiente, viento y precipitacion no existen en la base
    sin_fuente = ("humedad_relativa_pct", "temperatura_ambiente_c",
                  "velocidad_viento_ms", "precipitacion_mm")
    series = [Serie(variable=catalogo.obtener(c), fuente="sin_fuente", fecha=FECHA,
                    origen=CRUDO) for c in sin_fuente]
    # When se corre el catalogo entero sobre ellas
    corrida = registro.correr(series)
    # Then TODA prueba queda con estado `sin_fuente` (no omitida, que se leeria
    # como un aprobado) y ademas queda una fila medible por variable
    assert {e.estado for e in corrida.evaluaciones} == {"sin_fuente"}
    assert len(corrida.evaluaciones) == len(sin_fuente) * len(registro.CATALOGO_PRUEBAS)
    assert len(corrida.sin_fuente) == len(sin_fuente)
    assert corrida.sin_fuente[0].detalle["motivo"] == catalogo.obtener(
        "humedad_relativa_pct").fuente_ausente


def test_irradiancia_de_dia_no_es_irradiancia_de_noche():
    serie = _serie("irradiancia_incidente_wm2", [800.0] * 4,
                   inicio=datetime(2026, 3, 15, 12), fuente=RADIACION)
    assert validez_fisica.irradiancia_de_noche(serie, CON_SOL) == []


def test_irradiancia_con_el_sol_bajo_el_horizonte_es_grave():
    # Given 300 W/m2 a medianoche, y 4 W/m2 tambien de noche (suelo de ruido)
    serie = _serie("irradiancia_incidente_wm2", [300.0, 4.0],
                   inicio=datetime(2026, 3, 15, 0, 30), fuente=RADIACION)
    # When se contrasta contra la ventana solar del dia
    hallazgo = validez_fisica.irradiancia_de_noche(serie, CON_SOL)[0]
    # Then solo la primera cuenta: la segunda esta bajo el umbral tolerado
    assert (hallazgo.severidad, hallazgo.n_afectadas) == (GRAVE, 1)


def test_el_crepusculo_no_se_marca_como_noche():
    # Given una lectura 20 min antes del amanecer, dentro del margen de 30 min
    serie = _serie("irradiancia_incidente_wm2", [40.0],
                   inicio=AMANECER - timedelta(minutes=20), fuente=RADIACION)
    # Then no se marca: hay luz difusa real antes del amanecer geometrico
    assert validez_fisica.irradiancia_de_noche(serie, CON_SOL) == []


def test_la_validez_fisica_se_niega_a_correr_sobre_una_vista_corregida():
    # EL APROBADO FALSO POR CONSTRUCCION. Given la vista ya anulo lo que caia
    # fuera de rango, asi que aca no queda ni un valor imposible
    serie = _serie("potencia_pv1_w", [1.0] * 12, origen=CORREGIDA)
    # When se corre la familia
    corrida = registro.correr([serie])
    validez = [e for e in corrida.evaluaciones if e.familia == registro.VALIDEZ_FISICA]
    # Then las tres se declaran `no_aplica` en vez de devolver la lista vacia:
    # cero hallazgos aca no significa dato sano, significa que la vista los borro
    assert {e.estado for e in validez} == {"no_aplica"}
    assert len(validez) == 3 and all("crudo=True" in e.motivo for e in validez)


def test_la_misma_serie_leida_en_crudo_si_encuentra_lo_imposible():
    # Given los 26.503.162 W que dejaron las filas mezcladas del piranometro
    serie = _serie("potencia_pv1_w", [1.0] * 11 + [26_503_162.0], origen=CRUDO)
    hallazgo = validez_fisica.sobre_maximo(serie, SIN_NADA)[0]
    assert hallazgo.n_afectadas == 1
    assert hallazgo.detalle["origen"] == CRUDO


def test_una_variable_derivada_se_mide_pero_no_se_hace_pasar_por_lectura():
    # Given kt* es el unico caso con fuente y sin crudo: la vista lo calcula al
    # vuelo, asi que solo se puede medir contra la vista
    assert catalogo.obtener("kt_star").origen_crudo is None
    serie = _serie("kt_star", [0.9] * 11 + [5.67], fuente=RADIACION, origen=DERIVADA)
    # When se evalua
    hallazgo = validez_fisica.sobre_maximo(serie, SIN_NADA)[0]
    evaluacion = next(e for e in registro.correr([serie]).evaluaciones
                      if e.prueba == "sobre_maximo")
    # Then se mide igual (la vista no le recorta el rango) pero tanto el hallazgo
    # como la evaluacion dicen que es un numero calculado, no una lectura
    assert hallazgo.detalle["origen"] == DERIVADA
    assert (evaluacion.estado, evaluacion.origen) == ("evaluada", DERIVADA)


def test_una_serie_sin_declarar_su_origen_no_se_construye():
    # Camino de error: un defecto permisivo dejaria pasar una vista corregida por
    # cruda y la validez fisica saldria vacia dando un aprobado falso
    try:
        Serie(variable=catalogo.obtener("potencia_pv1_w"), fuente=ELECTRICO,
              fecha=FECHA, origen="lo_que_sea")
    except ValueError as error:
        assert "origen" in str(error)
    else:
        raise AssertionError("un origen desconocido tenia que reventar")


def test_la_corrida_avisa_de_las_variables_que_nadie_vigilaba():
    # Given `albedo` no la mira el barrido: su store de hallazgos siempre estuvo
    # vacio porque nadie la revisaba, no porque estuviera sana
    assert catalogo.obtener("albedo").clave_calidad is None
    assert catalogo.obtener("potencia_pv1_w").clave_calidad is not None
    series = [_serie("albedo", [0.2] * 12, fuente=RADIACION),
              _serie("potencia_pv1_w", [1.0] * 12)]
    # When se corre el catalogo
    resumen = registro.correr(series).resumen
    # Then la corrida distingue "primera revision" de "confirmacion"
    assert resumen["sin_vigilancia_previa"] == ["albedo"]


# ══════════════════════════════════════════════════════════════════════════
# Familia 3: consistencia temporal (aca muerde la trampa de las tres cadencias)
# ══════════════════════════════════════════════════════════════════════════
def test_las_marcas_repetidas_son_graves_y_se_cuentan_las_sobrantes():
    marca = datetime(2026, 3, 15, 6)
    serie = _serie("potencia_pv1_w", [1.0, 1.0, 2.0],
                   marcas=[marca, marca, marca + timedelta(minutes=5)])
    hallazgo = consistencia_temporal.timestamps_duplicados(serie, SIN_NADA)[0]
    assert (hallazgo.severidad, hallazgo.n_afectadas) == (GRAVE, 1)


def test_un_intervalo_de_exactamente_dos_veces_la_cadencia_no_es_hueco():
    # Given el documento dice "MAYORES a 2x": 600 s con cadencia 300 esta dentro
    marcas = [datetime(2026, 3, 15, 6), datetime(2026, 3, 15, 6, 10)]
    serie = _serie("potencia_pv1_w", [1.0, 1.0], marcas=marcas, intervalos=[300.0] * 2)
    assert consistencia_temporal.intervalo_excesivo(serie, SIN_NADA) == []


def test_un_intervalo_apenas_mayor_al_doble_si_es_hueco():
    marcas = [datetime(2026, 3, 15, 6), datetime(2026, 3, 15, 6, 10, 1)]
    serie = _serie("potencia_pv1_w", [1.0, 1.0], marcas=marcas, intervalos=[300.0] * 2)
    assert consistencia_temporal.intervalo_excesivo(serie, SIN_NADA)[0].n_afectadas == 1


def test_dos_cadencias_en_el_mismo_dia_no_generan_huecos_falsos():
    # LA TRAMPA DEL HISTORICO. Given un dia que graba a 1 min casi todo el rato y
    # se reconfigura a 5 min al final, tal como lo declara `intervalo_original_seg`
    arranque = datetime(2026, 3, 15, 6)
    finos = [arranque + timedelta(seconds=60 * i) for i in range(40)]
    gruesos = [finos[-1] + timedelta(seconds=300 * (i + 1)) for i in range(20)]
    marcas = finos + gruesos
    declarada = _serie("potencia_pv1_w", [1.0] * 60, marcas=marcas,
                       intervalos=[60.0] * 40 + [300.0] * 20)
    inferida = _serie("potencia_pv1_w", [1.0] * 60, marcas=marcas)

    # When cada muestra se juzga contra la cadencia de SU tramo
    # Then no hay ni un hueco, y se ven los dos tramos
    assert consistencia_temporal.intervalo_excesivo(declarada, SIN_NADA) == []
    assert [t["cadencia_seg"] for t in cadencia.tramos(declarada)] == [60.0, 300.0]

    # Y esto es lo que la prueba compra ahora: SIN el metadato el resultado es el
    # mismo, porque cada muestra se juzga contra la moda de sus VECINAS y no
    # contra la del dia entero. Con la moda del dia (60 s) las veinte muestras de
    # la tarde salian como huecos de 5x, que es el falso positivo que se comia
    # media base; con la ventana local, el tramo lento tiene su propia referencia.
    assert consistencia_temporal.intervalo_excesivo(inferida, SIN_NADA) == []
    assert [t["cadencia_seg"] for t in cadencia.tramos(inferida)] == [60.0, 300.0]


def test_la_cadencia_del_csv_de_origen_no_inventa_huecos_en_una_tabla_remuestreada():
    """Given un dia grabado a 300 s uniformes cuyo CSV de origen iba a 62 s, tal
    como lo declara `intervalo_original_seg` en media base,
    When se buscan intervalos excesivos,
    Then no se reporta ninguno.

    Es el falso positivo mas caro del historico. Con la cadencia declarada el
    umbral de 2x son 124 s, asi que CADA paso normal de 300 s se reportaba como
    hueco. Medido contra produccion: 8.756 hallazgos con el criterio declarado
    contra 65 con el medido, y los 8.691 de diferencia son pasos sanos.
    """
    arranque = datetime(2026, 3, 15, 6)
    marcas = [arranque + timedelta(seconds=300 * i) for i in range(20)]
    serie = _serie("potencia_pv1_w", [1.0] * 20, marcas=marcas, intervalos=[62.0] * 20)

    assert consistencia_temporal.intervalo_excesivo(serie, SIN_NADA) == []
    assert cadencia.dominante(serie, list(range(20))).segundos == 300.0


def test_un_hueco_de_verdad_si_se_reporta_pese_al_metadato():
    """Given el mismo dia a 300 s pero con veinte minutos perdidos en el medio,
    When se buscan intervalos excesivos,
    Then el hueco se reporta contra la cadencia medida, no contra la declarada.
    """
    arranque = datetime(2026, 3, 15, 6)
    marcas = ([arranque + timedelta(seconds=300 * i) for i in range(10)]
              + [arranque + timedelta(seconds=300 * 14 + 300 * i) for i in range(10)])
    serie = _serie("potencia_pv1_w", [1.0] * 20, marcas=marcas, intervalos=[62.0] * 20)

    hallazgos = consistencia_temporal.intervalo_excesivo(serie, SIN_NADA)

    assert hallazgos[0].n_afectadas == 1
    assert hallazgos[0].detalle["cadencia_seg"] == 300.0
    assert hallazgos[0].detalle["cadencia_origen"] == cadencia.INFERIDA


def test_la_cadencia_medida_le_gana_a_la_nominal_de_la_fuente():
    # Given diciembre 2024: una muestra cada 2 s en una fuente cuya nominal es 300
    serie = _serie("potencia_pv1_w", [1.0] * 20, cadencia_seg=2, intervalos=[2.0] * 20)
    referencia = cadencia.dominante(serie, list(range(20)))
    # Then la referencia son los 2 s reales, y salen del DATO, no del metadato:
    # con veinte muestras la serie tiene evidencia de sobra para decirlo sola.
    assert (referencia.segundos, referencia.origen) == (2.0, cadencia.INFERIDA)
    assert cadencia.nominal(ELECTRICO) == 300.0
    assert completitud.timestamps_faltantes(serie, SIN_NADA) == []


def test_la_noche_entre_dos_dias_no_es_un_hueco():
    # Given el logger solo graba de dia: 17:45 y despues 05:45 del dia siguiente
    marcas = [datetime(2026, 3, 15, 17, 40), datetime(2026, 3, 15, 17, 45),
              datetime(2026, 3, 16, 5, 45), datetime(2026, 3, 16, 5, 50)]
    serie = _serie("potencia_pv1_w", [1.0] * 4, marcas=marcas, intervalos=[300.0] * 4)
    # Then el salto de doce horas no cuenta: los pasos se cortan por dia
    assert consistencia_temporal.intervalo_excesivo(serie, SIN_NADA) == []


def test_un_desvio_de_exactamente_la_tolerancia_no_es_jitter():
    # Given 330 s contra una cadencia de 300: exactamente el 10 % tolerado
    marcas = [datetime(2026, 3, 15, 6), datetime(2026, 3, 15, 6, 5, 30)]
    serie = _serie("potencia_pv1_w", [1.0, 1.0], marcas=marcas, intervalos=[300.0] * 2)
    assert consistencia_temporal.marcas_inestables(serie, SIN_NADA) == []


def test_un_desvio_apenas_mayor_a_la_tolerancia_si_es_jitter():
    marcas = [datetime(2026, 3, 15, 6), datetime(2026, 3, 15, 6, 5, 31)]
    serie = _serie("potencia_pv1_w", [1.0, 1.0], marcas=marcas, intervalos=[300.0] * 2)
    hallazgo = consistencia_temporal.marcas_inestables(serie, SIN_NADA)[0]
    # Y nunca pasa de aviso: una marca corrida complica el resampleo, no invalida
    assert hallazgo.severidad == AVISO


def test_un_hueco_no_se_reporta_ademas_como_jitter():
    # Given un salto de 20 min con cadencia 300 (ya es `intervalo_excesivo`)
    marcas = [datetime(2026, 3, 15, 6), datetime(2026, 3, 15, 6, 20)]
    serie = _serie("potencia_pv1_w", [1.0, 1.0], marcas=marcas, intervalos=[300.0] * 2)
    # Then no se cuenta dos veces: quien lea el store veria dos problemas donde
    # hay uno
    assert consistencia_temporal.marcas_inestables(serie, SIN_NADA) == []


# ══════════════════════════════════════════════════════════════════════════
# Familia 4: anomalias estadisticas
# ══════════════════════════════════════════════════════════════════════════
def test_un_salto_de_exactamente_el_umbral_no_dispara():
    # Given 3,0 C exactos a la cadencia de referencia (el documento dice "> 3")
    serie = _serie("temp_inclinado", [20.0, 23.0], intervalos=[300.0] * 2)
    assert anomalias.salto_excesivo(serie, SIN_NADA) == []


def test_un_salto_apenas_mayor_al_umbral_dispara():
    serie = _serie("temp_inclinado", [20.0, 23.1], intervalos=[300.0] * 2)
    assert anomalias.salto_excesivo(serie, SIN_NADA)[0].n_afectadas == 1


def test_el_salto_se_normaliza_por_el_tiempo_real_entre_mediciones():
    # AMBIGUEDAD RESUELTA. Given el mismo par de temperaturas medido dos veces:
    # 3,5 C en 10 min (la mitad de rapido que la referencia de 5 min) y 2,0 C en
    # 2,5 min (el doble de rapido)
    lento = _serie("temp_inclinado", [20.0, 23.5], cadencia_seg=600,
                   intervalos=[600.0] * 2)
    rapido = _serie("temp_inclinado", [20.0, 22.0], cadencia_seg=150,
                    intervalos=[150.0] * 2)
    # Then el salto grande y lento pasa (1,75 C/5 min) y el chico y rapido no
    # (4,0 C/5 min): sin normalizar, el veredicto seria el contrario
    assert anomalias.salto_excesivo(lento, SIN_NADA) == []
    hallazgo = anomalias.salto_excesivo(rapido, SIN_NADA)[0]
    assert hallazgo.detalle["cadencia_referencia_seg"] == 300.0


def test_veintinueve_lecturas_iguales_todavia_no_son_flatline():
    # Given el documento fija 30 consecutivas
    serie = _serie("temp_inclinado", [25.0] * 29 + [26.0])
    assert anomalias.flatline(serie, SIN_NADA) == []


def test_treinta_lecturas_iguales_ya_son_flatline():
    serie = _serie("temp_inclinado", [25.0] * 30)
    hallazgo = anomalias.flatline(serie, SIN_NADA)[0]
    assert (hallazgo.n_afectadas, hallazgo.severidad) == (30, GRAVE)


def test_una_racha_en_cero_se_reporta_pero_no_como_sensor_trabado():
    # Given el inversor apagado o la noche: cero durante horas es un hecho real
    serie = _serie("potencia_pv1_w", [0.0] * 30)
    assert anomalias.flatline(serie, SIN_NADA)[0].severidad == INFO


def test_un_valor_justo_en_el_limite_del_iqr_no_es_outlier():
    # Given doce valores 1..12 y un decimotercero en el techo exacto (19,0)
    serie = _serie("potencia_pv1_w", [float(v) for v in range(1, 13)] + [19.0])
    assert anomalias.outlier_iqr(serie, SIN_NADA) == []


def test_un_valor_apenas_fuera_del_iqr_si_es_outlier():
    serie = _serie("potencia_pv1_w", [float(v) for v in range(1, 13)] + [19.1])
    hallazgo = anomalias.outlier_iqr(serie, SIN_NADA)[0]
    assert (hallazgo.n_afectadas, hallazgo.severidad) == (1, INFO)


def test_menos_muestras_que_el_minimo_no_producen_cuartiles():
    # Camino de error: con cuatro lecturas el IQR lo fija una sola
    serie = _serie("potencia_pv1_w", [1.0, 2.0, 3.0, 900.0])
    assert anomalias.outlier_iqr(serie, SIN_NADA) == []


def test_el_ruido_se_detecta_con_mad_y_no_con_la_lectura_literal_del_documento():
    # AMBIGUEDAD ANOTADA. Given trece cambios de 1 y un pico de 50
    serie = _serie("potencia_pv1_w", [0.0, 1.0] * 6 + [0.0, 50.0])
    # When se usa MAD (la dispersion robusta de la referencia BSRN del documento)
    con_mad = anomalias.ruido_excesivo(serie, SIN_NADA)
    # Then el pico sale
    assert con_mad[0].n_afectadas == 1
    # When se usa la lectura LITERAL ("desviacion absoluta maxima")
    literal = anomalias.ruido_excesivo(
        serie, Contexto(desviacion_de_ruido=umbrales.DESVIACION_MAXIMA))
    # Then no sale nada, y no puede salir: el umbral incluye seis veces la mayor
    # distancia de la propia muestra. Por eso el defecto es MAD y la discrepancia
    # queda documentada en vez de resuelta en silencio.
    assert literal == []


# ══════════════════════════════════════════════════════════════════════════
# El corredor: el catalogo se recorre, no se llama a mano
# ══════════════════════════════════════════════════════════════════════════
def test_correr_evalua_todas_las_pruebas_sobre_cada_serie():
    """TODA prueba registrada deja evaluacion, y TODA familia registrada aparece
    en el resumen. Las dos mitades se DERIVAN del catalogo.

    Enumerar las familias a mano convertia esto en un test de cardinalidad: se
    rompia cada vez que alguien agregaba una prueba legitima (paso al estrenar
    `disponibilidad`), y el reflejo de quien lo ve es subir el numero sin pensar,
    que es como se pierde la garantia que el test venia a dar. Derivado del
    registro sigue atrapando lo que importa (una prueba anotada que el corredor
    no corre, o una familia que el resumen no agrupa) y deja de romperse por
    crecer.
    """
    serie = _serie("temp_inclinado", [25.0] * 12, intervalos=[300.0] * 12)
    corrida = registro.correr([serie], CON_SOL)
    assert len(corrida.evaluaciones) == len(registro.CATALOGO_PRUEBAS)
    assert corrida.resumen["por_familia"].keys() == {
        p.familia for p in registro.CATALOGO_PRUEBAS}


def test_una_serie_vacia_no_revienta_ni_inventa_hallazgos():
    # Camino de error: el dia no tiene ni una lectura
    serie = Serie(variable=catalogo.obtener("potencia_pv1_w"), fuente=ELECTRICO,
                  fecha=FECHA, origen=CRUDO)
    corrida = registro.correr([serie])
    assert corrida.hallazgos == []
    assert corrida.resumen["sin_datos"] == len(registro.CATALOGO_PRUEBAS)


def test_una_serie_de_un_solo_punto_no_revienta_ninguna_prueba():
    # Camino de error: no hay intervalos, no hay cuartiles, no hay rachas
    serie = _serie("temp_inclinado", [25.0])
    corrida = registro.correr([serie], CON_SOL)
    assert corrida.resumen["evaluaciones"] == len(registro.CATALOGO_PRUEBAS)
    assert {e.estado for e in corrida.evaluaciones} <= {"evaluada", "no_aplica"}


def test_las_filas_de_la_corrida_van_directo_al_insert_del_barrido():
    serie = _serie("temp_inclinado", [25.0] * 30, intervalos=[300.0] * 30)
    filas = registro.correr([serie], CON_SOL).filas()
    # Siete columnas en el orden del VALUES, y el detalle ya serializado a JSON
    assert filas and all(len(f) == 7 and isinstance(f[6], str) for f in filas)

