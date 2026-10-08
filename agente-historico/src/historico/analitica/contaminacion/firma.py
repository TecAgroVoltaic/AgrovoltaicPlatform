"""La firma como DATOS (clausulas y columnas intocables) y su referencia ejecutable."""
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
