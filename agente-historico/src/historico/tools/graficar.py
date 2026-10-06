"""Tool `graficar` — un grafico de datos REALES para mostrarselo al usuario.

Devuelve un `ChartSpec` (contrato §1, `docs/referencia/contratos-asistente-alertas.md`)
en `_grafico`: el sobre con los datos de UNA de las seis primitivas del frontend,
que lo pinta sin transformar. Cada tipo reusa el MISMO algoritmo de `analitica` que
sirve al endpoint equivalente; aca solo se elige cual y se adapta su salida
(`_chartspec`). Cero invencion: el grafico es la salida de un algoritmo.

El LLM no recibe los arreglos: el lazo del chat quita toda clave que empiece con
`_` y le pasa solo `resumen` y `nota` (n, min, max, media por serie, periodo).
"""
from __future__ import annotations

from historico.analitica import carpeta, catalogo, correlacion, crestas, distribucion, series
from historico.analitica.ventana import Ventana
from historico.tools import _chartspec as cs
from historico.tools import _graficos_barras, opciones
from historico.tools._ventana_grafico import POR, ajustar_al_tope, crear, subtitulo
from historico.tools.carpeta_dia_hora import hora_pico, perfil_horario

_NOTA = ("Grafico de datos reales: la interfaz lo dibuja. Comenta la tendencia o lo que "
         "llame la atencion; no repitas los numeros.")

SCHEMA = {
    "name": "graficar",
    "description": (
        "Genera un GRAFICO de datos reales para MOSTRARSELO al usuario. Usalo cuando "
        "quiera VER algo, no solo un numero. Tipos: 'serie' = evolucion en el tiempo "
        "(una o varias variables de la MISMA unidad, con tendencia y media movil); "
        "'barras' = una cantidad por periodo (energia_hoy_wh/energia_pv1_wh/energia_pv2_wh "
        "suman el cierre diario en kWh; una irradiancia W/m2 da la irradiacion acumulada "
        "por mes en kWh/m2; el resto, la media por periodo); 'cajas' = distribucion mes "
        "a mes de UNA variable (mediana, cuartiles, atipicos); 'carpeta' = mapa de calor "
        "dia x hora local de UNA variable (forma del dia a lo largo de semanas); "
        "'dispersion' = UNA variable (variables[0], eje Y) contra `variable_x` con su "
        "recta y R2; 'crestas' = densidades de varias variables de la misma unidad "
        "(comparar sensores o arreglos). Las variables son claves del catalogo. Fechas "
        "en hora local de Costa Rica, `hasta` exclusivo."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "tipo": {"type": "string", "enum": list(cs.TIPOS),
                     "description": "Que primitiva dibujar."},
            "variables": opciones.variables(
                "Claves del catalogo. En 'dispersion' la primera es el eje Y."),
            **opciones.ventana(con_granularidad=True),
            "variable_x": opciones.variable("Solo 'dispersion': la variable del eje X."),
        },
        "required": ["tipo", "variables"],
        "additionalProperties": False,
    },
}


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


_GRAFICADORES = {cs.SERIE: _serie, cs.BARRAS: _barras, cs.CAJAS: _cajas,
                 cs.CARPETA: _carpeta, cs.DISPERSION: _dispersion, cs.CRESTAS: _crestas}
_CON_GRANULARIDAD = (cs.SERIE, cs.BARRAS)


def _validar(tipo: str, claves: list[str], granularidad: str | None,
             variable_x: str | None) -> None:
    if tipo not in _GRAFICADORES:
        raise ValueError(f"tipo de grafico desconocido: {tipo!r} ({', '.join(cs.TIPOS)})")
    if not claves:
        raise ValueError("hace falta al menos una variable para graficar")
    if granularidad and tipo not in _CON_GRANULARIDAD:
        raise ValueError(f"'granularidad' solo aplica a {', '.join(_CON_GRANULARIDAD)}")
    if (tipo == cs.DISPERSION) != (variable_x is not None):
        raise ValueError("'variable_x' es obligatoria en 'dispersion' y solo vale ahi")


def run(tipo: str, variables: str | list[str], desde: str | None = None,
        hasta: str | None = None, granularidad: str | None = None,
        variable_x: str | None = None) -> dict:
    claves = [variables] if isinstance(variables, str) else list(variables or [])
    _validar(tipo, claves, granularidad, variable_x)
    v = crear(desde, hasta, granularidad)
    grafico, resumen = _GRAFICADORES[tipo](v, claves, granularidad, variable_x)
    return {
        "resumen": {"tipo": tipo, "titulo": grafico["titulo"],
                    "periodo": {"desde": v.desde.isoformat(), "hasta": v.hasta.isoformat()},
                    "unidad": grafico["unidad"], **resumen},
        "_grafico": grafico,
        "nota": _NOTA,
    }
