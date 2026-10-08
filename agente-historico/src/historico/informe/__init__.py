"""El informe de un periodo, en Excel: tablas calculadas y una lectura redactada.

  datos.py        las consultas (las mismas funciones que usan los endpoints).
  secciones/      las hojas, armadas desde las filas. Puro.
  composicion.py  hojas, hechos y advertencias del periodo. Puro.
  hechos.py       los numeros que la lectura puede citar. Puro.
  redaccion.py    el modelo redacta sobre los hechos.
  verificar.py    ninguna cifra del texto puede faltar en los hechos. Puro.
  metodo.py       los textos fijos de la hoja Método.
  libro.py        el .xlsx (estilos, hojas de texto y graficos en libro_*.py).
  flujo.py        el orden en que se llama todo lo anterior.

El modelo NO calcula ni copia numeros: escribe marcas y el verificador las resuelve.
"""
from historico.informe.flujo import Informe, generar, preparar

__all__ = ["Informe", "generar", "preparar"]
