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
"""
from __future__ import annotations

from collections.abc import Mapping

# La tabla CRUDA, y es a proposito: la vista corregida ya anulo con sus `CASE` los
# valores que la firma busca, asi que evaluada sobre la vista no encontraria nada.
TABLA_CRUDA = "monitoreo_sc_electrico"

# El archivo que retira este filtro cuando se aplique. Se nombra aca para que el
# que lo aplique sepa que tiene que venir a borrar esto.
MIGRACION = "sql/003_electrico_sin_falsos_positivos.sql"

# (columna, operador, umbral). Los limites son los del arreglo de 1.420 Wp: nada
# de esto es alcanzable por un inversor de 2,84 kWp. El techo de temperatura es
# 100 C y no el 80 del catalogo a proposito: aca no se juzga si el dato es valido,
# se decide si la fila es de otro aparato, y 291,1 C lo es sin discusion.
#
# ESCRITAS COMO DATOS Y NO COMO TEXTO: asi se pueden comparar con las del SQL de la
# migracion, que es lo que evita que las tres copias se separen.
CLAUSULAS: tuple[tuple[str, str, float], ...] = (
    ("potencia_pv1_w", ">", 5000.0),
    ("potencia_pv2_w", ">", 5000.0),
    ("voltaje_pv1_v", ">", 600.0),
    ("voltaje_pv2_v", ">", 600.0),
    ("corriente_pv1_a", ">", 20.0),
    ("corriente_pv2_a", ">", 20.0),
    ("potencia_total_wac", ">", 5000.0),
    ("temperatura_inversor_c", ">", 100.0),
    ("potencia_pv1_w", "<", 0.0),
    ("potencia_pv2_w", "<", 0.0),
    ("voltaje_pv1_v", "<", 0.0),
    ("voltaje_pv2_v", "<", 0.0),
)

# Las columnas que la firma NUNCA mira. Es la mitad del criterio: la contaminacion
# se detecta en OTRAS columnas de la fila, no en la que se esta limpiando.
COLUMNAS_INTOCABLES = ("energia_hoy_wh", "energia_total_wh",
                       "energia_pv1_wh", "energia_pv2_wh")


def predicado(alias: str = "", sangria: int = 15) -> str:
    """La firma como predicado SQL, opcionalmente calificada por un alias de tabla."""
    prefijo = f"{alias}." if alias else ""
    union = "\n" + " " * sangria + "OR "
    return union.join(f"{prefijo}{col} {op} {umbral}" for col, op, umbral in CLAUSULAS)


FIRMA = predicado()

# El CTE que las dos consultas anteponen. Consume DOS parametros (desde, hasta) y
# por eso va siempre PRIMERO en el `WITH`: asi sus dos `%s` son los dos primeros.
CTE_SUCIAS = f"""sucias AS (
        SELECT "timestamp"
          FROM {TABLA_CRUDA}
         WHERE "timestamp" >= %s AND "timestamp" < %s
           AND ({FIRMA})
    )"""

# Como se cruza el CTE desde la consulta que limpia. Anti-join, nunca `NOT (firma)`.
JOIN_SUCIAS = 'LEFT JOIN sucias s USING ("timestamp")'


def anular(columna: str, fila: str = "v", sucias: str = "s") -> str:
    """La columna puesta a NULL en las filas con firma. Lo MISMO que hara la vista.

    Se anula la columna y NO se descarta la fila, que es la unica forma de que
    retirar este filtro cuando la migracion se aplique no cambie ni un numero. La
    diferencia no es cosmetica: `sql/003` deja las 36.469 filas en su sitio y solo
    vacia las cuatro columnas de energia, asi que descartar la fila entera se
    llevaria por delante su potencia, su marca y el intervalo que esa marca define.
    En `rendimiento` eso mueve `horas_ele` (el hueco lo absorbe la fila anterior) y
    puede volcar un dia al lado equivocado del criterio de cobertura, por una fila
    cuyo unico problema esta en otra columna.

    Equivale al `CASE WHEN fila_de_piranometro THEN NULL ELSE col END` de la
    migracion: `ELSE NULL` es implicito y la condicion va al reves porque aca la
    marca es "aparece en la lista de sucias".
    """
    return f'CASE WHEN {sucias}."timestamp" IS NULL THEN {fila}.{columna} END AS {columna}'


def es_fila_de_piranometro(fila: Mapping[str, float | None]) -> bool:
    """Si la firma marca esta fila. PURA: referencia ejecutable de lo que hace el SQL.

    Reproduce la LOGICA TERNARIA de Postgres cerrada con `IS TRUE`: una comparacion
    contra NULL da NULL, no falso, y el `OR` ternario solo es verdadero si alguna
    comparacion lo es. Como el CTE cierra con `IS TRUE`, el NULL termina en falso y
    la fila SOBREVIVE. Por eso una columna vacia no marca nunca, y por eso basta con
    buscar una comparacion verdadera.

    Vive en Python porque la regla ES la decision, y una decision que solo se puede
    comprobar con la base de produccion delante no se comprueba.
    """
    for columna, operador, umbral in CLAUSULAS:
        valor = fila.get(columna)
        if valor is None:
            continue
        if (valor > umbral) if operador == ">" else (valor < umbral):
            return True
    return False
