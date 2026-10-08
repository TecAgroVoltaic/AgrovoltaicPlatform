"""Hojas, hechos y advertencias desde los insumos crudos. PURO: no toca la base."""
from __future__ import annotations

from historico.analitica import rendimiento
from historico.informe import hechos as hechos_mod, libro, secciones
from historico.informe.tabla import Hoja, si_no


def advertencias(dias: list[dict], total: dict, ultimo_dato: str | None) -> list[str]:
    salida = [
        "La irradiancia está sin calibrar: todo PR de este informe es provisional.",
        "El PR contra el plano propio usa una irradiancia modelada con pvlib; la "
        "ecuación de transposición está pendiente de aval.",
        "Las columnas de energía del inversor terminan en _wh pero están en kWh. "
        "Este informe las entrega en kWh.",
        f"De {total['dias_aptos_pr']} días aptos para PR, {total['dias_pr']} tienen "
        "contador DC por arreglo. El PR del periodo se apoya solo en esos.",
    ]
    imposibles = sum(1 for d in dias if d["motivo"] == secciones.PR_IMPOSIBLE)
    if imposibles:
        salida.append(f"Días con un PR mayor a 1: {imposibles}. Es físicamente "
                      "imposible y apunta a la irradiancia. Están marcados en la hoja "
                      "Diario.")
    salida.append(f"El último dato eléctrico de toda la base es del "
                  f"{(ultimo_dato or 'sin dato')[:10]}: la carga de datos es manual.")
    return salida


def componer(insumos: dict, etiqueta_desde: str, etiqueta_hasta: str,
             ultimo_dato: str | None) -> dict:
    """Hojas, hechos y advertencias desde los insumos crudos. PURA."""
    dias = secciones.filas_diario(insumos["calendario"], insumos["filas_pr"],
                                  insumos["filas_energia"])
    # Solo las filas de dias del calendario pedido: `rendimiento.consultar` ya
    # acota por la misma ventana, pero el agregado tiene que hablar de los mismos
    # dias que la hoja Diario si alguna vez dejaran de coincidir.
    fechas = {d["fecha"] for d in dias}
    filas_pr = [f for f in insumos["filas_pr"] if str(f["dia"]) in fechas]
    pr = rendimiento.componer(filas_pr, rendimiento.GHI, insumos["motivo_poa"])
    meses = secciones.filas_mensual(dias, pr["por_mes"])
    total = secciones.fila_agregada(libro.TOTAL, dias, pr["total"])
    hojas: list[Hoja] = [
        secciones.diario(dias),
        secciones.mensual([*meses, total]),
        secciones.disponibilidad(dias),
        secciones.calidad(insumos["tipos"]),
    ]
    return {
        "hojas": hojas,
        "hechos": hechos_mod.armar(etiqueta_desde, etiqueta_hasta, dias, meses, total,
                                   insumos["tipos"]),
        "advertencias": advertencias(dias, total, ultimo_dato),
        "dias_con_datos": total["dias_con_datos"],
        "dias_parada": sum(1 for d in dias if d["planta_parada"] == si_no(True)),
    }
