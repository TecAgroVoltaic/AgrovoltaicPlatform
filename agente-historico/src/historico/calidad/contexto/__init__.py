"""Cuanto se puede confiar en un periodo. El pegamento entre calidad y analisis.

Este modulo existe por UN problema concreto. `energia_por_arreglo` responde
"PV1 genero 47.300 Wh en enero" y el numero es correcto, pero 15 de esos 31 dias
no tienen datos utilizables, asi que la respuesta engaña. El agente no tiene forma
de saberlo salvo que se lo digan.

La solucion no es pedirselo al prompt. Es que **el dato de calidad viaje dentro
de la misma respuesta**: toda herramienta que agregue sobre un periodo incrusta
`confianza(desde, hasta)` en su payload. El modelo no puede reportar el numero sin
ver su fiabilidad, porque vienen juntos.

Es la misma regla de diseño que usan los MODOS del Predictivo, dicha al reves:
alla la garantia es que la herramienta que revela la respuesta NO ESTA en la lista;
aca es que el dato que relativiza el numero SI ESTA en el payload. En los dos casos
la garantia es estructural y no depende de que el modelo obedezca.

Ademas es la fuente UNICA del veredicto de un dia: lo usan la herramienta
`calidad_periodo`, el bloque `confianza` y la vista de la consola. Si cada uno lo
calculara por su cuenta podrian discrepar sobre si un dia sirve, y eso no se nota
hasta que alguien ya decidio algo con el.

## DOS ejes, no uno: el dato y el equipo

El veredicto responde "¿me puedo fiar de este numero?". Hay una segunda pregunta
que se le parece y no es la misma: "¿el sistema estaba funcionando?". Un dia con
el inversor caido a mediodia tiene dato BUENO sobre un equipo MALO, y son 41 de
202 dias evaluables (20,3 %). Mezclarlas hunde la confianza de meses cuya energia
es exacta y esconde la averia detras de una advertencia de calidad. Por eso la
disponibilidad viaja por un canal propio (`disponibilidad` en `confianza()`,
`lecturas_sin_acoplar` y `parada_bajo_sol` en `dias()`) y no toca el veredicto.

Fachada del paquete: `criterios` (que es material y que es del equipo), `dias`
(veredicto por dia), `confianza` (el bloque y su cache), `reduccion` (la decision
pura) y `disponibilidad` (el eje del equipo).
"""
from __future__ import annotations

from historico.calidad.contexto.confianza import _CACHE, _SQL_CONFIANZA, _consultar, confianza  # noqa: F401
from historico.calidad.contexto.criterios import (  # noqa: F401
    FRACCION_MATERIAL, TIPOS_DE_DISPONIBILIDAD, TIPOS_QUE_INVALIDAN,
)
from historico.calidad.contexto.dias import _ORDEN, _SQL_DIAS, _veredicto, dias  # noqa: F401
from historico.calidad.contexto.disponibilidad import _bloque_disponibilidad, _parada_por_dia  # noqa: F401
from historico.calidad.contexto.reduccion import reducir  # noqa: F401
