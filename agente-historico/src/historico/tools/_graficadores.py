"""Los seis graficadores de la tool `graficar`, uno por primitiva del frontend.

Cada uno recibe la ventana y las claves, corre el MISMO algoritmo de `analitica`
que sirve al endpoint equivalente y devuelve `(ChartSpec, resumen para el LLM)`.
Todos comparten la firma `(v, claves, granularidad, variable_x)` para que
`graficar` los despache por tipo sin casos especiales.
"""
from __future__ import annotations

from historico.analitica import carpeta, catalogo, correlacion, crestas, distribucion, series
from historico.analitica.ventana import Ventana
from historico.tools import _chartspec as cs
from historico.tools import _graficos_barras
from historico.tools._ventana_grafico import POR, ajustar_al_tope, subtitulo
from historico.tools.carpeta_dia_hora import hora_pico, perfil_horario


def _variables(claves: list[str]) -> list[catalogo.Variable]:
    """Valida contra el catalogo y exige UNA unidad: un eje no puede medir W y C."""
    variables = [catalogo.obtener(c) for c in claves]
    unidades = sorted({v.unidad for v in variables})
    if len(unidades) > 1:
        raise ValueError(f"unidades_mezcladas: un grafico comparte eje y llegaron "
                         f"{unidades}; pedi un grafico por unidad")
    return variables


def _una(claves: list[str], tipo: str) -> str:
    if len(claves) != 1:
        raise ValueError(f"'{tipo}' grafica UNA variable y llegaron {len(claves)}")
    return claves[0]


def _titulo(variables: list[catalogo.Variable]) -> str:
    return " y ".join(v.etiqueta for v in variables)


def _serie(v: Ventana, claves: list[str], granularidad, variable_x) -> tuple[dict, dict]:
    variables = _variables(claves)
    ajustada = ajustar_al_tope(v)
    payload = series.serie_temporal(ajustada, claves)
    sub = subtitulo(ajustada, f"media {POR[ajustada.granularidad]}", v.granularidad)
    grafico = cs.spec(cs.SERIE, _titulo(variables), variables[0].unidad,
                      cs.serie(payload, variables[0].unidad), sub)
    return grafico, {
        "granularidad": ajustada.granularidad,
        "series": [{"serie": s["clave"], **cs.estadisticas([p["valor"] for p in s["puntos"]]),
                    "pendiente_por_dia": s["tendencia"]["pendiente"]["valor"],
                    "r2": s["tendencia"]["r2"]} for s in payload["series"]],
        "advertencia": payload["confianza"].get("advertencia"),
    }


def _barras(v: Ventana, claves: list[str], granularidad, variable_x) -> tuple[dict, dict]:
    return _graficos_barras.graficar(v, _variables(claves), granularidad)


def _cajas(v: Ventana, claves: list[str], granularidad, variable_x) -> tuple[dict, dict]:
    variable = catalogo.obtener(_una(claves, cs.CAJAS))
    payload = distribucion.cajas_mensuales(v, variable.clave)
    grafico = cs.spec(cs.CAJAS, f"Distribución mensual: {variable.etiqueta}", variable.unidad,
                      cs.cajas(payload), subtitulo(v, "cajas por mes, atípicos por 1,5·IQR"))
    cajas = payload["cajas"]
    return grafico, {
        "medianas": cs.estadisticas([c["mediana"] for c in cajas]),
        "meses_con_dato": sum(1 for c in cajas if c["n"]),
        "atipicos": sum(c["outliers_bajos"] + c["outliers_altos"] for c in cajas),
        "advertencia": payload["confianza"].get("advertencia"),
    }


def _carpeta(v: Ventana, claves: list[str], granularidad, variable_x) -> tuple[dict, dict]:
    variable = catalogo.obtener(_una(claves, cs.CARPETA))
    payload = carpeta.diagrama(v, variable.clave)
    unidad = payload["variable"]["unidad"]
    grafico = cs.spec(cs.CARPETA, f"Día x hora: {variable.etiqueta}", unidad,
                      cs.carpeta(payload), subtitulo(v, "promedio por hora local"))
    perfil = perfil_horario(payload["matriz"], payload["conteo"], payload["horas"])
    pico = hora_pico(perfil)
    return grafico, {
        "celdas": cs.estadisticas([x for fila in payload["matriz"] for x in fila]),
        "celdas_con_dato": payload["celdas_con_dato"],
        "hora_pico": pico["hora"] if pico else None,
        "advertencia": payload["confianza"].get("advertencia"),
    }


def _dispersion(v: Ventana, claves: list[str], granularidad, variable_x) -> tuple[dict, dict]:
    y = catalogo.obtener(_una(claves, cs.DISPERSION))
    x = catalogo.obtener(variable_x)
    payload = correlacion.dispersion(v, x.clave, y.clave)
    ajuste = payload["ajuste"]
    grafico = cs.spec(cs.DISPERSION, f"{y.etiqueta} contra {x.etiqueta}", y.unidad,
                      cs.dispersion(payload), subtitulo(v, "pares por timestamp exacto"))
    return grafico, {
        "pares": payload["pares"], "ecuacion": ajuste["ecuacion"],
        "r2": ajuste["r2"]["valor"], "pendiente": ajuste["pendiente"]["valor"],
        "puntos_dibujados": payload["puntos_mostrados"],
        "advertencia": payload["confianza"].get("advertencia"),
        **({"nota_datos": payload["nota"]} if not payload["pares"] else {}),
    }


def _crestas(v: Ventana, claves: list[str], granularidad, variable_x) -> tuple[dict, dict]:
    variables = _variables(claves)
    payload = crestas.densidades(v, claves)
    grafico = cs.spec(cs.CRESTAS, f"Densidades: {_titulo(variables)}", payload["unidad"],
                      cs.crestas(payload), subtitulo(v, "densidad KDE por variable"))
    return grafico, {
        "grupos": [{"grupo": g["grupo"], "n": g["n"], "motivo": g["motivo"],
                    **({k: g["estadisticos"][k]["valor"] for k in ("media", "mediana")}
                       if g["estadisticos"] else {})}
                   for g in payload["grupos"]],
        "advertencia": payload["confianza"].get("advertencia"),
    }
