"""La hoja Disponibilidad: los dias con la planta parada. Puro."""
from __future__ import annotations

from historico.informe.secciones.columnas_diario import COLUMNAS_DIARIO
from historico.informe.tabla import Hoja, si_no

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
