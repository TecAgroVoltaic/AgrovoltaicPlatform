"""La hoja Calidad: los hallazgos del barrido, por tipo. Puro."""
from __future__ import annotations

from historico.informe.tabla import ENTERO, FECHA, Columna, Hoja

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
