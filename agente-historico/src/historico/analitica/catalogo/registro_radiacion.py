"""Registro de las variables de radiacion: piranometros, clear-sky, kt* y POA modelada."""
from __future__ import annotations

from datetime import date

from historico.analitica.catalogo.variable import INCLINADO, RADIACION, VERTICAL, Variable

_V_RADIACION = "v_sc_radiacion_calibrada"
_T_POA = "radiacion_sc_poa"
_T_RADIACION = "radiacion_sc_15s"
_T_CLEARSKY = "radiacion_sc_clearsky"

# Fechas de cobertura VERIFICADAS contra la base el 2026-08-28, no supuestas.
# La vista calibrada anula la irradiancia previa al 2025-07-01 por decision del
# equipo (el error del sensor se corrigio a mediados de 2025), asi que ese es el
# piso de todo lo que pasa por ella.
_IRRADIANCIA_VALIDA_DESDE = date(2025, 7, 1)
# El piranometro de reflejada se instalo despues que el de incidente: sin el no hay
# albedo. Cualquier analisis de albedo tiene 7 meses de ventana, no 19.
_REFLEJADA_DESDE = date(2025, 10, 25)
# El SP722 no es "desde mayo 2026" como dice la documentacion: corrio 18 dias y se
# detuvo, con 360 lecturas en total. Un grafico suyo sale vacio para casi cualquier
# rango que elija el usuario, y la razon es que el sensor apenas funciono.
_SP722_DESDE, _SP722_HASTA = date(2026, 5, 11), date(2026, 5, 28)
# La POA es modelada y solo se calculo desde aca.
_POA_DESDE = date(2025, 9, 5)


def _r(clave, etiqueta, unidad, minimo, maximo, cruda,
       desde=_IRRADIANCIA_VALIDA_DESDE, hasta=None) -> Variable:
    """Variable de radiacion: la vista calibrada le pone sufijo, la tabla cruda no."""
    return Variable(clave, etiqueta, unidad, RADIACION, _V_RADIACION, clave,
                    minimo, maximo, relacion_cruda=_T_RADIACION, columna_cruda=cruda,
                    dato_desde=desde, dato_hasta=hasta)


_REGISTRO_RADIACION: tuple[Variable, ...] = (
    # ── Radiacion ────────────────────────────────────────────────────────────
    # El maximo 1500 W/m2 es el umbral de validez fisica del documento. La vista
    # calibrada agrega el sufijo `_wm2` a las irradiancias; la tabla cruda no.
    _r("irradiancia_incidente_wm2", "Irradiancia incidente", "W/m2", 0, 1500,
       "irradiancia_incidente"),
    _r("irradiancia_reflejada_wm2", "Irradiancia reflejada", "W/m2", 0, 1500,
       "irradiancia_reflejada", desde=_REFLEJADA_DESDE),
    _r("albedo", "Albedo", "adimensional", 0, 1, "albedo", desde=_REFLEJADA_DESDE),
    _r("irradiancia_incidente_sp722_wm2", "Irradiancia incidente SP722", "W/m2",
       0, 1500, "irradiancia_incidente_sp722", _SP722_DESDE, _SP722_HASTA),
    _r("irradiancia_reflejada_sp722_wm2", "Irradiancia reflejada SP722", "W/m2",
       0, 1500, "irradiancia_reflejada_sp722", _SP722_DESDE, _SP722_HASTA),
    _r("albedo_sp722", "Albedo SP722", "adimensional", 0, 1, "albedo_sp722",
       _SP722_DESDE, _SP722_HASTA),
    # El GHI de cielo despejado lo sirve la vista calibrada pero se calcula y se
    # guarda en su propia tabla, que es su crudo.
    Variable("cs_ghi_wm2", "GHI de cielo despejado (modelo)", "W/m2", RADIACION,
             _V_RADIACION, "cs_ghi_wm2", 0, 1500,
             relacion_cruda=_T_CLEARSKY),
    # kt* es un COCIENTE que la vista calcula al vuelo: no existe crudo en ninguna
    # tabla, y por eso `relacion_cruda` queda en None. Una prueba de validez fisica
    # sobre ella solo puede correr contra la vista, y hay que decirlo.
    Variable("kt_star", "Indice de claridad kt*", "adimensional", RADIACION,
             _V_RADIACION, "kt_star", 0, 1.3, dato_desde=_IRRADIANCIA_VALIDA_DESDE),
    # POA modelada. El documento la da por inexistente ("no tenemos en los planos
    # del arreglo") pero si existe, desde 2025-09-05. Es tabla, no vista: su crudo
    # es ella misma, y aun asi son valores MODELADOS, no medidos.
    Variable("poa_pv1_wm2", "POA efectiva PV1 (bifacial)", "W/m2", RADIACION,
             _T_POA, "poa_pv1_wm2", 0, 1500, INCLINADO, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    Variable("poa_pv2_wm2", "POA efectiva PV2 (bifacial)", "W/m2", RADIACION,
             _T_POA, "poa_pv2_wm2", 0, 1500, VERTICAL, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    # La MISMA transposicion contando solo la cara frontal. No es un detalle de
    # modelado: entre bifacial y frontal el PR del inclinado se mueve un 14 % y el
    # del vertical un 99 % (0,612 -> 1,217 anual, con 138 de 197 dias por encima de
    # 1, que es fisicamente imposible). `rendimiento.py` reporta las dos variantes
    # justamente porque elegir una seria elegir el veredicto, asi que las dos tienen
    # que estar en la allowlist. Estaban en uso en el SQL sin estar registradas.
    Variable("poa_pv1_front_wm2", "POA PV1 solo cara frontal", "W/m2", RADIACION,
             _T_POA, "poa_pv1_front_wm2", 0, 1500, INCLINADO, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    Variable("poa_pv2_front_wm2", "POA PV2 solo cara frontal", "W/m2", RADIACION,
             _T_POA, "poa_pv2_front_wm2", 0, 1500, VERTICAL, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
)
