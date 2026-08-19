"""
Identidad de las bases del agente: DE DONDE lee y DONDE guarda, sin credenciales.

SRP: traducir la configuracion de conexion a una identidad LEGIBLE (que base es,
si es una copia congelada o la base viva, que se le pide). No conecta, no
consulta y no decide nada: es una funcion de la configuracion.

Por que existe: el 2026-08-14 la fuente del ETL dejo de ser la base viva de
Cartago y paso a ser una REPLICA de un dump restaurada junto al propio ETL. Nada
"falla" por eso — el ETL corre verde cada 15 min — pero la fuente es un snapshot
y no entra un dato nuevo. Quien mira el panel tiene que enterarse de eso primero,
y no puede depender de que alguien se acuerde de escribirlo a mano en la vista.

Regla de seguridad: aca solo salen host, puerto y nombre de base. Nunca la cadena
de conexion completa, ni el usuario, ni la clave: el panel es una vista de
operacion, no un lugar donde repartir credenciales.
"""
from __future__ import annotations

from urllib.parse import urlsplit

from pronostico import config, etl

# Que clase de base es la fuente. Determina si los datos pueden avanzar.
TIPO_REPLICA_DUMP = "replica_dump"        # copia restaurada de un dump: congelada
TIPO_BASE_VIVA = "base_viva"              # la DB que ingiere de los sensores
TIPO_REPLICA_REMOTA = "replica_remota"    # copia en otra maquina de la tailnet
TIPO_DESCONOCIDO = "desconocido"

# Loopback: la base corre en la MISMA maquina que el ETL.
HOSTS_LOOPBACK = frozenset({"127.0.0.1", "localhost", "::1"})

# Direcciones conocidas de AgroDash en la tailnet. No son secretos (son IPs
# privadas de la malla y sin credenciales no sirven de nada) y son lo unico que
# permite decir "esto es Cartago" en vez de "una base remota cualquiera".
HOSTS_AGRODASH: dict[str, tuple[str, str, bool | None]] = {
    "100.101.177.71": (TIPO_BASE_VIVA,
                       "AgroDash Cartago — base viva (tailnet)", False),
    "100.100.130.47": (TIPO_REPLICA_REMOTA,
                       "Replica de AgroDash en el rig (tailnet)", None),
}

ETIQUETA_DUMP = "Replica del dump de AgroDash restaurada junto al ETL"
ETIQUETA_DESCONOCIDA = "Base PostgreSQL no reconocida"

# El criterio se devuelve al cliente A PROPOSITO: es una heuristica sobre el host,
# no un hecho que la base declare. Mostrarlo deja que un humano la contradiga.
CRITERIO_LOOPBACK = (
    "El host es de loopback: la base corre en la misma maquina que el ETL. La "
    "base viva de Cartago solo es alcanzable por la tailnet, asi que una fuente "
    "local solo puede ser la replica restaurada del dump."
)
CRITERIO_HOST_CONOCIDO = "El host coincide con una direccion conocida de AgroDash."
CRITERIO_SIN_IDENTIFICAR = (
    "El host no es de loopback ni coincide con ninguna direccion conocida de "
    "AgroDash: no se puede afirmar si es la base viva o una copia."
)

ETIQUETA_STORE_SUPABASE = "Supabase de AgroVoltaic — store del agente"
ETIQUETA_STORE_POSTGRES = "PostgreSQL — store del agente"
SUFIJO_SUPABASE = "supabase.com"


def _partes(dsn: str) -> dict:
    """Host, puerto y base de una URL de conexion. Descarta usuario y clave.

    Un DSN en formato `clave=valor` (que psycopg tambien acepta) no parsea como
    URL: devuelve host None y el clasificador lo reporta como desconocido, que es
    la respuesta honesta.
    """
    partes = urlsplit(dsn)
    return {
        "host": partes.hostname,
        "puerto": partes.port,
        "base": (partes.path or "").lstrip("/") or None,
    }


def _clasificar(host: str | None) -> tuple[str, str, bool | None, str]:
    """(tipo, etiqueta, es_snapshot, criterio) a partir del host."""
    if host in HOSTS_LOOPBACK:
        return TIPO_REPLICA_DUMP, ETIQUETA_DUMP, True, CRITERIO_LOOPBACK
    conocido = HOSTS_AGRODASH.get(host or "")
    if conocido:
        tipo, etiqueta, es_snapshot = conocido
        return tipo, etiqueta, es_snapshot, CRITERIO_HOST_CONOCIDO
    return TIPO_DESCONOCIDO, ETIQUETA_DESCONOCIDA, None, CRITERIO_SIN_IDENTIFICAR


def _definida_en() -> str:
    """Que variable de entorno manda hoy — para saber donde cambiar la fuente."""
    return "DATABASE_URL" if config.DATABASE_URL else "AGRODASH_HOST/PORT/DB"


def _targets() -> list[dict]:
    """Que se le pide a la fuente, derivado de `etl.TARGETS` (sin segunda lista)."""
    return [
        {"variable": t["variable"], "caja": t["caja"],
         "sensor_type": t["tipo"], "unidad": t["unidad"]}
        for t in etl.TARGETS
    ]


def fuente() -> dict:
    """De donde lee el ETL: identidad, si es un snapshot y que le pide.

    `es_snapshot` True = los datos NO pueden avanzar por mas que el ETL corra.
    None = no se pudo determinar (no se afirma lo que no se sabe).
    """
    try:
        partes = _partes(config.conninfo())
    except Exception as exc:  # noqa: BLE001 — sin config no hay identidad, no hay panel caido
        # Solo el TIPO de excepcion: su mensaje podria arrastrar la cadena de
        # conexion, que es justo lo que este modulo existe para no exponer.
        return {"host": None, "puerto": None, "base": None,
                "tipo": TIPO_DESCONOCIDO, "etiqueta": ETIQUETA_DESCONOCIDA,
                "es_snapshot": None, "criterio": CRITERIO_SIN_IDENTIFICAR,
                "definida_en": _definida_en(), "targets": _targets(),
                "error": type(exc).__name__}
    tipo, etiqueta, es_snapshot, criterio = _clasificar(partes["host"])
    return {**partes, "tipo": tipo, "etiqueta": etiqueta,
            "es_snapshot": es_snapshot, "criterio": criterio,
            "definida_en": _definida_en(), "targets": _targets()}


def store() -> dict:
    """Donde escribe el ETL y de donde lee el forecaster (el store del agente)."""
    try:
        partes = _partes(config.store_conninfo())
    except Exception as exc:  # noqa: BLE001 — mismo criterio que fuente()
        return {"host": None, "puerto": None, "base": None,
                "etiqueta": ETIQUETA_STORE_POSTGRES, "definida_en": "STORE_URL",
                "error": type(exc).__name__}
    es_supabase = (partes["host"] or "").endswith(SUFIJO_SUPABASE)
    return {**partes, "definida_en": "STORE_URL",
            "etiqueta": ETIQUETA_STORE_SUPABASE if es_supabase
            else ETIQUETA_STORE_POSTGRES}
