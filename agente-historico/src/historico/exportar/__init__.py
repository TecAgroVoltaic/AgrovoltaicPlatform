"""Bajarse el historico a un archivo: que se puede pedir y como se escribe.

El destino de estos archivos es EL EQUIPO DEL PROYECTO, gente que los va a abrir
en MATLAB, en pandas o en Excel sin la base delante y sin el contexto de las
trampas que este dato ya tiene medidas. De ahi salen las dos reglas que gobiernan
el paquete entero:

  1. **El archivo se explica solo.** Las marcas de tiempo, las unidades de energia,
     que es PV1 y que es PV2 y de que relacion salio el dato viajan DENTRO del
     archivo (ver `metadatos`), no en un correo que se pierde.
  2. **Nada se descarta en silencio.** Si la consulta filtra filas, el archivo dice
     cuantas y por que. Un archivo que filtra callado es indistinguible de uno
     donde no habia dato, y ese error ya se cometio cinco veces en este proyecto
     (`docs/memoria/inconsistencias/silencio-leido-como-salud.md`).

Un modulo por responsabilidad, y ninguno sabe que existe FastAPI:

  fallas      los errores tipados del pedido (sin dependencias)
  formatos    los cuatro formatos y que puede llevar cada uno adentro
  tiempo      la marca de tiempo: texto ISO y datenum de MATLAB
  etiquetas   etiqueta, unidad y orden de cada columna exportable
  inventario  el catalogo de lo descargable (`GET /exportar/relaciones`)
  consulta    el SQL seguro: resuelve, cuenta y transmite fila a fila
  metadatos   el bloque que encabeza el archivo, en texto y como struct
  texto       csv, dat y dat_numerico
  matlab      el .mat binario
  servicio    el orquestador que junta todo lo anterior
"""
from __future__ import annotations

from historico.exportar import fallas, formatos

__all__ = ["fallas", "formatos"]
