"""Grafico de CRESTAS (ridgeline): densidades apiladas por grupo. Fig. 7 del documento.

Compara como se DISTRIBUYE una misma magnitud entre varios grupos (PV1 inclinado
contra PV2 vertical, un piranometro contra el otro) apilando la densidad de cada
uno, coloreandola por probabilidad de cola y marcando un umbral. Responde algo que
ni la media ni el maximo contestan: si dos sensores que miden lo mismo tienen la
misma forma, y cuanta masa se le va a cada uno mas alla del umbral.

AMBIGUEDAD DEL DOCUMENTO, decidida y anotada para consultarla con el autor: la
Fig. 7 se describe como "regresion Ridge" y enlaza a la regularizacion de Tikhonov,
pero la figura es inequivocamente un grafico de CRESTAS de densidades por sensor
coloreadas por probabilidad de cola, y el codigo de referencia se llama
`temp_tail_ridge_plot.py`. Se implementa LO QUE MUESTRA LA FIGURA. No hay aqui
ninguna regresion regularizada: si lo que se queria era Tikhonov, esto no lo cubre
y hay que pedirlo aparte.

LIMITE CONOCIDO: los cinco canales de humedad de suelo (el otro ejemplo natural de
esta figura) NO se pueden pedir todavia. Viven en `lecturas_ambientales_sc`, que no
esta en `catalogo.py`, y la regla del proyecto es que ninguna columna llegue al SQL
sin pasar por el catalogo. En cuanto tengan entrada, esta funcion los grafica sin
tocar una linea. Ojo al agregarlos: esa tabla SI guarda UTC de verdad (viene de
AgroDash), al reves que las tablas PV, asi que su ventana necesita conversion.

Fachada del paquete: la decision vive en `densidad` (pura) y la consulta en `calculo`.
"""
from __future__ import annotations

from historico import db  # noqa: F401 — punto de sustitucion de las pruebas
from historico.analitica.crestas.calculo import _SQL_MUESTRAS, _enriquecer, _muestras, densidades  # noqa: F401
from historico.analitica.crestas.densidad import (  # noqa: F401
    COLAS, DECIMALES, INFERIOR, MARGEN_REJILLA, MINIMO_MUESTRAS, MUESTRAS_INSUFICIENTES,
    MUESTRAS_MAXIMAS, PUNTOS_REJILLA, SUPERIOR, UNIDADES_MEZCLADAS, VARIANZA_NULA, _cola,
    _cuartiles, _grupo, _rejilla, reducir,
)
