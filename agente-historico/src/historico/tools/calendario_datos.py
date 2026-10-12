"""Tool `calendario_datos` — que dias grabo cada fuente y donde estan los huecos.

Para "quiero ver toda la data registrada", "donde hay huecos", "que se grabo desde
el año pasado". La interfaz dibuja el calendario tipo GitHub (`_calendario`, contrato
§4.6); el modelo recibe solo el resumen por fuente: dias con datos, primer y ultimo
dia y los huecos mas largos. Nunca la lista de dias.

NO confundir con `rangos_con_datos` (elegir FECHAS para otra consulta) ni con
`completitud_datos` (lo real contra lo esperado a la cadencia, por variable).
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import config
from historico.agent import notificar
from historico.analitica import actividad
from historico.analitica.resumen import hoy_en_sitio

MAX_DIAS = 3 * 366
_NOTA = ("La interfaz dibuja el calendario por fuente: no listes dias. Resumi en dos o "
         "tres frases cuanto cubre cada fuente y los huecos mas largos con sus fechas. Una "
         "fuente con completa=false NO esta completa: deci que cajas fallaron y por que "
         "(motivo), que quedo reportado y que se puede reintentar; nunca presentes sus dias "
         "faltantes como huecos del dato.")

SCHEMA = {
    "name": "calendario_datos",
    "description": (
        "Calendario de actividad por fuente (tipo GitHub): que dias grabo cada fuente "
        "(inversor, radiacion, store ambiental, AgroDash San Carlos, AgroDash Cartago) y "
        "sus huecos mas largos. Usala cuando pidan ver lo registrado en un periodo largo, "
        "donde hay huecos o que dias reporto cada fuente."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "Primer dia 'aaaa-mm-dd'. Omitir = inicio del historico."},
            "hasta": {"type": "string", "description": "Dia siguiente al ultimo, EXCLUSIVO. Omitir = hasta hoy."},
            "fuentes": {"type": "array", "items": {"type": "string", "enum": list(actividad.CLAVES)},
                        "description": "Filas a incluir. Omitir = todas."},
        },
        "additionalProperties": False,
    },
}


def _rango(desde: str | None, hasta: str | None) -> tuple[date, date]:
    try:
        ini = date.fromisoformat(desde[:10]) if desde else date.fromisoformat(config.DATA_DESDE)
        fin = date.fromisoformat(hasta[:10]) - timedelta(days=1) if hasta else hoy_en_sitio()
    except ValueError as exc:
        raise ValueError(f"fecha invalida, se espera 'aaaa-mm-dd': {exc}") from None
    if fin < ini:
        raise ValueError("`hasta` tiene que ser posterior a `desde`.")
    if (fin - ini).days > MAX_DIAS:
        raise ValueError(f"El rango supera {MAX_DIAS} dias; acortalo.")
    return ini, fin


def _reportar(spec: dict) -> bool:
    """Reporta las filas incompletas. True si hubo algo que reportar y quedo reportado."""
    incompletas = [f for f in spec["filas"] if not f["completa"]]
    if not incompletas:
        return False
    detalle = "; ".join(f"{f['etiqueta']}: {len(f['fallas'])} cajas ({f['fallas'][0]['motivo']})"
                        for f in incompletas)
    return notificar.reportar({"tipo": "fuente_no_disponible", "origen": "agrodash",
                               "herramienta": SCHEMA["name"],
                               "detalle": f"Calendario incompleto. {detalle}"[:400]})


def run(desde: str | None = None, hasta: str | None = None, fuentes: list[str] | None = None) -> dict:
    ini, fin = _rango(desde, hasta)
    claves = tuple(c for c in actividad.CLAVES if not fuentes or c in fuentes)
    spec = actividad.calcular(ini, fin, claves)
    total = (fin - ini).days + 1
    resumen = [{"fuente": f["etiqueta"], "completa": f["completa"], "fallas": f["fallas"][:5],
                "dias_con_datos": f["n_dias"], "dias_del_rango": total,
                "primer_dia": f["dias"][0][0] if f["dias"] else None,
                "ultimo_dia": f["dias"][-1][0] if f["dias"] else None,
                "huecos_mas_largos": f["huecos"]} for f in spec["filas"]]
    return {"rango": {"desde": ini.isoformat(), "hasta_inclusivo": fin.isoformat()},
            "fuentes": resumen, "fallas_reportadas": _reportar(spec),
            "_calendario": spec, "nota": _NOTA}
