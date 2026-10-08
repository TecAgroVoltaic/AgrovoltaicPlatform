"""Vertical contra Inclinado: el eje 1 del documento y el analisis de mas valor.

Las dos configuraciones tienen la MISMA potencia instalada (1.420 Wp por arreglo)
y ven el mismo cielo, asi que toda diferencia entre ellas es geometria: PV1 va
inclinado 20 grados a 150 de azimut y PV2 vertical a 90/50. Este modulo pone las
dos lado a lado sobre una misma ventana: energia por periodo, curva de generacion
horaria, Performance Ratio, relacion energia-irradiancia y donde se separan.

Fachada del paquete: la consulta esta separada de la decision. Todo el criterio vive
en `reduccion.reducir()` y sus ayudantes (`totales`, `horaria`, `estacional`, `pr`),
que se prueban sin base de datos; `calculo.arreglos` es el unico que toca la base.

DOS PRECISIONES QUE NO SE PUEDEN AFLOJAR:

  * La curva horaria usa `extract(hour from timestamp)` SIN convertir zona. Los
    timestamps son hora local de Costa Rica etiquetada `+00`; un `AT TIME ZONE`
    correria el perfil seis horas y pondria el pico de generacion a las seis de la
    tarde. Ver el encabezado de `ventana.py`.
  * **El PR es DIARIO Y MENSUAL, no de 5 minutos, y no se calcula aca.** Sale de
    `analitica.rendimiento`, que es el metodo que fijo Leo Cardinale el 2026-08-30
    (R1): "para el performance_ratio... mas interesante analizarlo en periodos mas
    largos como dia o mes; no cada 5 min". Este modulo llama a esa funcion en vez de
    repetir la cuenta, y por eso no puede dar un numero distinto del de la tool
    `performance_ratio`. Hasta el 2026-08-31 aca vivia un PR propio calculado sobre
    ventanas de 5 min: dos definiciones del mismo indicador conviviendo, que es peor
    que una mala, porque el experto ve dos numeros para lo mismo y no sabe cual creer.

Lo que SI se queda a 5 minutos es el EMPAREJAMIENTO PUNTO A PUNTO entre arreglos
(`emparejamiento_5min`), que el mismo R1 avala explicitamente "cuando vayamos a
hacer algun analisis punto a punto cada 5 min". Ahi no hay ningun PR: hay energia e
insolacion sobre las mismas ventanas y su cociente, que es otra pregunta.

Y una que el documento pide y los datos no sostienen: la ESTACIONALIDAD. Hay 274
dias de un calendario de 569, con huecos de 126 y 71 dias seguidos. Comparar el
"enero" de un año contra un febrero al que le faltan tres semanas no mide
estaciones, mide cobertura. Solo se reportan los meses que llegan al minimo, y
cuando no alcanzan se dice en vez de dibujar una curva anual inventada.
"""
from __future__ import annotations

from historico.analitica.comparativa.calculo import arreglos  # noqa: F401
from historico.analitica.comparativa.constantes import (  # noqa: F401
    CLAVES, CLAVES_POA, COBERTURA_MENSUAL_MINIMA, HORAS_POR_LECTURA, INCLINADO, MESES_MINIMOS,
    P0_WP, VERTICAL, WH_POR_KWH,
)
from historico.analitica.comparativa.consultas import _SQL_CURVA, _SQL_EMPAREJADO, _SQL_ENERGIA  # noqa: F401
from historico.analitica.comparativa.estacional import _dias_del_mes, estacionalidad  # noqa: F401
from historico.analitica.comparativa.horaria import _rangos, separacion_horaria  # noqa: F401
from historico.analitica.comparativa.pr import _emparejado_arreglo, pr_diario  # noqa: F401
from historico.analitica.comparativa.reduccion import reducir  # noqa: F401
from historico.analitica.comparativa.totales import (  # noqa: F401
    _arreglo_total, _suma, _totales, comparar_totales,
)
