"""Los graficos nativos del libro, en una hoja aparte de los datos."""
from __future__ import annotations

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference

from historico.informe.libro_estilo import (ALTO_GRAFICO, ANCHO_GRAFICO,
                                            FILAS_POR_GRAFICO, TOTAL)
from historico.informe.tabla import Hoja


def _columna(hoja: Hoja, clave: str) -> int:
    return [c.clave for c in hoja.columnas].index(clave) + 1


def _grafico(wb: Workbook, clase, hoja: Hoja, claves: list[str], titulo: str,
             eje_y: str, hasta_fila: int):
    """Un grafico nativo sobre columnas de una hoja de datos (editable en Excel)."""
    ws = wb[hoja.nombre]
    g = clase()
    g.title, g.height, g.width = titulo, ALTO_GRAFICO, ANCHO_GRAFICO
    g.y_axis.title = eje_y
    for clave in claves:
        col = _columna(hoja, clave)
        g.add_data(Reference(ws, min_col=col, min_row=1, max_row=hasta_fila),
                   titles_from_data=True)
    g.set_categories(Reference(ws, min_col=1, min_row=2, max_row=hasta_fila))
    return g


def graficos(wb: Workbook, diario: Hoja, mensual: Hoja) -> None:
    if not diario.filas:
        return
    ws = wb.create_sheet("Gráficos")
    fin_diario = len(diario.filas) + 1
    # La fila Total queda fuera de los graficos: es una suma, no un mes.
    meses = [f for f in mensual.filas if f.get("mes") != TOTAL]
    graficos = [_grafico(wb, BarChart, diario, ["energia_ac_kwh"],
                         "Energía AC por día", "kWh", fin_diario)]
    if len(meses) > 1:
        graficos.append(_grafico(wb, BarChart, mensual,
                                 ["pr_inclinado_ghi", "pr_vertical_ghi"],
                                 "PR mensual contra irradiancia horizontal", "PR",
                                 len(meses) + 1))
    else:
        graficos.append(_grafico(wb, LineChart, diario,
                                 ["pr_inclinado_ghi", "pr_vertical_ghi"],
                                 "PR diario contra irradiancia horizontal", "PR",
                                 fin_diario))
    graficos.append(_grafico(wb, BarChart, diario, ["horas_parada"],
                             "Horas con la planta parada por día", "h", fin_diario))
    for n, g in enumerate(graficos):
        ws.add_chart(g, f"A{1 + n * FILAS_POR_GRAFICO}")
