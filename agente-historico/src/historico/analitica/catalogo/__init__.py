"""El REGISTRO de variables analizables. Contrato compartido y allowlist de SQL.

Una variable = una fila de la Tabla 1 del documento de evaluacion = una entrada
aca. Es la unica fuente de verdad de tres cosas que antes vivian desperdigadas:

  1. **Donde vive el dato.** Que relacion y que columna. Y son las relaciones
     CORREGIDAS a proposito: leer de `monitoreo_sc_electrico` en crudo trae
     26.503.162 W de potencia en un arreglo de 1.420 Wp, porque las filas del
     piranometro se mezclaron con las del inversor.
  2. **Que valores son fisicamente posibles.** Los limites que usa la familia de
     pruebas de validez fisica.
  3. **Que se puede consultar.** Ninguna funcion de `analitica` interpola un nombre
     de columna que no haya salido de aca. Sin esto, un parametro del usuario o del
     LLM entraria al SQL: la allowlist no es documentacion, es la defensa.

`fuente_ausente` marca lo que el documento pide y la base NO tiene. Se registra
igual, con su motivo, para que el hueco se vea y quede medido en vez de
desaparecer del catalogo como si nadie lo hubiera pedido.

Fachada del paquete: los tipos viven en `variable`, el criterio de vigilancia en
`vigiladas`, las entradas en `registro_*` y las puertas de consulta en `consultas`.
"""
from __future__ import annotations

from historico.analitica.catalogo.consultas import (  # noqa: F401
    cobertura, disponibles, fuera_de_cobertura, huecos, obtener, para_confianza, sin_vigilancia,
)
from historico.analitica.catalogo.registro import _REGISTRO, CATALOGO, _verificar_registro  # noqa: F401
from historico.analitica.catalogo.registro_electrico import _T_ELECTRICO, _V_ELECTRICO, _e  # noqa: F401
from historico.analitica.catalogo.registro_radiacion import (  # noqa: F401
    _IRRADIANCIA_VALIDA_DESDE, _POA_DESDE, _REFLEJADA_DESDE, _SP722_DESDE, _SP722_HASTA,
    _T_CLEARSKY, _T_POA, _T_RADIACION, _V_RADIACION, _r,
)
from historico.analitica.catalogo.variable import (  # noqa: F401
    AMBIENTAL, ELECTRICO, INCLINADO, RADIACION, TERMICO, VERTICAL, Variable, VariableDesconocida,
)
from historico.analitica.catalogo.vigiladas import _VIGILADAS  # noqa: F401
