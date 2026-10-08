"""Las hojas del informe, armadas desde filas YA consultadas. Todo PURO, sin DB.

Aca no se calcula ningun indicador nuevo: el PR sale de `analitica.rendimiento`,
la energia AC de `analitica.energia` y el veredicto de `calidad.contexto`. Lo que
hace este modulo es JUNTARLOS por dia, que es lo que hoy rearma a mano quien baja
los datos crudos.

Dos reglas que valen para todas las hojas:

  * Una celda sin dato va VACIA y con motivo en la columna de al lado, nunca en
    cero. Es la misma grieta que cierra `analitica.resultado`.
  * El PR de un dia que no pasa el criterio de `rendimiento.evaluar_dia` no se
    escribe: un PR sobre medio dia de radiacion es un numero plausible y falso.
"""
from __future__ import annotations

from collections import Counter

from historico.analitica import energia, rendimiento
from historico.informe.tabla import (DECIMAL_2, DECIMAL_3, ENTERO, FECHA, Columna,
                                     Hoja, si_no)

HORAS_POR_LECTURA = energia.HORAS_POR_FILA
WH_POR_KWH = 1000.0

INCLINADO, VERTICAL = rendimiento.INCLINADO, rendimiento.VERTICAL
CONTADOR, INTEGRAL = rendimiento.CONTADOR, rendimiento.INTEGRAL
GHI, POA = rendimiento.GHI, rendimiento.POA_BIFACIAL

SIN_FILAS = "sin datos ese día"
SIN_CONTADOR = "día apto, pero sin contador DC: el PR solo sale por integral"
PR_IMPOSIBLE = "PR mayor a 1: físicamente imposible, revisar la irradiancia"
PARADA = "planta parada ese día: el PR mide la parada, no los paneles"

_MOTIVO = {
    rendimiento.SIN_RADIACION: "sin radiación",
    rendimiento.SIN_ELECTRICO: "sin eléctrico",
    rendimiento.SIN_VENTANA_SOLAR: "sin ventana solar calculada",
    rendimiento.COBERTURA_INSUFICIENTE:
        f"cobertura menor al {rendimiento.COBERTURA_MINIMA:.0%} del día solar",
    rendimiento.DESFASE_EXCESIVO: "radiación y eléctrico cubren tramos distintos del día",
}


def _f(valor) -> float | None:
    return None if valor is None else float(valor)


def _kwh(wh) -> float | None:
    return None if wh is None else float(wh) / WH_POR_KWH


def _suma(filas: list[dict], clave: str) -> float | None:
    """Suma de los valores presentes; None si no hay ninguno (no cero)."""
    valores = [f[clave] for f in filas if f.get(clave) is not None]
    return sum(valores) if valores else None


# ── Diario ──────────────────────────────────────────────────────────────────────
COLUMNAS_DIARIO = (
    Columna("fecha", "Fecha", "", FECHA, "Día local de Costa Rica (UTC-6)."),
    Columna("filas_electrico", "Lecturas eléctricas", "", ENTERO,
            "Filas del inversor ese día (cadencia nominal de 5 min)."),
    Columna("filas_radiacion", "Lecturas de radiación", "", ENTERO,
            "Filas del piranómetro ese día."),
    Columna("energia_ac_kwh", "Energía AC", "kWh", DECIMAL_2,
            "Cierre diario del contador del inversor (energia_hoy_wh, que está en kWh "
            "pese al nombre). Es la energía del tablero."),
    Columna("energia_dc_inclinado_kwh", "Energía DC inclinado (contador)", "kWh",
            DECIMAL_2, "Cierre diario de energia_pv1_wh (PV1, 20°/150°)."),
    Columna("energia_dc_vertical_kwh", "Energía DC vertical (contador)", "kWh",
            DECIMAL_2, "Cierre diario de energia_pv2_wh (PV2, 90°/50°)."),
    Columna("energia_dc_inclinado_integral_kwh", "Energía DC inclinado (integral)",
            "kWh", DECIMAL_2,
            "Potencia PV1 integrada en el tiempo. Subestima frente al contador."),
    Columna("energia_dc_vertical_integral_kwh", "Energía DC vertical (integral)",
            "kWh", DECIMAL_2,
            "Potencia PV2 integrada en el tiempo. Subestima frente al contador."),
    Columna("irradiacion_ghi_kwh_m2", "Irradiación horizontal", "kWh/m²", DECIMAL_3,
            "Irradiancia incidente integrada con el intervalo real entre lecturas."),
    Columna("irradiacion_poa_inclinado_kwh_m2", "Irradiación plano inclinado",
            "kWh/m²", DECIMAL_3,
            "POA bifacial modelada con pvlib. Provisional: falta el aval de la "
            "transposición."),
    Columna("irradiacion_poa_vertical_kwh_m2", "Irradiación plano vertical",
            "kWh/m²", DECIMAL_3,
            "POA bifacial modelada con pvlib. Provisional: falta el aval de la "
            "transposición."),
    Columna("pr_inclinado_ghi", "PR inclinado (horizontal)", "", DECIMAL_3,
            "Energía del contador sobre 1,42 kWp, dividida por la irradiación "
            "horizontal. Solo en días aptos."),
    Columna("pr_vertical_ghi", "PR vertical (horizontal)", "", DECIMAL_3,
            "Igual que el anterior, para el arreglo vertical."),
    Columna("pr_inclinado_poa", "PR inclinado (plano propio)", "", DECIMAL_3,
            "Contador contra la POA bifacial del arreglo. Provisional."),
    Columna("pr_vertical_poa", "PR vertical (plano propio)", "", DECIMAL_3,
            "Contador contra la POA bifacial del arreglo. Provisional."),
    Columna("pr_inclinado_ghi_integral", "PR inclinado (integral)", "", DECIMAL_3,
            "Como el PR horizontal, con la integral de potencia en vez del contador. "
            "Cubre los días sin contador."),
    Columna("pr_vertical_ghi_integral", "PR vertical (integral)", "", DECIMAL_3,
            "Como el PR horizontal, con la integral de potencia en vez del contador."),
    Columna("apto_pr", "Apto para PR", "", None,
            "si: radiación y eléctrico cubren el día solar y coinciden en el tramo."),
    Columna("motivo", "Motivo", "", None,
            "Por qué el día no es apto, o qué aviso lleva su PR."),
    Columna("horas_sol", "Horas de sol", "h", DECIMAL_2,
            "Duración del día solar calculada para el sitio."),
    Columna("cobertura_radiacion", "Cobertura radiación", "", DECIMAL_3,
            "Horas con radiación sobre horas de sol."),
    Columna("cobertura_electrico", "Cobertura eléctrico", "", DECIMAL_3,
            "Horas con dato eléctrico sobre horas de sol."),
    Columna("cielo", "Cielo", "", None,
            "Clase del día por índice de claridad y variabilidad."),
    Columna("kt_medio", "kt medio", "", DECIMAL_3,
            "Irradiancia medida sobre la de cielo despejado. Mayor a 1 de forma "
            "sostenida indica irradiancia sin calibrar."),
    Columna("planta_parada", "Planta parada", "", None,
            "si: hubo lecturas con las variables AC en cero entre las 7 y las 17 h."),
    Columna("horas_parada", "Horas parada", "h", DECIMAL_2,
            "Lecturas sin acoplar por 5 minutos."),
    Columna("parada_bajo_sol", "Parada con sol", "", None,
            "si: la parada coincidió con irradiancia alta."),
    Columna("calidad", "Calidad del dato", "", None,
            "Veredicto del barrido: ok, aviso, grave o sin_datos."),
)


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
            "energia_dc_inclinado_kwh": _f(ev_o.get("e1_contador_kwh")),
            "energia_dc_vertical_kwh": _f(ev_o.get("e2_contador_kwh")),
            "energia_dc_inclinado_integral_kwh": _kwh(ev_o.get("e1_integral_wh")),
            "energia_dc_vertical_integral_kwh": _kwh(ev_o.get("e2_integral_wh")),
            "irradiacion_ghi_kwh_m2": _kwh(ev_o.get("ghi_wh_m2")),
            "irradiacion_poa_inclinado_kwh_m2": _kwh(ev_o.get("poa1_bif_wh_m2")),
            "irradiacion_poa_vertical_kwh_m2": _kwh(ev_o.get("poa2_bif_wh_m2")),
            **prs,
            "apto_pr": si_no(bool(ev and ev["valido"])),
            "motivo": _motivo(ev, prs, bool(sin_acoplar)),
            "horas_sol": _f(ev_o.get("horas_sol")),
            "cobertura_radiacion": ev_o.get("cobertura_radiacion"),
            "cobertura_electrico": ev_o.get("cobertura_electrico"),
            "cielo": dia.get("clase") or "",
            "kt_medio": _f(dia.get("kt_medio")),
            "planta_parada": si_no(bool(sin_acoplar)),
            "horas_parada": sin_acoplar * HORAS_POR_LECTURA if sin_acoplar else None,
            "parada_bajo_sol": si_no(bool(dia.get("parada_bajo_sol"))),
            "calidad": dia.get("veredicto") or "",
        })
    return salida


def diario(filas: list[dict]) -> Hoja:
    return Hoja("Diario", "Un renglón por día del periodo", COLUMNAS_DIARIO, filas,
                "Celda vacía = sin dato, no cero. El motivo está en su columna.")


# ── Mensual ─────────────────────────────────────────────────────────────────────
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
        "energia_ac_kwh": _suma(dias, "energia_ac_kwh"),
        "energia_dc_inclinado_kwh": _suma(dias, "energia_dc_inclinado_kwh"),
        "energia_dc_vertical_kwh": _suma(dias, "energia_dc_vertical_kwh"),
        "dias_parada": sum(1 for d in dias if d["planta_parada"] == si_no(True)),
        "horas_parada": _suma(dias, "horas_parada"),
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


# ── Disponibilidad ──────────────────────────────────────────────────────────────
_CLAVES_DISPONIBILIDAD = ("fecha", "horas_parada", "parada_bajo_sol",
                          "irradiacion_ghi_kwh_m2", "energia_ac_kwh", "cielo",
                          "calidad")


def disponibilidad(dias: list[dict]) -> Hoja:
    """Los dias con la planta parada. Subconjunto del diario, sin calculo propio."""
    por_clave = {c.clave: c for c in COLUMNAS_DIARIO}
    filas = [{k: d[k] for k in _CLAVES_DISPONIBILIDAD}
             for d in dias if d["planta_parada"] == si_no(True)]
    return Hoja(
        "Disponibilidad", "Días con el inversor sin acoplar en horario diurno",
        tuple(por_clave[k] for k in _CLAVES_DISPONIBILIDAD), filas,
        "Un 0 en el voltaje AC es dato válido: mide disponibilidad del equipo, no "
        "calidad del dato. No se estima la energía perdida.")


# ── Calidad ─────────────────────────────────────────────────────────────────────
COLUMNAS_CALIDAD = (
    Columna("fuente", "Fuente", "", None, "Tabla donde se detectó."),
    Columna("tipo", "Tipo de hallazgo", "", None, "Prueba que lo levantó."),
    Columna("severidad", "Severidad", "", None, "grave, aviso o info."),
    Columna("dias", "Días", "", ENTERO, "Días distintos con ese hallazgo."),
    Columna("variables", "Variables", "", ENTERO, "Variables distintas afectadas."),
    Columna("lecturas", "Lecturas", "", ENTERO, "Lecturas afectadas en total."),
    Columna("primer_dia", "Primer día", "", FECHA, ""),
    Columna("ultimo_dia", "Último día", "", FECHA, ""),
)


def calidad(tipos: list[dict]) -> Hoja:
    filas = [{**t, "primer_dia": str(t["primer_dia"]), "ultimo_dia": str(t["ultimo_dia"]),
              "lecturas": int(t["lecturas"] or 0)} for t in tipos]
    return Hoja("Calidad", "Hallazgos del barrido de calidad, por tipo",
                COLUMNAS_CALIDAD, filas,
                "El veredicto día por día está en la hoja Diario.")


def conteo(dias: list[dict], clave: str) -> Counter:
    return Counter(d[clave] for d in dias if d[clave])
