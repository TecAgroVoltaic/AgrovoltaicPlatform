"""Resolucion de una variable a tabla corregida y lectura pesada por su salto real."""
from __future__ import annotations

from dataclasses import dataclass

from historico.analitica import catalogo

# Techo del peso temporal de una fila, en segundos. De noche el logger para: el
# salto mas grande medido es de 43.800 s, y sin acotar una sola fila del atardecer
# se integraria como doce horas de irradiancia, con lo que un dia solo inventaria
# mas energia que un mes entero.
#
# 900 s son TRES VECES la cadencia nominal mas lenta del historico (los bins de
# 5 min del regimen de 2025-11 en adelante, que con jitter llegan a 330 s). Por
# encima de eso el salto ya no es una muestra sino un hueco de registro, y el tiempo
# que falta no lo midio nadie. Medido sobre la irradiancia real, mover el techo
# entre 600 y 1.800 s cambia el total mensual menos del 1 %: el numero no es fragil,
# lo que importa es que exista.
#
# NO se deriva de `config.FACTOR_HUECO` aunque el factor coincida. Ese umbral es
# politica de QC y se ajusta; que retocarlo moviera en silencio los kWh reportados
# seria un acoplamiento caro de descubrir.
TECHO_SALTO_SEG = 900

_SALTO_ACOTADO = (f'least(coalesce(extract(epoch FROM lead("timestamp") '
                  f'OVER (ORDER BY "timestamp") - "timestamp"), 0), {TECHO_SALTO_SEG})')

# Clave de bucket, la misma en Python y en SQL para que se puedan cruzar.
FORMATO_BUCKET = "%Y-%m-%dT%H:%M"
FORMATO_BUCKET_SQL = 'YYYY-MM-DD"T"HH24:MI'

# relacion -> filtro SQL extra. Literales de este modulo, nunca entrada del usuario.
# `valido AND qc_ok` no es opcional en radiacion: sin el entran los valores previos
# a julio 2025, que el equipo descarto por calibracion.
_FILTRO: dict[str, str] = {
    "v_sc_electrico_corregido": "",
    "v_sc_radiacion_calibrada": " AND valido AND qc_ok",
    "radiacion_sc_poa": "",
}


class FuenteAusente(ValueError):
    """La variable esta en el catalogo pero ninguna tabla la contiene.

    Hereda de ValueError para que la API la traduzca a 400 como el resto de los
    errores de parametro. `codigo` la identifica sin leer el texto.
    """

    codigo = "fuente_ausente"


@dataclass(frozen=True)
class Origen:
    """De donde se lee una variable, ya validada contra el catalogo."""

    clave: str
    relacion: str
    columna: str
    filtro: str


def origen(clave: str) -> Origen:
    """Resuelve la variable a tabla y columna. Puerta UNICA a nombres de SQL.

    Ninguna funcion de graficos interpola un nombre que no haya salido de aca: la
    allowlist del catalogo es la defensa contra inyeccion, no documentacion.
    """
    var = catalogo.obtener(clave)
    if not var.disponible:
        raise FuenteAusente(f"{clave!r} no se puede analizar: {var.fuente_ausente}")
    return Origen(clave, var.relacion, var.columna, _FILTRO[var.relacion])


def donde(o: Origen) -> str:
    """El FROM/WHERE comun a todas las consultas. Consume DOS parametros: desde y hasta."""
    return (f'FROM {o.relacion} WHERE "timestamp" >= %s AND "timestamp" < %s '
            f'AND {o.columna} IS NOT NULL{o.filtro}')


def lecturas_pesadas(o: Origen) -> str:
    """Subconsulta que le pone a cada lectura el tiempo que REALMENTE cubre.

    Va como CTE porque una funcion de ventana no puede vivir dentro de un agregado.
    Expone `ts`, `valor` y `segundos`. Consume dos parametros: desde y hasta.
    """
    return (f'SELECT "timestamp" AS ts, {o.columna} AS valor, '
            f'{_SALTO_ACOTADO} AS segundos {donde(o)}')


def peso_temporal(salto_seg: float | None) -> float:
    """Cuanto tiempo cubre una lectura, dado su salto al siguiente registro.

    Es LA REGLA escrita en Python, y `_SALTO_ACOTADO` es su traduccion literal a
    SQL. Las dos existen porque la agregacion tiene que pasar en la base (sumar
    94.868 pesos en el proceso seria traerse la tabla) y una funcion de ventana no
    se puede escribir en Python, pero el criterio y su techo se prueban aca sin
    base de datos. Comparten la constante `TECHO_SALTO_SEG`, y la prueba de forma
    de `lecturas_pesadas` verifica que el SQL siga diciendo lo mismo.

    Sin salto siguiente (la ultima fila de la ventana) el peso es 0: no se sabe
    cuanto cubrio y no se inventa. Sobre miles de filas es despreciable.
    """
    return min(salto_seg or 0.0, float(TECHO_SALTO_SEG))
