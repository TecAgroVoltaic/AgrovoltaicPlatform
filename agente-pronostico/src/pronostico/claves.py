"""
Quien puede consumir la API: claves CON NOMBRE.

SRP: decidir si una `x-api-key` es valida y de QUIEN es. No aplica limites (eso
es limites.py) ni traduce la decision a HTTP (eso es api.py).

Por que con nombre y no una sola clave compartida:
  * REVOCAR. Con una clave unica, sacarle el acceso a alguien obliga a rotarla
    para todos: la consola, los flujos de VisioneFlow y cualquier script. Con
    una clave por consumidor se borra una linea y el resto sigue andando.
  * ATRIBUIR. El rate-limit y el tope de gasto se aplican por identidad. Con una
    clave compartida todos comparten el mismo balde: un script en bucle deja sin
    servicio a las personas. Con claves separadas, cada uno se frena solo.
  * NO FILTRAR MATERIAL DE CLAVE. La identidad que viaja al limitador y a los
    logs pasa a ser el NOMBRE ("consola", "visioneflow"), no un pedazo de la
    clave como antes.

Formato del entorno (`FORECAST_API_KEYS`), separado por comas:

    FORECAST_API_KEYS=consola:sk_aaa...,visioneflow:sk_bbb...,jonathan:sk_ccc...

`FORECAST_API_KEY` (una sola clave, sin nombre) se sigue aceptando y se
identifica como "legado": hay flujos de VisioneFlow con esa clave ya pegada y
romperlos de golpe seria peor que la deuda de mantener las dos formas.

SIN ninguna de las dos definida, la API queda ABIERTA. Es el modo de desarrollo
local (`dev.sh` no configura clave); en produccion siempre hay al menos una.
"""
from __future__ import annotations

import os
import secrets

ENV_CLAVES = "FORECAST_API_KEYS"     # nombre:clave,nombre2:clave2
ENV_CLAVE_LEGADO = "FORECAST_API_KEY"  # una sola, sin nombre
NOMBRE_LEGADO = "legado"

# Separadores del formato. El nombre no puede llevar ':' ni ',' — se valida
# partiendo por el PRIMER ':', asi que una clave con ':' adentro sigue andando.
_SEP_ENTRADAS = ","
_SEP_NOMBRE = ":"


def _catalogo() -> dict[str, str]:
    """{clave: nombre}, leido del entorno EN CADA LLAMADA.

    A proposito no se cachea: rotar o revocar una clave es cambiar la variable y
    reiniciar el contenedor, y un cache de proceso solo agregaria una forma de
    que el sistema siguiera aceptando una clave ya sacada.
    """
    catalogo: dict[str, str] = {}
    crudo = os.environ.get(ENV_CLAVES, "")
    for entrada in crudo.split(_SEP_ENTRADAS):
        entrada = entrada.strip()
        if not entrada or _SEP_NOMBRE not in entrada:
            continue
        nombre, clave = entrada.split(_SEP_NOMBRE, 1)
        nombre, clave = nombre.strip(), clave.strip()
        if nombre and clave:
            catalogo[clave] = nombre
    legado = os.environ.get(ENV_CLAVE_LEGADO)
    if legado:
        catalogo.setdefault(legado, NOMBRE_LEGADO)
    return catalogo


def exigida() -> bool:
    """True si hay al menos una clave configurada (o sea, la API NO es abierta)."""
    return bool(_catalogo())


def identificar(clave: str | None) -> str | None:
    """Nombre del consumidor dueño de `clave`, o None si no vale.

    Compara contra TODAS las claves sin cortar al primer acierto: salir antes
    haria que el tiempo de respuesta dependiera de en que posicion esta la clave
    correcta, que es justo lo que `compare_digest` viene a evitar.
    """
    if clave is None:
        return None
    encontrado = None
    for candidata, nombre in _catalogo().items():
        if secrets.compare_digest(candidata, clave):
            encontrado = nombre
    return encontrado


def consumidores() -> list[str]:
    """Nombres configurados, para diagnostico. NUNCA devuelve claves."""
    return sorted(set(_catalogo().values()))
