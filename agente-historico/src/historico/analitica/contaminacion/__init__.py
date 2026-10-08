"""La firma de la fila del piranometro colada en la tabla del inversor. UNA sola.

El problema conocido de los 13 esquemas dejo filas del PIRANOMETRO mezcladas en el
CSV del inversor. No son valores fuera de rango de una columna: son lecturas de
otro aparato ocupando el renglon entero, y por eso se detectan por MAGNITUDES
IMPOSIBLES EN OTRAS COLUMNAS de la misma fila, nunca por el valor de la columna que
se quiere limpiar. Un tope sobre la energia recortaria dias record legitimos y
dejaria pasar filas mezcladas de valor pequeño.

Medido el 2026-08-31 sobre `monitoreo_sc_electrico` (36.469 filas): la firma marca
490 filas en 46 dias, entre ellas las dos que cargan energia y que arruinan
cualquier total:

  * `2025-10-07 07:45` -> `potencia_pv1_w` = 26.503.162,8 W, `energia_total_wh` =
    39.328.367,1 (por si sola producia el maximo imposible del contador de vida);
  * `2026-03-09 17:55` -> `corriente_pv2_a` = 121,295 A en un arreglo que nunca
    pasa de 20 A, con 137,25 kWh en `energia_hoy_wh` contra una mediana de 6,65.

## Por que existe este modulo

Porque el mismo criterio estaba escrito DOS VECES y distinto: `rendimiento.py`
descartaba esas filas por una lista de dos timestamps fijos y `energia.py` por una
firma de fila. Las dos atrapaban las mismas dos filas conocidas, pero la lista de
timestamps deja de funcionar en cuanto aparezca una tercera fila sucia y la firma
no. Aca vive la version unica, y los dos modulos la usan.

## ESTA ES LA TERCERA COPIA DEL MISMO CRITERIO, y hay que saberlo

El mismo predicado vive en otros dos sitios, y los tres tienen que decir lo mismo:

  1. `sql/003_electrico_sin_falsos_positivos.sql`, entre los marcadores
     `-- FIRMA:INICIO` y `-- FIRMA:FIN` (la vista corregida de produccion);
  2. `src/agrovoltaic/ddl.py`, constante `_FIRMA_PIRANOMETRO` (el generador del ETL);
  3. este modulo.

No se pueden fundir en uno: el (1) lo ejecuta Postgres, el (2) vive en otro paquete
y el (3) tiene que poder interpolarse en las consultas de `analitica`. Lo que si se
puede es AMARRARLOS: `CLAUSULAS` esta escrita como datos y no como texto para que
`tests/test_analitica_energia.py` parsee el SQL de la migracion (por eso los
marcadores estan puestos) y compare clausula por clausula. Una desincronizacion
falla en la suite en vez de fallar en produccion, que es donde fallaria sola: la
firma de mas se lleva dato bueno y la de menos deja pasar 39 MWh.

## MIGRACION: esto se retira cuando `sql/003` este aplicada

`v_sc_electrico_corregido` HOY deja pasar las cuatro columnas de energia sin ningun
`CASE` (verificado con `pg_get_viewdef`: la vista "corregida" devuelve los mismos
39 MWh que la cruda). `sql/003_electrico_sin_falsos_positivos.sql` la arregla, pero
la base es de solo lectura y la migracion todavia no esta aplicada. Mientras tanto
este filtro es la unica defensa. Cuando la vista limpie la energia, `CTE_SUCIAS` y
su anti-join sobran de las dos consultas y el resultado no cambia.

## CUIDADO CON LA LOGICA TERNARIA DE SQL

El descarte va por ANTI-JOIN y nunca por `NOT (firma)`. `NOT` sobre una firma con
NULLs devuelve NULL, el `WHERE` lo trata como falso y se lleva medio historico por
delante: medido, la base cae de 36.469 a 18.005 filas (274 -> 132 dias) sin un solo
aviso. Con anti-join la condicion es "no aparece en la lista de sucias", que no
tiene tercer estado. Si alguna vez hiciera falta escribirla como predicado, la
forma segura es `(firma) IS NOT TRUE`, jamas `NOT (firma)`.

Fachada del paquete: la firma como datos vive en `firma` y su traduccion a SQL en
`sql`.
"""
from __future__ import annotations

from historico.analitica.contaminacion.firma import (  # noqa: F401
    CLAUSULAS, COLUMNAS_INTOCABLES, MIGRACION, TABLA_CRUDA, es_fila_de_piranometro,
)
from historico.analitica.contaminacion.sql import CTE_SUCIAS, FIRMA, JOIN_SUCIAS, anular, predicado  # noqa: F401
