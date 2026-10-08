"""Dispersion de DOS variables del catalogo con ajuste OLS. Fig. 8 del documento.

El caso de uso central es irradiancia contra potencia, pero la funcion es generica
para cualquier par del catalogo: quien elige el par es el experto humano al que
acompaña el agente, no este modulo.

DISCREPANCIA DEL DOCUMENTO, anotada para consultarla con el autor: el pie de la
Fig. 8 dice "potencia vs irradiacion" y la figura graficada muestra PAR contra GHI.
Se implementa lo que dice el PIE, que es lo que el proyecto necesita (cuanta
potencia entrega cada arreglo por unidad de irradiancia). Como la funcion es
generica, el otro par tambien se puede pedir el dia que haya PAR ingestado.

Los pares se forman por TIMESTAMP EXACTO, y por eso se reporta `pares` junto a las
lecturas de cada lado: lo electrico va a 5 min y la radiacion a 15 s, asi que los
timestamps que coinciden son MUCHOS MENOS que las filas de cualquiera de las dos
tablas. Sin ese numero a la vista, un R2 calculado sobre 300 coincidencias de
94.868 lecturas parece un resultado sobre todo el periodo.

El ajuste se calcula sobre TODOS los pares; lo que se recorta es el dibujo. Un
`LIMIT` en la consulta sesgaria la recta (se quedaria con un tramo del periodo),
mientras que adelgazar los puntos DESPUES solo le quita densidad al grafico.


El armado del bloque de confianza, que `crestas`, `comparativa` y otros reusan,
vive en `confianza`; la recta en `ajuste` y la consulta en `nube`. Este
`__init__` es la fachada: `confianza_de` se sustituye aca y `nube` la busca aca.
"""
from __future__ import annotations

from historico import db  # noqa: F401 — punto de sustitucion de las pruebas
from historico.analitica.correlacion.ajuste import (  # noqa: F401
    DECIMALES, DECIMALES_R2, MINIMO_PARES, PARES_INSUFICIENTES, TECHO_PUNTOS, X_CONSTANTE,
    _sin_recta, ajustar, reducir,
)
from historico.analitica.correlacion.confianza import advertir_sin_vigilancia, confianza_de  # noqa: F401
from historico.analitica.correlacion.nube import (  # noqa: F401
    _descriptor, _ecuacion, _sql_lecturas, _sql_pares, _vacio, dispersion,
)
from historico.calidad import contexto  # noqa: F401 — punto de sustitucion de las pruebas
