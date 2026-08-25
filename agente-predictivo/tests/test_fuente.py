"""
Tests de la identidad de la fuente — pura configuracion, sin DB ni red.

Fijan lo primero que alguien tiene que entender al mirar el panel desde el
2026-08-14: los datos NO vienen de la base viva de Cartago sino de una replica de
un dump, y por eso el ETL puede correr verde para siempre sin traer una fila.
Y fijan la regla que no se puede relajar: de la cadena de conexion solo sale lo
que no es secreto. Estructura Given-When-Then.
"""
import json

import pytest

from predictivo import config, etl, fuente

CLAVE = "clave-super-secreta"
USUARIO = "agrovoltaic_ro"
BASE = "agrodash_control"

# El host de la base viva sale de la tabla del modulo, no de un literal pegado:
# si manana cambia la direccion de Cartago, el test sigue probando la regla.
HOST_BASE_VIVA = next(host for host, (tipo, _, _) in fuente.HOSTS_AGRODASH.items()
                      if tipo == fuente.TIPO_BASE_VIVA)


def _dsn(host: str, puerto: int = 5432) -> str:
    """URL de conexion valida. Un host IPv6 va entre corchetes, si no el `:` del
    puerto es ambiguo (asi la escribe cualquier cliente real)."""
    literal = f"[{host}]" if ":" in host else host
    return f"postgresql://{USUARIO}:{CLAVE}@{literal}:{puerto}/{BASE}"


def _con_fuente(monkeypatch, dsn: str) -> dict:
    monkeypatch.setattr(config, "conninfo", lambda: dsn)
    return fuente.fuente()


@pytest.mark.parametrize("host", sorted(fuente.HOSTS_LOOPBACK))
def test_una_fuente_local_se_identifica_como_la_replica_del_dump(monkeypatch, host):
    # Given: la fuente corre en la misma maquina que el ETL (la replica de la EC2)
    identidad = _con_fuente(monkeypatch, _dsn(host, 5433))

    # Then: se dice que es un snapshot, con el criterio a la vista
    assert identidad["tipo"] == fuente.TIPO_REPLICA_DUMP
    assert identidad["es_snapshot"] is True
    assert identidad["puerto"] == 5433
    assert identidad["base"] == BASE
    assert "loopback" in identidad["criterio"]


def test_la_base_viva_de_cartago_no_se_confunde_con_un_snapshot(monkeypatch):
    # Given: la fuente vuelve a ser Cartago por la tailnet
    identidad = _con_fuente(monkeypatch, _dsn(HOST_BASE_VIVA))

    # Then: cambiar una linea de DATABASE_URL alcanza para que el panel lo diga
    assert identidad["tipo"] == fuente.TIPO_BASE_VIVA
    assert identidad["es_snapshot"] is False


def test_un_host_desconocido_no_inventa_identidad(monkeypatch):
    # Given: alguien apunta la fuente a una base que nadie registro
    identidad = _con_fuente(monkeypatch, _dsn("db.example.org"))

    # Then: "no se sabe" (None), que es distinto de "no es un snapshot" (False)
    assert identidad["tipo"] == fuente.TIPO_DESCONOCIDO
    assert identidad["es_snapshot"] is None
    assert identidad["host"] == "db.example.org"


def test_un_dsn_en_formato_clave_valor_no_se_reporta_como_conocido(monkeypatch):
    # Given: psycopg tambien acepta "host=... port=...", que no parsea como URL
    identidad = _con_fuente(monkeypatch, f"host=127.0.0.1 port=5433 dbname={BASE}")

    # Then: sin host reconocible no se afirma nada
    assert identidad["host"] is None
    assert identidad["tipo"] == fuente.TIPO_DESCONOCIDO


def test_no_devuelve_credenciales_ni_la_cadena_de_conexion(monkeypatch):
    # Given: una fuente cuya URL lleva usuario y clave
    dsn = _dsn(HOST_BASE_VIVA)
    identidad = _con_fuente(monkeypatch, dsn)

    # When: se serializa tal cual viaja al cliente
    payload = json.dumps(identidad)

    # Then: host y puerto si; credenciales y URL completa, nunca
    assert CLAVE not in payload
    assert USUARIO not in payload
    assert dsn not in payload
    assert identidad["host"] == HOST_BASE_VIVA


def test_la_identidad_refleja_la_configuracion_real_del_proceso():
    # Given/When: la configuracion que realmente rige (sin mocks)
    identidad = fuente.fuente()

    # Then: se dice de donde sale la fuente, para saber donde cambiarla
    esperado = "DATABASE_URL" if config.DATABASE_URL else "AGRODASH_HOST/PORT/DB"
    assert identidad["definida_en"] == esperado
    # Y que se le pide sale de los TARGETS del ETL, no de una segunda lista
    assert ([t["variable"] for t in identidad["targets"]]
            == [t["variable"] for t in etl.TARGETS])
    assert ([t["caja"] for t in identidad["targets"]]
            == [t["caja"] for t in etl.TARGETS])


def test_si_falta_la_configuracion_degrada_en_vez_de_lanzar(monkeypatch):
    # Given: modo por partes sin AGRODASH_PASSWORD -> conninfo() lanza KeyError
    def sin_clave():
        raise KeyError("AGRODASH_PASSWORD")
    monkeypatch.setattr(config, "conninfo", sin_clave)

    # When
    identidad = fuente.fuente()

    # Then: el panel se entera del problema y sigue en pie; el mensaje de la
    # excepcion no viaja (podria arrastrar la cadena de conexion)
    assert identidad["error"] == "KeyError"
    assert identidad["tipo"] == fuente.TIPO_DESCONOCIDO
    assert identidad["host"] is None


def test_el_store_se_identifica_sin_credenciales(monkeypatch):
    # Given: el store real es una Supabase por el Session pooler
    host = f"aws-1-us-east-1.pooler.{fuente.SUFIJO_SUPABASE}"
    monkeypatch.setattr(config, "store_conninfo",
                        lambda: f"postgresql://{USUARIO}:{CLAVE}@{host}:5432/postgres")

    # When
    identidad = fuente.store()

    # Then
    assert identidad["etiqueta"] == fuente.ETIQUETA_STORE_SUPABASE
    assert identidad["host"] == host
    assert CLAVE not in json.dumps(identidad)


def test_sin_store_configurado_lo_dice_en_vez_de_lanzar(monkeypatch):
    # Given: STORE_URL sin definir (store_conninfo lanza RuntimeError)
    def sin_store():
        raise RuntimeError("STORE_URL no definida")
    monkeypatch.setattr(config, "store_conninfo", sin_store)

    # When/Then
    assert fuente.store()["error"] == "RuntimeError"
