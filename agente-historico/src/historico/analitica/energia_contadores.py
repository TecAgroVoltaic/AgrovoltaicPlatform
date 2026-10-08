"""Los CONTADORES del inversor: unidades, cierre diario y reconstruccion del de vida. Puro.

Se usa a traves de `energia`, que reexporta todo lo de aca.
"""
from __future__ import annotations

# ── EL FACTOR MIL ────────────────────────────────────────────────────────────
#
# Las columnas se llaman `energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh` y
# `energia_pv2_wh`, y NO estan en Wh: **una unidad de esas columnas vale 1 kWh.**
# El sufijo `_wh` del nombre es incorrecto.
#
# Medido por dos vias independientes, no supuesto:
#   * Se integro `potencia_total_wac` (que si esta en W) dia a dia y se dividio
#     entre el cierre diario del contador: mediana 1.003,58 sobre 127 dias, con
#     dispersion menor al 1% (p25 999,04 / p75 1.008,07). Mil.
#   * El rendimiento especifico implicito (cierre / 2,84 kWp) da mediana 2,32 y
#     maximo exactamente 5,00 kWh/kWp/dia, que es el techo fisico de Costa Rica.
#
# Leidas como Wh, esas columnas darian 14 Wh de produccion diaria para 2.840 Wp:
# mil veces menos que lo fisicamente posible. Esta constante existe para que
# "corregir las unidades" dividiendo entre mil tenga que pasar por aca y rompa
# `test_un_dia_de_665_en_el_contador_son_665_kwh_y_no_milesimas`.
KWH_POR_UNIDAD = 1.0
UNIDAD = "kWh"

# Cuanto puede bajar un contador acumulativo sin que eso sea un reinicio.
#
# NO es un adorno defensivo. `energia_total_wh` no se reinicia NI UNA VEZ en las
# 19.889 lecturas de la serie, pero 37 pares consecutivos bajan del orden de
# -4,5e-13 kWh: ruido de coma flotante del `double precision`. Sin tolerancia el
# algoritmo lee esas 37 veces como reinicio, vuelve a sumar el contador entero y
# el total explota a 89.661 kWh, un absurdo para 2,84 kWp. Con tolerancia da
# 2.528,40, que es exactamente el ultimo menos el primero.
TOLERANCIA_REINICIO_KWH = 0.001


def a_kwh(unidades: float | None) -> float | None:
    """Traduce una lectura de los contadores `energia_*_wh` a kWh. Ver `KWH_POR_UNIDAD`."""
    return None if unidades is None else unidades * KWH_POR_UNIDAD


def reconstruir(tramos: list[tuple[float, float]],
                tolerancia: float = TOLERANCIA_REINICIO_KWH) -> dict:
    """Lo acumulado por un contador que se reinicia, desde (primero, ultimo) por dia.

    Puro, sin base de datos: aca vive el criterio y aca se prueba. `tramos` va en
    orden cronologico y solo trae los dias CON lectura del contador.

    Un contador acumulativo no se lee con `max()`: se suman sus incrementos y se
    tratan los saltos negativos como reinicios (R7 dice que `energia_total_wh` se
    reinicia al llegar a su maximo). El detalle que decide todo es la
    `tolerancia`: sin ella el ruido de -4,5e-13 kWh se lee 37 veces como reinicio
    y el total pasa de 2.528,40 a 89.661 kWh. Ver `TOLERANCIA_REINICIO_KWH`.

    Se miran los dos saltos posibles: el de DENTRO del dia (primero -> ultimo) y
    el que va de un dia con dato al siguiente, que puede cruzar meses sin CSV. Ese
    segundo salto es justamente el que hace visible lo generado en los huecos.
    """
    total = en_dias_registrados = 0.0
    reinicios = 0
    cierre_anterior: float | None = None
    for primero, ultimo in tramos:
        if cierre_anterior is not None:
            entre_dias = primero - cierre_anterior
            if entre_dias >= -tolerancia:
                total += max(entre_dias, 0.0)
            else:                                   # el contador se reinicio
                total += primero
                reinicios += 1
        crecimiento = ultimo - primero
        if crecimiento < -tolerancia:               # reinicio dentro del dia
            crecimiento = ultimo
            reinicios += 1
        crecimiento = max(crecimiento, 0.0)
        total += crecimiento
        en_dias_registrados += crecimiento
        cierre_anterior = ultimo
    return {"total": total, "en_dias_registrados": en_dias_registrados,
            "reinicios": reinicios, "dias": len(tramos)}


def cierres_ac(dias: list[dict]) -> list[float]:
    """El cierre diario de `energia_hoy_wh`, en kWh, de los dias que lo tienen.

    El cierre del dia es su MAXIMO, no su ultima fila. `energia_hoy_wh` es
    monotona creciente dentro del dia (232 de 270 dias no tienen ni un retroceso,
    y el peor de toda la serie es de 0,575 kWh: ruido de reporte, no un reinicio),
    asi que el maximo ES el cierre y ademas aguanta que la ultima fila del dia
    venga vacia o baja. El reinicio a cero del dia siguiente no puede leerse como
    caida porque nunca se compara un dia contra otro: se agrupa por fecha local.
    """
    return [a_kwh(d["ac_cierre"]) for d in dias
            if d.get("n_ac") and d.get("ac_cierre") is not None]


# Clave de catalogo de un contador DIARIO -> (campo del cierre, campo del conteo) en
# `por_dia`. `energia_total_wh` no esta a proposito: es de vida y no cierra por dia.
CIERRE_DIARIO = {
    "energia_hoy_wh": ("ac_cierre", "n_ac"),
    "energia_pv1_wh": ("dc_cierre_inclinado", "n_dc_inclinado"),
    "energia_pv2_wh": ("dc_cierre_vertical", "n_dc_vertical"),
}


def cierre_por_dia(dias: list[dict], clave: str) -> dict[str, float]:
    """kWh de cada dia con lectura del contador diario `clave`, por fecha ISO. Puro.

    El cierre del dia es su maximo, con el mismo criterio de `cierres_ac`. Un dia sin
    lecturas del contador NO aparece: no es un dia de cero kWh.
    """
    if clave not in CIERRE_DIARIO:
        raise ValueError(f"{clave!r} no es un contador diario; validos: {', '.join(CIERRE_DIARIO)}")
    campo, campo_n = CIERRE_DIARIO[clave]
    return {str(d["dia"])[:10]: a_kwh(d[campo]) for d in dias
            if d.get(campo_n) and d.get(campo) is not None}


def tramos_vida(dias: list[dict]) -> list[tuple[float, float]]:
    """(primero, ultimo) de `energia_total_wh` por dia, en kWh y en orden."""
    return [(a_kwh(d["vida_primero"]), a_kwh(d["vida_ultimo"])) for d in dias
            if d.get("n_vida") and d.get("vida_primero") is not None]
