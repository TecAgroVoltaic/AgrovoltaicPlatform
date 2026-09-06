"""Pruebas de la energia AC del tablero (R7 de Leo Cardinale).

Se prueban las funciones PURAS directo, sin base de datos: ahi vive el criterio
(unidades, cierre diario, reconstruccion del contador de vida, coherencia AC/DC).
Cada caso reproduce un hecho MEDIDO contra produccion y documentado en
`docs/referencia/medicion-energia-ac.md`, no un ejemplo inventado: si el numero
del test cambia es porque alguien cambio la cuenta, no porque el dato se movio.

Los renglones de entrada tienen la forma que devuelve `energia.por_dia`.

Aca vive ademas el amarre de la FIRMA de contaminacion, que esta escrita en tres
sitios (esta consulta, la vista de `sql/003` y el generador del ETL) y no se puede
fundir en uno. El test la parsea de los otros dos y la compara clausula por
clausula: una desincronizacion falla en la suite en vez de fallar callada en
produccion.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from historico.analitica import contaminacion, energia, rendimiento
from historico.analitica.resultado import COLUMNA_AUSENTE, SIN_LECTURAS

# Cifras reales del historico completo, medidas contra produccion el 2026-08-31.
CIERRE_MEDIANO_KWH = 6.65          # mediana del cierre diario de `energia_hoy_wh`
VIDA_PRIMERA = 182.3               # `energia_total_wh` el 2024-11-10
VIDA_ULTIMA = 2710.7               # `energia_total_wh` el 2026-06-01
VIDA_RECONSTRUIDA = 2528.4         # la diferencia: lo que produjo la planta
CONTAMINADA_KWH = 137.25           # el ultimo registro del 2026-03-09

# Las otras dos copias de la firma. La de la migracion siempre esta (es de este
# repo); la del ETL vive en el repo padre y puede no estar si el paquete se
# desplego solo.
RAIZ = Path(__file__).resolve().parents[1]
MIGRACION = RAIZ / "sql" / "003_electrico_sin_falsos_positivos.sql"
DDL_DEL_ETL = RAIZ.parent / "src" / "agrovoltaic" / "ddl.py"

# Filas REALES de produccion, con los valores que trae cada una.
FILA_SANA = {                     # 2026-04-29 11:30, mediodia normal
    "potencia_pv1_w": 523.765, "potencia_pv2_w": 262.56,
    "voltaje_pv1_v": 154.955, "voltaje_pv2_v": 150.75,
    "corriente_pv1_a": 3.405, "corriente_pv2_a": 1.72,
    "potencia_total_wac": 760.295, "temperatura_inversor_c": 42.81,
    "energia_hoy_wh": 6.825, "energia_total_wh": 2493.125,
    "energia_pv1_wh": 3.955, "energia_pv2_wh": 3.2,
}
FILA_SUCIA_2025_10_07 = {         # la fila del maximo imposible de 39.328.367
    "potencia_pv1_w": 26503162.8, "potencia_pv2_w": 0.0,
    "voltaje_pv1_v": 0.0, "voltaje_pv2_v": 0.0,
    "corriente_pv1_a": 0.0, "corriente_pv2_a": 0.0,
    "potencia_total_wac": 118633.9, "temperatura_inversor_c": 291.1,
    "energia_hoy_wh": 671.1, "energia_total_wh": 39328367.1,
    "energia_pv1_wh": 203194.6,
}
FILA_SUCIA_2026_03_09 = {         # el ultimo registro del dia, 137,25 kWh
    "potencia_pv1_w": 0.0, "potencia_pv2_w": 3.03,
    "voltaje_pv1_v": 134.715, "voltaje_pv2_v": 0.0,
    "corriente_pv1_a": 12.38, "corriente_pv2_a": 121.295,
    "potencia_total_wac": None, "temperatura_inversor_c": None,
    "energia_hoy_wh": CONTAMINADA_KWH, "energia_total_wh": None,
}
FILA_INVERSOR_CAIDO = {           # inversor sin acoplar a mediodia: dato VALIDO
    "potencia_pv1_w": 0.0, "potencia_pv2_w": 0.0,
    "voltaje_pv1_v": 175.0, "voltaje_pv2_v": 174.5,
    "corriente_pv1_a": 0.0, "corriente_pv2_a": 0.0,
    "potencia_total_wac": 0.0, "temperatura_inversor_c": 31.2,
    "energia_hoy_wh": 0.0,
}


def _dia(fecha="2026-04-29", ac_cierre=6.65, n_ac=144, vida_primero=None,
         vida_ultimo=None, n_vida=0, dc_inclinado=None, dc_vertical=None,
         n_dc=0, w_inclinado=0.0, w_vertical=0.0, n_potencia=144, filas=144) -> dict:
    """Un renglon diario como el que devuelve `energia.por_dia`."""
    return {"dia": fecha, "ac_cierre": ac_cierre, "n_ac": n_ac,
            "vida_primero": vida_primero, "vida_ultimo": vida_ultimo, "n_vida": n_vida,
            "dc_cierre_inclinado": dc_inclinado, "dc_cierre_vertical": dc_vertical,
            "n_dc_inclinado": n_dc, "n_dc_vertical": n_dc,
            "w_inclinado": w_inclinado, "w_vertical": w_vertical,
            "n_potencia_inclinado": n_potencia, "n_potencia_vertical": n_potencia,
            "filas": filas}


# ── El factor mil ────────────────────────────────────────────────────────────
def test_un_dia_de_665_en_el_contador_son_665_kwh_y_no_milesimas():
    # Given: el cierre diario mediano del contador `energia_hoy_wh`, cuyo nombre
    # dice Wh y cuya unidad medida es kWh.
    # When
    kwh = energia.a_kwh(CIERRE_MEDIANO_KWH)
    # Then: 6,65 kWh. Leerlo como Wh daria 0,00665 kWh, o sea 14 Wh de produccion
    # diaria para 2.840 Wp instalados: mil veces menos que lo fisicamente posible.
    assert kwh == pytest.approx(6.65)
    assert kwh != pytest.approx(0.00665)
    assert energia.UNIDAD == "kWh"


def test_el_total_del_periodo_sale_en_kwh_y_es_plausible_para_284_kwp():
    # Given: tres dias de cierre mediano.
    dias = [_dia("2026-04-27"), _dia("2026-04-28"), _dia("2026-04-29")]
    # When
    resumen = energia.resumir(dias)
    # Then: 19,95 kWh, o sea 7,0 kWh/kWp en tres dias. En Wh serian 0,02 kWh, que
    # es la cifra absurda que este test existe para impedir.
    assert resumen["registrada_kwh"]["valor"] == pytest.approx(19.95)
    assert resumen["registrada_kwh"]["unidad"] == "kWh"


# ── El reinicio diario de `energia_hoy_wh` ───────────────────────────────────
def test_el_reinicio_diario_no_se_lee_como_caida_y_el_cierre_es_el_maximo():
    # Given: tres dias seguidos; el contador vuelve a ~0 al cambiar de dia y el
    # segundo cierra mas bajo que el primero.
    dias = [_dia("2026-04-27", ac_cierre=10.2), _dia("2026-04-28", ac_cierre=3.3),
            _dia("2026-04-29", ac_cierre=6.7)]
    # When
    resumen = energia.resumir(dias)
    # Then: los tres cierres se suman enteros. Un algoritmo que mirara la serie
    # continua veria dos caidas y restaria, o peor, las trataria como reinicios
    # del contador de vida y volveria a sumar el acumulado.
    assert resumen["registrada_kwh"]["valor"] == pytest.approx(20.2)
    assert resumen["dias_con_cierre_ac"] == 3


def test_el_cierre_del_dia_es_su_maximo_y_no_su_ultima_fila():
    # Given: la consulta que produce los renglones diarios. El 2026-03-09 se va a
    # NULL siete horas antes de terminar y hay dias cuya ultima fila viene baja:
    # "la ultima fila del dia" perderia lo ya acumulado.
    sql = energia._SQL_POR_DIA
    # When / Then: el cierre AC se agrega con max() sobre el dia, agrupando por
    # `timestamp::date`, que ya es la fecha LOCAL (los timestamps no son UTC).
    assert "max(energia_hoy_wh)" in sql
    assert '"timestamp"::date' in sql and "AT TIME ZONE" not in sql
    # Y el contador de vida SI necesita primero y ultimo en orden, no min/max: un
    # reinicio dentro del dia haria que el minimo no fuera la apertura.
    assert "array_agg(energia_total_wh ORDER BY" in sql
    assert energia.cierres_ac([_dia(ac_cierre=3.586)]) == [pytest.approx(3.586)]


# ── La reconstruccion del contador de vida ───────────────────────────────────
def test_el_ruido_de_coma_flotante_no_se_lee_como_reinicio_del_contador():
    # Given: dos dias del contador de vida con el ruido real medido, -4,5e-13 kWh
    # entre el cierre de un dia y la apertura del siguiente.
    tramos = [(VIDA_PRIMERA, 201.4), (201.4 - 4.5e-13, 225.2)]
    # When
    reconstruido = energia.reconstruir(tramos)
    # Then: cero reinicios y el total es el ultimo menos el primero. Sin
    # tolerancia el algoritmo sumaria otra vez el contador entero: son 37 pares
    # asi en la serie real y el total explota de 2.528 a 89.661 kWh.
    assert reconstruido["reinicios"] == 0
    assert reconstruido["total"] == pytest.approx(225.2 - VIDA_PRIMERA)


def test_sin_tolerancia_el_mismo_ruido_dispara_un_reinicio_falso():
    # Given: los mismos dos dias, pero leidos con tolerancia cero.
    tramos = [(VIDA_PRIMERA, 201.4), (201.4 - 4.5e-13, 225.2)]
    # When
    ingenuo = energia.reconstruir(tramos, tolerancia=0.0)
    # Then: el ruido cuenta como reinicio y el total se infla en 201 kWh enteros
    # (vuelve a sumar el contador completo). Es la version en miniatura de los
    # 89.661 kWh, y por eso la tolerancia es una constante con nombre.
    assert ingenuo["reinicios"] == 1
    assert ingenuo["total"] == pytest.approx(energia.reconstruir(tramos)["total"] + 201.4)


def test_un_reinicio_de_verdad_si_se_cuenta_y_no_se_pierde_energia():
    # Given: un contador que llega a 2.710,7 y se reinicia (R7: "se resetea cuando
    # llega a su valor maximo"), volviendo a subir hasta 12,0 al dia siguiente.
    tramos = [(2700.0, VIDA_ULTIMA), (0.0, 12.0)]
    # When
    reconstruido = energia.reconstruir(tramos)
    # Then: 10,7 del primer dia mas 12,0 del segundo. No se pierde el tramo y
    # tampoco se suma el contador entero dos veces.
    assert reconstruido["reinicios"] == 1
    assert reconstruido["total"] == pytest.approx(22.7)


def test_las_dos_energias_salen_con_su_nombre_y_la_diferencia_ve_los_huecos():
    # Given: el contador de vida arranca en 182,3 y termina en 2.710,7, pero entre
    # medio hay meses sin CSV: solo 905,55 kWh crecen DENTRO de dias registrados.
    dias = [_dia("2024-11-10", ac_cierre=None, n_ac=0,
                 vida_primero=VIDA_PRIMERA, vida_ultimo=VIDA_PRIMERA + 905.55, n_vida=174),
            _dia("2026-06-01", ac_cierre=None, n_ac=0,
                 vida_primero=VIDA_ULTIMA, vida_ultimo=VIDA_ULTIMA, n_vida=150)]
    # When
    resumen = energia.resumir(dias)
    # Then: las DOS respuestas viajan juntas. "Cuanto produjo la planta" son
    # 2.528,4 y "cuanto quedo registrado" es lo que crece en dias que tenemos;
    # los 1.622,85 de diferencia son energia generada en dias que no tenemos, y
    # es el unico numero del sistema que ve los huecos.
    assert resumen["planta_kwh"]["valor"] == pytest.approx(VIDA_RECONSTRUIDA, abs=0.01)
    assert resumen["no_registrada_kwh"]["valor"] == pytest.approx(1622.85, abs=0.01)
    assert set(resumen["significado"]) == {"registrada_kwh", "planta_kwh",
                                           "no_registrada_kwh"}


# ── La contaminacion: UNA firma, tres copias amarradas ───────────────────────
def test_la_firma_de_fila_mezclada_atrapa_las_dos_filas_conocidas():
    # Given: las dos filas contaminadas que cargan energia, con valores REALES.
    # When / Then: las dos quedan marcadas, y por columnas que NO son la energia:
    # la de octubre por sus 26.503.162 W y la de marzo por sus 121,3 A. Un tope
    # sobre la propia energia recortaria dias record legitimos y dejaria pasar
    # filas mezcladas de valor pequeño.
    assert contaminacion.es_fila_de_piranometro(FILA_SUCIA_2025_10_07)
    assert contaminacion.es_fila_de_piranometro(FILA_SUCIA_2026_03_09)


def test_la_firma_no_se_lleva_ni_una_fila_sana_ni_un_inversor_caido():
    # Given: un mediodia normal y un inversor sin acoplar (0 V, 0 Hz, 0 W).
    # When / Then: las dos sobreviven. El apagon es DATO VALIDO (R3) y la limpieza
    # de la energia no puede llevarselo por delante.
    assert not contaminacion.es_fila_de_piranometro(FILA_SANA)
    assert not contaminacion.es_fila_de_piranometro(FILA_INVERSOR_CAIDO)


def test_la_firma_con_las_columnas_en_nulo_no_marca_nada():
    # Given: una fila con todo en NULL. LOGICA TERNARIA: cada comparacion da NULL,
    # el OR da NULL y el `IS TRUE` del CTE lo colapsa a falso.
    # When / Then: la fila sobrevive. Escrita como `NOT (firma)` se perderia, y la
    # base caeria de 36.469 a 18.005 filas sin un solo aviso.
    assert not contaminacion.es_fila_de_piranometro({c: None for c in FILA_SANA})


def test_la_firma_no_mira_ni_una_columna_de_energia():
    # Given: las columnas que la firma inspecciona
    miradas = {col for col, _, _ in contaminacion.CLAUSULAS}
    # When / Then: ninguna es de energia. La contaminacion es de FILA y se detecta
    # en OTRAS columnas de esa fila, nunca en la que se esta limpiando.
    assert not miradas & set(contaminacion.COLUMNAS_INTOCABLES)
    assert "energia_hoy_wh" not in contaminacion.FIRMA


def test_la_firma_de_python_dice_lo_mismo_que_la_de_la_migracion():
    """EL AMARRE QUE IMPORTA: la copia de Python no puede separarse de la del SQL.

    El mismo criterio vive en `sql/003` (lo ejecuta Postgres), en
    `src/agrovoltaic/ddl.py` (el generador del ETL) y en `analitica.contaminacion`
    (lo interpolan las consultas de `analitica`). No se pueden fundir en uno, asi
    que se amarran: los marcadores `FIRMA:INICIO`/`FIRMA:FIN` estan puestos en la
    migracion justamente para poder parsearla. Desincronizarlas falla en silencio
    en produccion y en las dos direcciones: una clausula de mas se lleva dato
    bueno, una de menos deja pasar 39 MWh.
    """
    # Given: las clausulas que la migracion mete dentro de la vista corregida
    bloque = re.search(r"-- FIRMA:INICIO(.*?)-- FIRMA:FIN",
                       MIGRACION.read_text(encoding="utf-8"), re.S)
    assert bloque, "la firma de la migracion perdio sus marcadores FIRMA:INICIO/FIN"
    del_sql = {(col, op, float(num)) for col, op, num
               in re.findall(r"m\.(\w+)\s*([<>])\s*(-?[\d.]+)", bloque.group(1))}

    # When / Then: clausula por clausula, las mismas
    assert del_sql == set(contaminacion.CLAUSULAS)


def test_la_firma_de_python_dice_lo_mismo_que_la_del_generador_del_etl():
    # Given: `_FIRMA_PIRANOMETRO`, la constante con que el ETL recrea la vista.
    # Vive en el repo padre: si este paquete se desplego solo no hay nada que
    # comparar, y eso se dice en vez de dar un verde vacio.
    if not DDL_DEL_ETL.exists():
        pytest.skip(f"{DDL_DEL_ETL} no esta en este arbol (paquete desplegado solo)")
    bloque = re.search(r"_FIRMA_PIRANOMETRO = \" OR \"\.join\(\((.*?)\)\)",
                       DDL_DEL_ETL.read_text(encoding="utf-8"), re.S)
    assert bloque, "`_FIRMA_PIRANOMETRO` cambio de forma y ya no se puede comparar"
    del_etl = {(col, op, float(num)) for col, op, num
               in re.findall(r"(\w+) ([<>]) (-?[\d.]+)", bloque.group(1))}

    # When / Then: las mismas clausulas que las de aca
    assert del_etl == set(contaminacion.CLAUSULAS)


def test_los_dos_modulos_de_analitica_filtran_con_la_misma_firma():
    # Given: las dos consultas que leen energia del store electrico
    # When / Then: las dos anteponen el MISMO CTE. `rendimiento.py` descartaba por
    # una lista de dos timestamps fijos, que atrapaba las dos filas sucias
    # conocidas y ninguna de las que apareciera despues.
    assert contaminacion.CTE_SUCIAS in energia._SQL_POR_DIA
    assert contaminacion.CTE_SUCIAS in rendimiento._SQL_DIARIO
    assert "2025-10-07 07:45" not in rendimiento._SQL_DIARIO
    assert not hasattr(rendimiento, "FILAS_CONTAMINADAS")


def test_la_limpieza_va_por_anti_join_y_nunca_por_not_de_la_firma():
    # Given: la consulta que sirve todos los numeros del modulo.
    sql = energia._SQL_POR_DIA
    # When / Then: `NOT (firma)` con NULLs devuelve NULL, el WHERE lo trata como
    # falso y se lleva la base por delante. El anti-join no tiene tercer estado.
    assert "LEFT JOIN sucias" in sql and 's."timestamp" IS NULL' in sql
    assert "NOT (" not in sql


def test_se_anula_la_columna_de_energia_y_no_se_descarta_la_fila():
    # Given: las dos consultas que limpian con la firma
    # When / Then: cada columna de energia sale por un CASE, igual que hara
    # `sql/003`. Descartar la fila entera se llevaria tambien su potencia y su
    # marca (y con ella el intervalo que define), asi que retirar este filtro
    # cuando la migracion se aplique cambiaria numeros que no tiene que cambiar.
    for columna in contaminacion.COLUMNAS_INTOCABLES:
        assert contaminacion.anular(columna) in energia._SQL_POR_DIA
    for columna in ("energia_pv1_wh", "energia_pv2_wh"):
        assert contaminacion.anular(columna, fila="e") in rendimiento._SQL_DIARIO
    # y ninguna de las dos filtra filas por la firma
    assert 'AND s."timestamp" IS NULL' not in energia._SQL_POR_DIA
    assert 'AND s."timestamp" IS NULL' not in rendimiento._SQL_DIARIO


def test_el_registro_contaminado_de_137_kwh_no_entra_en_ningun_total():
    # Given: la fila mezclada YA no llega (la filtra la consulta), asi que el
    # 2026-03-09 cierra en su ultimo valor sano, 3,586.
    dias = [_dia("2026-03-09", ac_cierre=3.586), _dia("2026-03-10", ac_cierre=6.65)]
    # When
    resumen = energia.resumir(dias)
    # Then: 10,24 kWh y no 143,9. Ese unico registro mete 8% de error en
    # cualquier total anual.
    assert resumen["registrada_kwh"]["valor"] == pytest.approx(10.24)
    assert resumen["registrada_kwh"]["valor"] < CONTAMINADA_KWH


# ── Ausencia contra cero ─────────────────────────────────────────────────────
def test_un_rango_sin_datos_devuelve_none_con_motivo_y_jamas_cero():
    # Given: un periodo sin una sola fila.
    # When
    resumen = energia.resumir([])
    # Then: un cero aqui afirmaria que la planta no genero, que es falso y ademas
    # indistinguible de la verdad si el numero viaja solo.
    assert resumen["registrada_kwh"]["valor"] is None
    assert resumen["registrada_kwh"]["motivo"] == SIN_LECTURAS
    assert resumen["planta_kwh"]["valor"] is None
    assert resumen["no_registrada_kwh"]["valor"] is None


def test_con_filas_pero_columna_vacia_el_motivo_distingue_el_caso():
    # Given: el caso real de nov-2025 a feb-2026 para el contador de vida: hay
    # filas del inversor, pero `energia_total_wh` vino NULL en todas.
    dias = [_dia("2025-12-01", n_vida=0)]
    # When
    resumen = energia.resumir(dias)
    # Then: el motivo separa "no hubo datos" de "la columna no vino en el CSV".
    assert resumen["planta_kwh"]["valor"] is None
    assert resumen["planta_kwh"]["motivo"] == COLUMNA_AUSENTE


def test_la_ventana_de_nov2025_a_feb2026_devuelve_energia_ac_real_no_un_hueco():
    # Given: los cuatro meses en que `potencia_total_wac`, `energia_total_wh`,
    # `energia_pv1_wh` y `energia_pv2_wh` estan al 100% en NULL. `energia_hoy_wh`
    # NO lo esta: tiene 13.922 lecturas en 118 dias, y es la unica fuente que
    # cubre esa ventana. ESTE ES EL TEST QUE FIJA EL HALLAZGO.
    dias = [_dia(f"2025-12-{d:02d}", ac_cierre=5.0, n_ac=118, n_vida=0,
                 n_dc=0, n_potencia=118) for d in range(1, 5)]
    # When
    resumen = energia.resumir(dias)
    # Then: el tablero AC se llena. El hueco de cuatro meses no existe.
    assert resumen["registrada_kwh"]["valor"] == pytest.approx(20.0)
    assert resumen["registrada_kwh"]["n"] == 472
    # Y el contador de vida, que si esta vacio ahi, no finge un cero.
    assert resumen["planta_kwh"]["valor"] is None


# ── El control de sanidad de R7 ──────────────────────────────────────────────
def test_el_ac_sale_un_poco_menor_que_el_dc_como_predijo_leo():
    # Given: dias con los dos contadores. La razon medida sobre 129 dias reales da
    # mediana 0,958 (p05 0,944, p95 1,000): la eficiencia del inversor.
    dias = [_dia(f"2026-04-{d:02d}", ac_cierre=9.58, dc_inclinado=6.0,
                 dc_vertical=4.0, n_dc=144) for d in range(1, 6)]
    # When
    coherencia = energia.coherencia_ac_dc(dias)
    # Then: menor que 1 por las perdidas del inversor, y el veredicto viaja en el
    # payload para que no haga falta correr un test para verlo.
    assert coherencia["razon_ac_dc"]["valor"] == pytest.approx(0.958)
    assert coherencia["cumple_r7"] is True
    assert coherencia["dias"] == 5


def test_se_reporta_cuanto_subestima_la_integral_dc_contra_su_contador():
    # Given: dias que cierran en 8,57 kWh de contador DC y cuya potencia sumada,
    # integrada a 5 min, da 7,91 kWh: la razon 0,923 medida sobre los 129 dias
    # comparables de la serie real.
    dias = [_dia(f"2026-04-{d:02d}", ac_cierre=8.2, dc_inclinado=5.0,
                 dc_vertical=3.57, n_dc=144, w_inclinado=56900.0, w_vertical=38000.0)
            for d in range(1, 6)]
    # When
    coherencia = energia.coherencia_ac_dc(dias)
    # Then: la integral queda por debajo de su propio contador, y ese numero es lo
    # que explica que el total AC salga mayor que la suma de las casillas por
    # arreglo sin que ninguno de los dos este mal.
    assert coherencia["razon_integral_contador_dc"]["valor"] == pytest.approx(0.923, abs=0.005)
    assert coherencia["razon_integral_contador_dc"]["valor"] < 1.0


def test_un_ac_sistematicamente_mayor_que_el_dc_se_denuncia_en_el_payload():
    # Given: la implementacion equivocada, con el AC saliendo mayor que el DC.
    dias = [_dia(f"2026-04-{d:02d}", ac_cierre=12.0, dc_inclinado=6.0,
                 dc_vertical=4.0, n_dc=144) for d in range(1, 6)]
    # When
    coherencia = energia.coherencia_ac_dc(dias)
    # Then: R7 dice que el AC "sera siempre un poco menor". Si sale mayor, la
    # sospecha va sobre la implementacion antes que sobre el inversor.
    assert coherencia["razon_ac_dc"]["valor"] > 1
    assert coherencia["cumple_r7"] is False


def test_un_dia_truncado_no_ensucia_la_razon_ac_dc():
    # Given: el 2024-12-23 real, con UNA sola fila: 0,7 AC contra 6,0 DC da razon
    # 0,117, que no es una perdida del inversor sino un dia partido.
    dias = [_dia("2024-12-23", ac_cierre=0.05, dc_inclinado=0.2, dc_vertical=0.1,
                 n_dc=1, n_ac=1)]
    # When
    coherencia = energia.coherencia_ac_dc(dias)
    # Then: queda fuera por no llegar al minimo de DC, y se dice que no hubo dias.
    assert coherencia["dias"] == 0
    assert coherencia["razon_ac_dc"]["valor"] is None


def test_sin_contadores_dc_la_coherencia_no_finge_un_veredicto():
    # Given: nov-2025 a feb-2026, donde el DC por contador no existe.
    dias = [_dia("2025-12-01", n_dc=0)]
    # When
    coherencia = energia.coherencia_ac_dc(dias)
    # Then: `cumple_r7` es None, no False: no se pudo comprobar, no fallo.
    assert coherencia["cumple_r7"] is None
    assert coherencia["dias"] == 0


# ── La energia DC por arreglo ────────────────────────────────────────────────
def test_la_energia_dc_de_un_arreglo_es_la_integral_de_su_potencia_en_kwh():
    # Given: 12.000 W sumados sobre las filas de 5 min de un dia.
    dias = [_dia(w_inclinado=12000.0, w_vertical=6000.0)]
    # When
    inclinado = energia.integral_dc(dias, energia.INCLINADO)
    vertical = energia.integral_dc(dias, energia.VERTICAL)
    # Then: sum(W) * (5/60) / 1000 = kWh.
    assert inclinado["valor"] == pytest.approx(1.0)
    assert vertical["valor"] == pytest.approx(0.5)
    assert inclinado["unidad"] == "kWh"


def test_un_arreglo_sin_potencia_no_devuelve_cero_sino_ausencia():
    # Given: noviembre 2024, que tiene AC y cero DC (el espejo del hueco de 2025).
    dias = [_dia("2024-11-10", n_potencia=0, filas=174)]
    # When
    inclinado = energia.integral_dc(dias, energia.INCLINADO)
    # Then: la columna vino vacia, no es que el arreglo no generara.
    assert inclinado["valor"] is None
    assert inclinado["motivo"] == COLUMNA_AUSENTE
