"""La firma traducida a SQL: predicado, CTE de filas sucias, anti-join y anulacion."""
from __future__ import annotations

from historico.analitica.contaminacion.firma import CLAUSULAS, TABLA_CRUDA


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
