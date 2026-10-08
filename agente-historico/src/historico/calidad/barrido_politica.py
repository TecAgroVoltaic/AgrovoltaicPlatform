"""La POLITICA del barrido: de la estadistica de un dia a sus hallazgos.

Determinista y sin LLM. Los umbrales salen de `config` (politica discutible con el
equipo, no fisica). Cada hallazgo es la tupla que inserta `barrido_sql._UPSERT`.
"""
from __future__ import annotations

import json

from historico import config

def _hallazgos_del_dia(fuente: str, dia: dict, cols: dict, cadencia_previa) -> list[tuple]:
    """Traduce la estadistica de un dia a hallazgos. Aca vive la POLITICA."""
    out: list[tuple] = []
    fecha = dia["fecha"]

    def add(variable, tipo, severidad, n, detalle):
        out.append((fecha, fuente, variable, tipo, severidad, n, json.dumps(detalle)))

    filas, distintos = dia["filas"], dia["ts_distintos"]

    # ── Duplicados ────────────────────────────────────────────────────────────
    if filas > distintos:
        add("*", "duplicado_timestamp", "grave", filas - distintos,
            {"filas": filas, "timestamps_distintos": distintos})

    # ── Dia demasiado corto para juzgarlo ─────────────────────────────────────
    if filas < config.MIN_MUESTRAS_DIA:
        add("*", "dia_incompleto", "grave", filas,
            {"motivo": "muy pocas muestras", "filas": filas,
             "minimo": config.MIN_MUESTRAS_DIA})
        return out                      # sin cadencia fiable no tiene sentido seguir

    # ── Cobertura: ¿grabo todas las horas de sol? ─────────────────────────────
    horas_sol, horas_cub = dia.get("horas_sol"), dia.get("horas_cubiertas")
    if horas_sol and horas_cub is not None:
        cobertura = horas_cub / horas_sol
        if cobertura < config.COBERTURA_MINIMA:
            add("*", "dia_incompleto", "aviso" if cobertura > 0.5 else "grave", filas,
                {"motivo": "cobertura solar baja", "cobertura": round(cobertura, 3),
                 "horas_cubiertas": round(horas_cub, 2), "horas_sol": round(horas_sol, 2),
                 "primera": dia["primera"], "ultima": dia["ultima"]})

    # ── Densidad: ¿faltan muestras DENTRO de lo que grabo? ────────────────────
    cadencia = dia.get("cadencia")
    if cadencia and horas_cub:
        esperadas = (horas_cub * 3600.0) / cadencia + 1
        densidad = filas / esperadas
        if densidad < config.DENSIDAD_MINIMA:
            add("*", "hueco", "aviso", int(round(esperadas - filas)),
                {"motivo": "faltan muestras dentro de la ventana grabada",
                 "densidad": round(densidad, 3), "presentes": filas,
                 "esperadas": int(round(esperadas)), "cadencia_seg": cadencia,
                 "huecos_grandes": dia["n_huecos"],
                 "hueco_max_seg": int(dia["hueco_max"] or 0)})

    # ── Cambio de cadencia respecto al dia anterior ───────────────────────────
    if cadencia and cadencia_previa and cadencia != cadencia_previa:
        add("*", "cambio_de_cadencia", "info", None,
            {"cadencia_seg": cadencia, "cadencia_previa_seg": cadencia_previa})

    _hallazgos_de_columnas(fuente, cols, filas, add)
    return out


def _hallazgos_de_columnas(fuente: str, cols: dict, filas: int, add) -> None:
    """Validez columna por columna: ausencia, nulos, rango, saturacion, plano, offset."""
    for col in config.RANGOS[fuente]:
        n = cols.get(f"{col}__n") or 0
        nulos = cols.get(f"{col}__nulos") or 0
        fuera = cols.get(f"{col}__rango") or 0
        sd = cols.get(f"{col}__sd")
        lo, hi = config.RANGOS[fuente][col]

        # Todos los valores del dia en NULL no es "faltan datos": es que la columna
        # no vino en el CSV de ese dia. Es el problema de los 13 esquemas, y merece
        # su propio nombre porque se arregla en otro lado (en el mapeo del ETL).
        if nulos and nulos >= filas:
            add(col, "columna_ausente", "grave", nulos,
                {"filas": filas,
                 "nota": "la columna no vino en la fuente ese dia (variacion de esquema)"})
        elif nulos:
            add(col, "nulos", "info", nulos, {"nulos": nulos, "filas": filas})

        if fuera:
            add(col, "fuera_de_rango", "grave", fuera,
                {"fuera": fuera, "de": filas, "rango": [lo, hi]})

        sat = cols.get(f"{col}__sat") or 0
        if sat:
            add(col, "saturado_85", "grave", sat,
                {"lecturas_en_85": sat, "de": filas,
                 "nota": "valor tipico de DS18B20 desconectado"})

        # Una serie sin variacion puede ser TRES cosas distintas, y llamarlas a
        # todas "sensor plano" fue el primer falso positivo de este detector:
        #   * clavada en 85      -> el DS18B20 desconectado, ya reportado arriba
        #   * clavada en 0       -> el inversor no genero en todo el dia; es un
        #                           hecho operativo real, no un sensor roto
        #   * clavada en otro valor -> ahora si, sensor trabado
        if n >= config.MIN_MUESTRAS_DIA and sd is not None and sd == 0:
            valor = cols.get(f"{col}__min")
            if sat and valor == config.VALOR_SATURACION_DS18B20:
                pass                       # ya lo dice `saturado_85`, mejor y con nombre
            elif valor == 0:
                add(col, "constante_en_cero", "aviso", n,
                    {"lecturas": n,
                     "nota": "sin variacion en todo el dia; en las variables "
                             "electricas significa que el inversor no genero"})
            else:
                add(col, "sensor_plano", "grave", n,
                    {"lecturas": n, "valor_constante": valor})

        off = cols.get(f"{col}__offset") or 0
        if off:
            add(col, "offset_nocturno", "info", off,
                {"lecturas_en_el_offset": off, "de": filas,
                 "valor": config.OFFSET_NOCTURNO,
                 "nota": "piranometro sin calibrar; la capa de correccion lo lleva a 0"})
