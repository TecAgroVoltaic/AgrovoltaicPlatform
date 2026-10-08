"""Tool `preparar_informe` — los hechos del periodo y donde bajar el Excel.

Delgada sobre `historico.informe.preparar`. NO redacta ni escribe el libro: eso lo
hace el endpoint `/informe` cuando alguien lo descarga. Aca el modelo recibe la
misma tabla de hechos que veria el redactor del informe, para poder contarle al
usuario que va a encontrar, y la ruta de descarga para ofrecersela.

OJO: a diferencia del resto de las tools, aca `hasta` es INCLUSIVO, igual que en la
vista Descargas. Un informe "de agosto" se pide del 1 al 31.
"""
from __future__ import annotations

from urllib.parse import urlencode

from historico import informe
from historico.informe.tabla import texto

RUTA = "/informe"
MAX_FOCO = 300

SCHEMA = {
    "name": "preparar_informe",
    "description": (
        "Prepara el INFORME EN EXCEL de un periodo y devuelve su ruta de descarga "
        "junto con los hechos que contiene: dias con datos, energia AC y DC, PR de "
        "cada arreglo, dias con la planta parada y calidad del dato. El libro trae "
        "una hoja diaria, una mensual, disponibilidad, calidad, graficos y metodo. "
        "Usala cuando pidan un informe, un reporte, un Excel o 'algo para enviar' "
        "sobre un rango de fechas. `desde` y `hasta` son obligatorios y los DOS dias "
        "entran. Con `foco` se le dice al informe en que tema detenerse."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string",
                      "description": "Primer dia del informe, ISO (aaaa-mm-dd)."},
            "hasta": {"type": "string",
                      "description": "Ultimo dia del informe, ISO. INCLUSIVO."},
            "foco": {"type": "string", "maxLength": MAX_FOCO,
                     "description": ("Tema en el que la lectura debe detenerse, por "
                                     "ejemplo 'disponibilidad del inversor'. Opcional.")},
        },
        "required": ["desde", "hasta"],
        "additionalProperties": False,
    },
}


def ruta_de_descarga(desde: str, hasta: str, foco: str | None = None) -> str:
    consulta = {"desde": desde, "hasta": hasta}
    if foco and foco.strip():
        consulta["foco"] = foco.strip()[:MAX_FOCO]
    return f"{RUTA}?{urlencode(consulta)}"


def run(desde: str, hasta: str, foco: str | None = None) -> dict:
    meta, comp = informe.preparar(desde, hasta)
    return {
        "periodo": {"desde": meta["desde"], "hasta": meta["hasta"],
                    "hasta_inclusivo": True},
        "ultimo_dato_de_la_base": meta["ultimo_dato"],
        "hechos": [{"id": h.id, "indicador": h.indicador, "valor": texto(h)}
                   for h in comp["hechos"]],
        "advertencias": comp["advertencias"],
        "descarga": {"ruta": ruta_de_descarga(meta["desde"], meta["hasta"], foco),
                     "formato": "xlsx"},
        "nota": ("El Excel se arma al descargarlo. Deci que esta listo para bajar y "
                 "resumi dos o tres hechos; no pegues la tabla entera."),
    }
