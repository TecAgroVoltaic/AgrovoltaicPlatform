"""El libro de Excel. Solo escribe: no calcula ni decide nada.

Las hojas de datos llevan la CABECERA EN LA FILA 1 y el nombre de columna en
snake_case con la unidad en el nombre (`energia_ac_kwh`). Es a proposito: asi
`readtable` de MATLAB y `pandas.read_excel` las leen sin saltar filas ni renombrar.
La etiqueta legible, la unidad y la definicion de cada columna estan en la hoja
Método, y los graficos en una hoja aparte para no ensuciar los datos.
"""
from __future__ import annotations

import io
from datetime import date

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from historico.informe.tabla import FECHA, Hecho, Hoja, texto
from historico.informe.verificar import HIPOTESIS

MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_NEGRITA = Font(bold=True)
_TITULO = Font(bold=True, size=14)
_CABECERA = PatternFill("solid", fgColor="DDE5ED")
_AJUSTE = Alignment(wrap_text=True, vertical="top")
_ANCHO_MIN, _ANCHO_MAX = 10, 44
_ANCHO_TEXTO = 110
_ALTO_GRAFICO, _ANCHO_GRAFICO = 8.5, 26.0
_FILAS_POR_GRAFICO = 19

TOTAL = "Total"


def _celda(valor, formato: str | None):
    if formato == FECHA and isinstance(valor, str) and valor:
        return date.fromisoformat(valor[:10])
    return valor


def _cabecera(ws, fila: int, titulos: list[str]) -> None:
    for i, titulo in enumerate(titulos, start=1):
        c = ws.cell(row=fila, column=i, value=titulo)
        c.font, c.fill = _NEGRITA, _CABECERA


def _hoja_de_datos(wb: Workbook, hoja: Hoja) -> None:
    ws = wb.create_sheet(hoja.nombre)
    _cabecera(ws, 1, [c.clave for c in hoja.columnas])
    for f, fila in enumerate(hoja.filas, start=2):
        for i, col in enumerate(hoja.columnas, start=1):
            c = ws.cell(row=f, column=i, value=_celda(fila.get(col.clave), col.formato))
            if col.formato:
                c.number_format = col.formato
            if fila.get(hoja.columnas[0].clave) == TOTAL:
                c.font = _NEGRITA
    for i, col in enumerate(hoja.columnas, start=1):
        ws.column_dimensions[get_column_letter(i)].width = max(
            _ANCHO_MIN, min(_ANCHO_MAX, len(col.clave) + 2))
    ws.freeze_panes = "B2"
    if hoja.filas:
        ws.auto_filter.ref = ws.dimensions


def _seccion(ws, fila: int, titulo: str) -> int:
    ws.cell(row=fila, column=1, value=titulo).font = _NEGRITA
    return fila + 1


def _resumen(wb: Workbook, meta: dict, lectura: dict, advertencias: list[str],
             hechos: list[Hecho]) -> None:
    ws = wb.active
    ws.title = "Resumen"
    ws["A1"], ws["A1"].font = "Informe AgroVoltaic · San Carlos", _TITULO
    ws["A2"] = f"Periodo: {meta['desde']} a {meta['hasta']} (ambos incluidos)"
    ws["A3"] = (f"Generado: {meta['generado']} · último dato eléctrico de la base: "
                f"{meta['ultimo_dato'] or 'sin dato'}")
    if meta.get("foco"):
        ws["A4"] = f"Foco pedido: {meta['foco']}"

    fila = _seccion(ws, 6, "Lectura")
    if lectura["parrafos"]:
        _cabecera(ws, fila, ["tipo", "texto", "hechos_citados"])
        for p in lectura["parrafos"]:
            fila += 1
            ws.cell(row=fila, column=1,
                    value="Hipótesis" if p["tipo"] == HIPOTESIS else "Hecho")
            ws.cell(row=fila, column=2, value=p["texto"]).alignment = _AJUSTE
            ws.cell(row=fila, column=3, value=", ".join(p["citas"]))
    else:
        ws.cell(row=fila, column=2,
                value=f"Sin lectura: {lectura['motivo']}").alignment = _AJUSTE

    fila = _seccion(ws, fila + 2, "Advertencias")
    for a in advertencias:
        ws.cell(row=fila, column=2, value=a).alignment = _AJUSTE
        fila += 1

    fila = _seccion(ws, fila + 1, "Hechos")
    _cabecera(ws, fila, ["id", "indicador", "valor", "origen"])
    for h in hechos:
        fila += 1
        for i, v in enumerate((h.id, h.indicador, texto(h), h.origen), start=1):
            ws.cell(row=fila, column=i, value=v)
    for letra, ancho in (("A", 14), ("B", _ANCHO_TEXTO), ("C", 24), ("D", 44)):
        ws.column_dimensions[letra].width = ancho


def _metodo(wb: Workbook, hojas: list[Hoja], parametros: list[tuple[str, str]],
            traza: list[tuple[str, str]]) -> None:
    ws = wb.create_sheet("Método")
    fila = _seccion(ws, 1, "Parámetros y definiciones")
    for clave, valor in parametros:
        ws.cell(row=fila, column=1, value=clave)
        ws.cell(row=fila, column=2, value=valor).alignment = _AJUSTE
        fila += 1
    fila = _seccion(ws, fila + 1, "Trazabilidad")
    for clave, valor in traza:
        ws.cell(row=fila, column=1, value=clave)
        ws.cell(row=fila, column=2, value=valor).alignment = _AJUSTE
        fila += 1
    fila = _seccion(ws, fila + 1, "Notas por hoja")
    for h in hojas:
        ws.cell(row=fila, column=1, value=h.nombre)
        ws.cell(row=fila, column=2, value=f"{h.titulo}. {h.nota}").alignment = _AJUSTE
        fila += 1
    fila = _seccion(ws, fila + 1, "Diccionario de columnas")
    _cabecera(ws, fila, ["hoja", "definicion", "columna", "etiqueta", "unidad"])
    for h in hojas:
        for c in h.columnas:
            fila += 1
            for i, v in enumerate((h.nombre, c.descripcion, c.clave, c.etiqueta,
                                   c.unidad), start=1):
                ws.cell(row=fila, column=i, value=v).alignment = _AJUSTE
    for letra, ancho in (("A", 30), ("B", _ANCHO_TEXTO), ("C", 36), ("D", 34), ("E", 10)):
        ws.column_dimensions[letra].width = ancho


def _columna(hoja: Hoja, clave: str) -> int:
    return [c.clave for c in hoja.columnas].index(clave) + 1


def _grafico(wb: Workbook, clase, hoja: Hoja, claves: list[str], titulo: str,
             eje_y: str, hasta_fila: int):
    """Un grafico nativo sobre columnas de una hoja de datos (editable en Excel)."""
    ws = wb[hoja.nombre]
    g = clase()
    g.title, g.height, g.width = titulo, _ALTO_GRAFICO, _ANCHO_GRAFICO
    g.y_axis.title = eje_y
    for clave in claves:
        col = _columna(hoja, clave)
        g.add_data(Reference(ws, min_col=col, min_row=1, max_row=hasta_fila),
                   titles_from_data=True)
    g.set_categories(Reference(ws, min_col=1, min_row=2, max_row=hasta_fila))
    return g


def _graficos(wb: Workbook, diario: Hoja, mensual: Hoja) -> None:
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
        ws.add_chart(g, f"A{1 + n * _FILAS_POR_GRAFICO}")


def escribir(meta: dict, lectura: dict, advertencias: list[str], hechos: list[Hecho],
             hojas: list[Hoja], parametros: list[tuple[str, str]],
             traza: list[tuple[str, str]]) -> bytes:
    """El .xlsx completo, en memoria. `hojas` va en el orden en que se leen."""
    wb = Workbook()
    _resumen(wb, meta, lectura, advertencias, hechos)
    for hoja in hojas:
        _hoja_de_datos(wb, hoja)
    por_nombre = {h.nombre: h for h in hojas}
    _graficos(wb, por_nombre["Diario"], por_nombre["Mensual"])
    _metodo(wb, hojas, parametros, traza)
    salida = io.BytesIO()
    wb.save(salida)
    return salida.getvalue()
