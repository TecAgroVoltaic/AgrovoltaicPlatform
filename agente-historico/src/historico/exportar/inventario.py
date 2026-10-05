"""El catalogo de lo descargable: que relaciones hay, con que columnas y cuanto dato.

Es lo que la consola dibuja antes de que nadie descargue nada, asi que tiene que
alcanzar para armar el formulario entero sin adivinar: que columnas ofrecer, cuales
marcar de entrada, en que orden ponerlas y que rango de fechas tiene sentido pedir.

`filas`, `desde` y `hasta` salen de una consulta REAL, no de una constante: son el
argumento con que alguien elige un rango, y un numero viejo ahi hace pedir un
periodo vacio y creer que no hubo datos.

Dos consultas y un solo viaje de reloj (`db.en_paralelo`): el conteo por relacion,
que ya resuelve `datos.tablas()` con un UNION ALL, y el catalogo de columnas de las
nueve relaciones de una vez. Pedir las columnas relacion por relacion serian nueve
viajes de 225 ms para armar una pantalla que despues no consulta nada.
"""
from __future__ import annotations

from historico import datos, db
from historico.exportar import etiquetas, formatos, relaciones

# El rango se publica como fecha, no como marca de tiempo: es lo que se pega en un
# `desde`/`hasta`, y `2026-08-31 17:55:00+00` no se puede pegar en ninguno de los dos.
LARGO_FECHA = 10

_SQL_COLUMNAS = """
    SELECT table_name AS relacion, column_name AS nombre
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY(%s)
     ORDER BY table_name, ordinal_position
"""

NOTA = (
    "`hasta` en esta lista es la marca de tiempo MAS RECIENTE con dato, y es "
    "inclusiva. El `hasta` de `/exportar/datos` es EXCLUSIVO: para bajar el ultimo "
    "dia hay que pedir el dia siguiente. `por_defecto: false` marca la contabilidad "
    "del ETL, que sigue disponible pero no es una medicion. `filtro` dice si la "
    "relacion descarta filas y cuales: el archivo siempre informa cuantas quito, y "
    "se puede desactivar con `solo_validas=0`."
)


def _fecha(marca: str | None) -> str | None:
    return marca[:LARGO_FECHA] if marca else None


def _columnas(nombres: list[str], columna_tiempo: str | None) -> list[dict]:
    """Las columnas de una relacion, ordenadas y traducidas, como las vera el archivo.

    El orden sale de `etiquetas.ordenar`, la MISMA funcion que usa la descarga: si
    aca se publicara un orden y el archivo trajera otro, el cliente estaria mostrando
    una cabecera que no corresponde a las columnas que va a recibir.
    """
    salida = []
    for nombre in etiquetas.ordenar(nombres, columna_tiempo):
        etiqueta, unidad = etiquetas.describir(nombre)
        salida.append({"nombre": nombre, "etiqueta": etiqueta, "unidad": unidad,
                       "por_defecto": etiquetas.por_defecto(nombre)})
    return salida


def _filtro(relacion_sql: str) -> dict | None:
    """El filtro de calidad de la relacion, si tiene. Se publica para que se vea."""
    from historico.exportar.consulta import _FILTRO_POR_RELACION, MOTIVO_FILTRO
    predicado = _FILTRO_POR_RELACION.get(relacion_sql, "").replace(" AND ", "", 1)
    if not predicado:
        return None
    return {"predicado": predicado, "aplica_por_defecto": True,
            "motivo": MOTIVO_FILTRO.get(relacion_sql, "")}


def catalogo() -> dict:
    """Todo lo descargable, con su cobertura real y sus columnas ya traducidas."""
    nombres_sql = [rel for rel, _ in datos.RELACIONES.values()]
    cobertura, columnas = db.en_paralelo(
        datos.tablas,
        lambda: db.query(_SQL_COLUMNAS, (nombres_sql,)),
    )
    por_relacion: dict[str, list[str]] = {}
    for fila in columnas:
        por_relacion.setdefault(fila["relacion"], []).append(fila["nombre"])
    salida = []
    for resumen in cobertura["relaciones"]:
        clave, relacion_sql = resumen["clave"], resumen["relacion"]
        que_es = relaciones.describir(clave)
        salida.append({
            "clave": clave,
            "etiqueta": que_es.etiqueta,
            "descripcion": que_es.descripcion,
            "naturaleza": que_es.naturaleza,
            "columna_tiempo": resumen["columna_tiempo"],
            "filas": resumen["filas"],
            "desde": _fecha(resumen["desde"]),
            "hasta": _fecha(resumen["hasta"]),
            "filtro": _filtro(relacion_sql),
            "columnas": _columnas(por_relacion.get(relacion_sql, []),
                                  resumen["columna_tiempo"]),
        })
    return {
        "relaciones": salida,
        "formatos": [{"clave": f.clave, "extension": f.extension,
                      "tipo_mime": f.tipo_mime, "metadatos": f.metadatos,
                      "descripcion": f.descripcion}
                     for f in formatos.FORMATOS.values()],
        "nota": NOTA,
    }
