"""`LEEME.txt` del zip: que hay en cada archivo y, por columna, de donde sale."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from historico import config
from historico.fuentes.catalogo import METADATOS
from historico.plan.modelo import ANCHO, COLUMNAS_LARGO, Plan

_PASO = {0: "crudo (cada lectura, sin agregar)", 60: "1 minuto", 300: "5 minutos",
         900: "15 minutos", 3600: "1 hora", 86400: "1 día"}
_FORMATOS = {
    "csv": "coma, UTF-8, encabezado en la 1.ª línea, celda vacía = sin dato",
    "dat": "tabulador, encabezado en la 1.ª línea, NaN = sin dato, más fecha_hora_unix "
           "(segundos Unix)",
    "mat": "una variable MATLAB por columna (Nx1), más fecha_hora_unix, fecha_hora_datenum "
           "y el struct meta",
}


def _rango(v, plan: Plan) -> str:
    desde = max(filter(None, (v.desde, plan.desde.isoformat())))
    hasta = min(filter(None, (v.hasta, plan.hasta.isoformat())))
    return f"{desde} a {hasta}"


def leeme(plan: Plan) -> str:
    lineas = [
        "Exportación AgroVoltaic",
        f"Generado: {datetime.now(ZoneInfo(config.TZ)).replace(tzinfo=None).isoformat(timespec='seconds')} "
        "(hora local de Costa Rica)",
        f"Rango pedido: {plan.desde} a {plan.hasta} (ambos días incluidos)",
        f"Intervalo: {_PASO[plan.paso_s]}",
        f"Horas: hora local de Costa Rica ({config.TZ}, UTC-6), sin sufijo de zona. "
        "Con intervalo, fecha_hora es el INICIO del intervalo.",
        "Celdas sin dato: vacías (csv) o NaN (dat/mat). Nunca se rellenan ni se interpolan.",
        "AgroDash: el valor del sitio es el promedio de sus cajas (min/max: el mínimo o "
        "máximo de las cajas); en formato largo cada caja sale aparte.",
        "",
    ]
    for a in plan.archivos:
        lineas.append(f"== {a.nombre_completo} ==")
        lineas.append(f"Formato: {a.formato} ({_FORMATOS[a.formato]})")
        if a.forma == ANCHO:
            lineas.append("Forma: ancho (fecha_hora y una columna por variable, en este orden)")
        else:
            lineas.append(f"Forma: largo (columnas: {', '.join(COLUMNAS_LARGO)})")
        for c in a.columnas:
            v = c.variable
            nombre = c.nombre if a.forma == ANCHO else c.etiqueta_larga
            lineas += [
                f"- {nombre}",
                f"    fuente: {METADATOS[v.fuente]['nombre']} ({v.fuente})",
                f"    variable: {v.etiqueta} ({v.id})",
                f"    unidad: {v.unidad or 'sin unidad declarada'}",
                f"    agregación: {c.agregacion if plan.paso_s else 'ninguna (crudo)'}",
                f"    paso: {_PASO[plan.paso_s]}",
                f"    rango con dato posible: {_rango(v, plan)}",
            ]
            if v.nota:
                lineas.append(f"    nota: {v.nota}")
        lineas.append("")
    return "\n".join(lineas)
