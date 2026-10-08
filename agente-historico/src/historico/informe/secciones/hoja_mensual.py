"""La hoja Mensual: un renglon por mes y el total del periodo. Puro."""
from __future__ import annotations

from historico.informe.secciones.comun import (CONTADOR, GHI, INCLINADO, POA,
                                              PR_IMPOSIBLE, VERTICAL, suma_presente)
from historico.informe.tabla import DECIMAL_2, DECIMAL_3, ENTERO, Columna, Hoja, si_no

COLUMNAS_MENSUAL = (
    Columna("mes", "Mes", "", None, "Mes calendario (aaaa-mm)."),
    Columna("dias_calendario", "Días del periodo", "", ENTERO,
            "Días de ese mes que caen dentro del rango pedido."),
    Columna("dias_con_datos", "Días con datos", "", ENTERO,
            "Días con al menos una lectura eléctrica."),
    Columna("dias_aptos_pr", "Días aptos para PR", "", ENTERO,
            "Días que pasan el criterio de cobertura y desfase."),
    Columna("energia_ac_kwh", "Energía AC", "kWh", DECIMAL_2,
            "Suma de los cierres diarios del contador del inversor."),
    Columna("energia_dc_inclinado_kwh", "Energía DC inclinado", "kWh", DECIMAL_2,
            "Suma de los cierres diarios del contador de PV1."),
    Columna("energia_dc_vertical_kwh", "Energía DC vertical", "kWh", DECIMAL_2,
            "Suma de los cierres diarios del contador de PV2."),
    Columna("pr_inclinado_ghi", "PR inclinado (horizontal)", "", DECIMAL_3,
            "PR del mes ponderado por energía (IEC 61724), contador contra GHI."),
    Columna("pr_vertical_ghi", "PR vertical (horizontal)", "", DECIMAL_3,
            "PR del mes ponderado por energía, contador contra GHI."),
    Columna("dias_pr", "Días que sostienen el PR", "", ENTERO,
            "Días aptos que además tienen contador DC."),
    Columna("ventaja_inclinado_pct", "Ventaja del inclinado", "%", DECIMAL_2,
            "Cuánto supera el PR del inclinado al del vertical, contra GHI. "
            "Negativo: gana el vertical."),
    Columna("pr_inclinado_poa", "PR inclinado (plano propio)", "", DECIMAL_3,
            "Contador contra POA bifacial. Provisional."),
    Columna("pr_vertical_poa", "PR vertical (plano propio)", "", DECIMAL_3,
            "Contador contra POA bifacial. Provisional."),
    Columna("dias_parada", "Días con planta parada", "", ENTERO,
            "Días con el inversor sin acoplar en horario diurno."),
    Columna("horas_parada", "Horas parada", "h", DECIMAL_2,
            "Suma de las horas sin acoplar del mes."),
    Columna("aviso", "Aviso", "", None, "Marca de PR físicamente imposible."),
)


def _valor_pr(bloque: dict, insumo: str, arreglo: str) -> tuple[float | None, int, bool]:
    """(PR, dias que lo sostienen, supera el limite fisico) de una variante."""
    celda = bloque[CONTADOR][insumo][arreglo]
    pr = celda["pr"]
    return pr["valor"], celda["dias"], bool(pr.get("supera_limite_fisico"))


def ventaja(pr_inclinado: float | None, pr_vertical: float | None) -> float | None:
    if pr_inclinado is None or not pr_vertical:
        return None
    return (pr_inclinado / pr_vertical - 1.0) * 100.0


def fila_agregada(etiqueta: str, dias: list[dict], bloque_pr: dict | None) -> dict:
    """Un renglon de mes (o el total) desde sus dias y su bloque de PR."""
    fila = {
        "mes": etiqueta,
        "dias_calendario": len(dias),
        "dias_con_datos": sum(1 for d in dias if d["filas_electrico"]),
        "dias_aptos_pr": sum(1 for d in dias if d["apto_pr"] == si_no(True)),
        "energia_ac_kwh": suma_presente(dias, "energia_ac_kwh"),
        "energia_dc_inclinado_kwh": suma_presente(dias, "energia_dc_inclinado_kwh"),
        "energia_dc_vertical_kwh": suma_presente(dias, "energia_dc_vertical_kwh"),
        "dias_parada": sum(1 for d in dias if d["planta_parada"] == si_no(True)),
        "horas_parada": suma_presente(dias, "horas_parada"),
        "pr_inclinado_ghi": None, "pr_vertical_ghi": None, "dias_pr": 0,
        "ventaja_inclinado_pct": None,
        "pr_inclinado_poa": None, "pr_vertical_poa": None, "aviso": "",
    }
    if bloque_pr is None:
        return fila
    pr_i, n_i, imp_i = _valor_pr(bloque_pr, GHI, INCLINADO)
    pr_v, n_v, imp_v = _valor_pr(bloque_pr, GHI, VERTICAL)
    poa_i, _, imp_pi = _valor_pr(bloque_pr, POA, INCLINADO)
    poa_v, _, imp_pv = _valor_pr(bloque_pr, POA, VERTICAL)
    fila.update({
        "pr_inclinado_ghi": pr_i, "pr_vertical_ghi": pr_v,
        "dias_pr": min(n_i, n_v),
        "ventaja_inclinado_pct": ventaja(pr_i, pr_v),
        "pr_inclinado_poa": poa_i, "pr_vertical_poa": poa_v,
        "aviso": PR_IMPOSIBLE if any((imp_i, imp_v, imp_pi, imp_pv)) else "",
    })
    return fila


def filas_mensual(dias: list[dict], por_mes: list[dict]) -> list[dict]:
    bloques = {m["mes"]: m for m in por_mes}
    grupos: dict[str, list[dict]] = {}
    for dia in dias:
        grupos.setdefault(dia["fecha"][:7], []).append(dia)
    return [fila_agregada(mes, grupo, bloques.get(mes))
            for mes, grupo in sorted(grupos.items())]


def mensual(filas: list[dict]) -> Hoja:
    return Hoja("Mensual", "Energía y Performance Ratio por mes", COLUMNAS_MENSUAL,
                filas,
                "El PR mensual no es el promedio de los diarios: pondera por energía.")
