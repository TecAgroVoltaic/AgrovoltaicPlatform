"""Familia 4: anomalias estadisticas. ¿El numero es posible pero raro?

Las cuatro pruebas del documento: saltos entre mediciones, flatline de 30
consecutivas, outliers por IQR y ruido excesivo. Aca no se decide si un dato es
invalido (eso es la familia 2), se decide si merece que alguien lo mire.

Las DOS ambigüedades del documento estan resueltas y anotadas donde se usan:
`salto_excesivo` (¿saltos separados por cuanto tiempo?) y `ruido_excesivo`
(¿"desviacion absoluta maxima" es MAD?). Referencia bibliografica del documento:
https://bsrn.awi.de/

Fachada del paquete: `cambios` (salto y ruido) y `forma` (flatline e IQR).
"""
from __future__ import annotations

from historico.calidad.pruebas.anomalias.cambios import ruido_excesivo, salto_excesivo  # noqa: F401
from historico.calidad.pruebas.anomalias.forma import _rachas_constantes, flatline, outlier_iqr  # noqa: F401
