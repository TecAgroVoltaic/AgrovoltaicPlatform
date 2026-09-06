"""Los ALGORITMOS de evaluacion de datos: el catalogo de metricas del documento.

Un modulo = una familia de metricas = una pregunta del documento de evaluacion.
Cada uno expone funciones PURAS de analisis (reciben `Ventana`, devuelven el sobre
de `resultado.sobre`) y no sabe nada del LLM ni de la UI.

La envoltura como herramienta del agente vive en `historico.tools`, que es una capa
delgada: `SCHEMA` (lo que ve el modelo) + `run()` que llama aca. Esa separacion es
la que pide el encargo: los algoritmos primero, genericos, y el agente despues
componiendolos sin que haya que reescribirlos.

La misma funcion sirve a los tres consumidores (la API de la consola, la tool del
agente y el CLI) para que los tres den EL MISMO numero. Si la consola calculara el
suyo, el experto y el agente podrian discrepar sobre el mismo dato, que es la clase
de desacuerdo que nadie detecta hasta que ya decidio algo con el.
"""
from __future__ import annotations

from historico.analitica import resultado, ventana

__all__ = ["resultado", "ventana"]
