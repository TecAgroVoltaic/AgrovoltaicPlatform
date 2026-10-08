"""La hoja Diario: un renglon por dia de calendario. Puro."""
from __future__ import annotations

from historico.analitica import energia, rendimiento
from historico.informe.secciones.columnas_diario import COLUMNAS_DIARIO
from historico.informe.secciones.comun import (CONTADOR, GHI, HORAS_POR_LECTURA,
                                              INCLINADO, INTEGRAL, PARADA, POA,
                                              PR_IMPOSIBLE, SIN_CONTADOR, SIN_FILAS,
                                              VERTICAL, a_float, wh_a_kwh)
from historico.informe.tabla import Hoja, si_no

_MOTIVO = {
    rendimiento.SIN_RADIACION: "sin radiación",
    rendimiento.SIN_ELECTRICO: "sin eléctrico",
    rendimiento.SIN_VENTANA_SOLAR: "sin ventana solar calculada",
    rendimiento.COBERTURA_INSUFICIENTE:
        f"cobertura menor al {rendimiento.COBERTURA_MINIMA:.0%} del día solar",
    rendimiento.DESFASE_EXCESIVO: "radiación y eléctrico cubren tramos distintos del día",
}


def _pr(dia: dict, insumo: str, fuente: str, arreglo: str) -> float | None:
    return rendimiento.pr_del_dia(dia, insumo)["por_fuente"][fuente][arreglo]


def _motivo(evaluado: dict | None, prs: dict, parada: bool) -> str:
    if evaluado is None:
        return SIN_FILAS
    if not evaluado["valido"]:
        return "; ".join(_MOTIVO.get(m, m) for m in evaluado["motivos_descarte"])
    if any(v is not None and v > rendimiento.PR_MAXIMO_FISICO for v in prs.values()):
        return PR_IMPOSIBLE
    if prs["pr_inclinado_ghi"] is None and prs["pr_vertical_ghi"] is None:
        return SIN_CONTADOR
    if parada:
        return PARADA
    return ""


_PR_VACIO = dict.fromkeys(("pr_inclinado_ghi", "pr_vertical_ghi", "pr_inclinado_poa",
                           "pr_vertical_poa", "pr_inclinado_ghi_integral",
                           "pr_vertical_ghi_integral"))


def _prs(evaluado: dict | None) -> dict:
    if evaluado is None or not evaluado["valido"]:
        return dict(_PR_VACIO)
    return {
        "pr_inclinado_ghi": _pr(evaluado, GHI, CONTADOR, INCLINADO),
        "pr_vertical_ghi": _pr(evaluado, GHI, CONTADOR, VERTICAL),
        "pr_inclinado_poa": _pr(evaluado, POA, CONTADOR, INCLINADO),
        "pr_vertical_poa": _pr(evaluado, POA, CONTADOR, VERTICAL),
        "pr_inclinado_ghi_integral": _pr(evaluado, GHI, INTEGRAL, INCLINADO),
        "pr_vertical_ghi_integral": _pr(evaluado, GHI, INTEGRAL, VERTICAL),
    }


def filas_diario(calendario: list[dict], filas_pr: list[dict],
                 filas_energia: list[dict]) -> list[dict]:
    """Un renglon por dia de CALENDARIO: los dias sin dato tambien son un dato."""
    evaluados = {str(f["dia"]): rendimiento.evaluar_dia(f) for f in filas_pr}
    energias = {str(f["dia"]): f for f in filas_energia}
    salida = []
    for dia in calendario:
        fecha = str(dia["fecha"])
        ev, en = evaluados.get(fecha), energias.get(fecha) or {}
        ev_o = ev or {}
        prs = _prs(ev)
        sin_acoplar = dia.get("lecturas_sin_acoplar") or 0
        salida.append({
            "fecha": fecha,
            "filas_electrico": dia.get("filas_electrico") or 0,
            "filas_radiacion": dia.get("filas_radiacion") or 0,
            "energia_ac_kwh": (energia.a_kwh(en["ac_cierre"])
                               if en.get("n_ac") and en.get("ac_cierre") is not None
                               else None),
            "energia_dc_inclinado_kwh": a_float(ev_o.get("e1_contador_kwh")),
            "energia_dc_vertical_kwh": a_float(ev_o.get("e2_contador_kwh")),
            "energia_dc_inclinado_integral_kwh": wh_a_kwh(ev_o.get("e1_integral_wh")),
            "energia_dc_vertical_integral_kwh": wh_a_kwh(ev_o.get("e2_integral_wh")),
            "irradiacion_ghi_kwh_m2": wh_a_kwh(ev_o.get("ghi_wh_m2")),
            "irradiacion_poa_inclinado_kwh_m2": wh_a_kwh(ev_o.get("poa1_bif_wh_m2")),
            "irradiacion_poa_vertical_kwh_m2": wh_a_kwh(ev_o.get("poa2_bif_wh_m2")),
            **prs,
            "apto_pr": si_no(bool(ev and ev["valido"])),
            "motivo": _motivo(ev, prs, bool(sin_acoplar)),
            "horas_sol": a_float(ev_o.get("horas_sol")),
            "cobertura_radiacion": ev_o.get("cobertura_radiacion"),
            "cobertura_electrico": ev_o.get("cobertura_electrico"),
            "cielo": dia.get("clase") or "",
            "kt_medio": a_float(dia.get("kt_medio")),
            "planta_parada": si_no(bool(sin_acoplar)),
            "horas_parada": sin_acoplar * HORAS_POR_LECTURA if sin_acoplar else None,
            "parada_bajo_sol": si_no(bool(dia.get("parada_bajo_sol"))),
            "calidad": dia.get("veredicto") or "",
        })
    return salida


def diario(filas: list[dict]) -> Hoja:
    return Hoja("Diario", "Un renglón por día del periodo", COLUMNAS_DIARIO, filas,
                "Celda vacía = sin dato, no cero. El motivo está en su columna.")
