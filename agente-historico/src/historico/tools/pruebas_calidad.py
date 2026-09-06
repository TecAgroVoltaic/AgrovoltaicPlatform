"""Tool `pruebas_calidad` — las cuatro familias de pruebas del documento, corridas ahora.

Delgada sobre `calidad.corrida.evaluar` (que es quien trae la serie y arma el
`Contexto`). Lo que se recorta es la lista de hallazgos: una variable con un año
de datos puede dejar cientos de filas, todas con su detalle JSON, y el modelo no
las va a enumerar. Se le manda el conteo por tipo, que es lo que se narra. El
detalle viaja por `GET /calidad/pruebas`.

LO QUE NO SE RECORTA, y es el punto de esta tool: las pruebas que NO corrieron.
Una prueba ausente del informe se lee como una prueba que paso, y cuatro de las
nueve de validez fisica del documento (humedad relativa, temperatura ambiente,
viento, precipitacion) no tienen fuente en ninguna tabla. Si se omitieran, el
modelo diria "validez fisica limpia" sobre pruebas que nunca se ejecutaron. Por
eso van `sin_correr` (agrupadas por estado, con su motivo) y
`sin_vigilancia_previa` dentro del resumen, que dice para que variables esta es la
PRIMERA revision y no una confirmacion.
"""
from __future__ import annotations

from historico.analitica import ventana
from historico.calidad import corrida
from historico.calidad.pruebas.contrato import EVALUADA, NO_APLICA, SIN_DATOS, SIN_FUENTE
from historico.tools import opciones

ESTADOS_SIN_CORRER = (SIN_FUENTE, SIN_DATOS, NO_APLICA)

SCHEMA = {
    "name": "pruebas_calidad",
    "description": (
        "Corre AHORA las pruebas de calidad del documento sobre una variable: "
        "completitud (nulos, marcas y minutos que faltan), validez fisica (valores "
        "imposibles, irradiancia de noche), consistencia temporal (marcas duplicadas, "
        "intervalos raros) y anomalias estadisticas (saltos, sensor congelado, "
        "outliers, ruido). Usala cuando pregunten si una variable concreta es confiable, "
        "que problemas tiene o si un sensor esta fallando. Dice tambien que pruebas NO "
        "se pudieron correr y por que: eso NUNCA se omite al responder."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": opciones.variable(
                "Clave de la variable a revisar. Las que la base no tiene se pueden "
                "pedir igual: la respuesta dira que la prueba no tiene fuente.",
                con_fuente=False),
            **opciones.ventana(),
        },
        "required": ["variable"],
        "additionalProperties": False,
    },
}


def sin_correr(evaluaciones) -> dict:
    """Las pruebas que no se ejecutaron, agrupadas por estado y con su motivo."""
    grupos: dict[str, list[dict]] = {estado: [] for estado in ESTADOS_SIN_CORRER}
    for evaluacion in evaluaciones:
        if evaluacion.estado == EVALUADA:
            continue
        # `setdefault` y no indexado: si el paquete de pruebas estrena un estado, la
        # tool lo muestra en vez de reventar. Callarlo seria el peor final posible
        # para una lista que existe justamente para que nada quede sin verse.
        grupos.setdefault(evaluacion.estado, []).append(
            {"prueba": evaluacion.prueba, "familia": evaluacion.familia,
             "motivo": evaluacion.motivo})
    return grupos


def por_tipo(hallazgos) -> list[dict]:
    """Cuantos dias y cuantas lecturas toca cada tipo de hallazgo. Uno por prueba."""
    conteo: dict[tuple[str, str], dict] = {}
    for hallazgo in hallazgos:
        clave = (hallazgo.tipo, hallazgo.severidad)
        fila = conteo.setdefault(clave, {"tipo": hallazgo.tipo,
                                         "severidad": hallazgo.severidad,
                                         "dias": 0, "lecturas": 0})
        fila["dias"] += 1
        fila["lecturas"] += hallazgo.n_afectadas or 0
    return sorted(conteo.values(), key=lambda f: f["dias"], reverse=True)


def run(variable: str, desde: str | None = None, hasta: str | None = None) -> dict:
    v = ventana.crear(desde, hasta)
    resultado = corrida.evaluar(v, variable)
    hallazgos = resultado.hallazgos
    return {
        "ventana": v.como_dict(),
        "variable": corrida.descriptor(variable),
        # Un rango en que la variable todavia no existia devuelve miles de nulos, y
        # sin esto se leen como un sensor roto en vez de como un sensor sin instalar.
        "fuera_de_cobertura": corrida.fuera_de_cobertura(v, variable),
        "resumen": resultado.resumen,
        "sin_correr": sin_correr(resultado.evaluaciones),
        "hallazgos": {"total": len(hallazgos), "por_tipo": por_tipo(hallazgos)},
        "nota": corrida.NOTA,
    }
