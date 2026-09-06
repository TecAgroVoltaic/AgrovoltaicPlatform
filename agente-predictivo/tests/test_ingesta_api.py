"""
Tests del adaptador HTTP de AgroDash — sin red, con un `urlopen` falso.

Lo que se fija aca no es "que ande": es que NO PUEDA corromper el store en
silencio. La API devuelve el centro del bin de una grilla, no el timestamp real, y
solo con ventanas cortas ese centro coincide con el `created_at` original. Si eso
se rompe, la PK `(serie_id, ts)` deja de colisionar y cada corrida incremental
duplica las ultimas dos horas sin que nada falle.

Los cuatro tests que importan de verdad:
  * las ventanas nunca superan el maximo que preserva el instante,
  * un bucket sin el medio segundo LEVANTA (la grilla cambio de ancho),
  * un bucket que agrupa lecturas LEVANTA (la API esta promediando),
  * una caja o tipo inexistente LEVANTA en vez de devolver vacio.

Estructura Given-When-Then.
"""
import json
from datetime import datetime, timedelta

import pytest

from predictivo import ingesta
from predictivo.ingesta import api_agrodash

BASE = "https://agrodash.ejemplo/api/v1"
CAJA = "Caja Irradiancia SC"
TIPO = "irradiancia"

BOXES_UN_SENSOR = [
    {"id": "caja-1", "name": CAJA,
     "sensors": [{"id": "sensor-a", "sensor_number": 1, "type": TIPO}]},
]
BOXES_DOS_SENSORES = [
    {"id": "caja-1", "name": CAJA,
     "sensors": [{"id": "sensor-a", "sensor_number": 1, "type": TIPO},
                 {"id": "sensor-b", "sensor_number": 2, "type": TIPO}]},
]


class _RespuestaFalsa:
    """Lo minimo que usa `urlopen`: context manager con .read()."""

    def __init__(self, payload):
        self._crudo = json.dumps(payload).encode()

    def read(self):
        return self._crudo

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _falsear_http(monkeypatch, boxes, readings):
    """Sustituye urlopen y devuelve la lista donde se van anotando las URLs."""
    llamadas: list[str] = []

    def _abrir(url, timeout=None):
        llamadas.append(url)
        if "/boxes" in url:
            return _RespuestaFalsa(boxes)
        if "/readings" in url:
            return _RespuestaFalsa(readings)
        raise AssertionError(f"URL inesperada: {url}")

    monkeypatch.setattr(api_agrodash.urllib.request, "urlopen", _abrir)
    return llamadas


def _urls_de_readings(llamadas):
    return [u for u in llamadas if "/readings" in u]


def _rango(url):
    """(from, to) de una URL de /readings, como datetimes."""
    crudo = dict(p.split("=", 1) for p in url.split("?", 1)[1].split("&"))
    return datetime.fromisoformat(crudo["from"]), datetime.fromisoformat(crudo["to"])


# ── La regla que evita duplicar el store ────────────────────────────────────

def test_las_ventanas_nunca_superan_el_maximo_que_preserva_el_instante(monkeypatch):
    # Given: un rango de 5 horas, muy por encima del maximo de 2
    llamadas = _falsear_http(monkeypatch, BOXES_UN_SENSOR, [])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)
    desde = datetime.now() - timedelta(hours=5)

    # When
    list(fuente.lecturas(CAJA, TIPO, desde))

    # Then: se partio en tramos, y ninguno pasa del maximo
    tramos = [_rango(u) for u in _urls_de_readings(llamadas)]
    assert len(tramos) >= 3
    for ini, fin in tramos:
        assert (fin - ini).total_seconds() <= api_agrodash.VENTANA_MAX_SEG


def test_un_bucket_sin_medio_segundo_levanta_en_vez_de_ingerir(monkeypatch):
    # Given: la API responde con bins de 2 s (timestamps YA corridos, pero n=1)
    _falsear_http(monkeypatch, BOXES_UN_SENSOR,
                  [{"bucket": "2026-07-22T09:00:05", "value": 33.89, "n": 1}])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When / Then: no se ingiere nada, se levanta
    with pytest.raises(api_agrodash.RespuestaInesperada, match="bins de 1 s"):
        list(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(minutes=30)))


def test_un_bucket_que_agrupa_lecturas_levanta(monkeypatch):
    # Given: un bin con dos lecturas promediadas
    _falsear_http(monkeypatch, BOXES_UN_SENSOR,
                  [{"bucket": "2026-07-22T09:00:04.500", "value": 33.89, "n": 2}])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When / Then
    with pytest.raises(api_agrodash.RespuestaInesperada, match="promediando"):
        list(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(minutes=30)))


def test_el_medio_segundo_del_bin_se_trunca_y_recupera_el_instante_real(monkeypatch):
    # Given: el centro del bin de 1 s = created_at + 0,5 s (medido contra el store)
    _falsear_http(monkeypatch, BOXES_UN_SENSOR,
                  [{"bucket": "2026-07-22T09:00:04.500", "value": 33.89, "n": 1}])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When
    filas = list(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(minutes=30)))

    # Then: vuelve el segundo entero, que es el created_at original
    assert filas[0][4] == datetime(2026, 7, 22, 9, 0, 4)
    assert filas[0][4].microsecond == 0


# ── No devolver vacio cuando en realidad no se encontro nada ────────────────

def test_una_caja_inexistente_levanta_en_vez_de_devolver_vacio(monkeypatch):
    # Given: la API no conoce esa caja
    _falsear_http(monkeypatch, BOXES_UN_SENSOR, [])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When / Then
    with pytest.raises(api_agrodash.CajaNoEncontrada, match="no existe"):
        list(fuente.lecturas("Caja Que No Existe", TIPO, datetime.now()))


def test_un_tipo_de_sensor_inexistente_en_la_caja_levanta(monkeypatch):
    # Given: la caja existe pero no tiene sensores de ese tipo
    _falsear_http(monkeypatch, BOXES_UN_SENSOR, [])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When / Then
    with pytest.raises(api_agrodash.CajaNoEncontrada, match="no tiene sensores"):
        list(fuente.lecturas(CAJA, "humedad", datetime.now()))


# ── Forma de los datos ──────────────────────────────────────────────────────

def test_los_buckets_sin_valor_se_saltan(monkeypatch):
    # Given: tramos sin dato (el hueco de 24-jul a 4-ago se ve exactamente asi)
    _falsear_http(monkeypatch, BOXES_UN_SENSOR, [
        {"bucket": "2026-07-22T09:00:04.500", "value": None, "n": 0},
        {"bucket": "2026-07-22T09:05:41.500", "value": 44.67, "n": 1},
    ])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When
    filas = list(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(minutes=30)))

    # Then: un hueco no es un error, simplemente no aporta filas
    assert [f[6] for f in filas] == [44.67]


def test_la_api_no_expone_ni_el_id_de_origen_ni_el_instante_de_medicion(monkeypatch):
    # Given
    _falsear_http(monkeypatch, BOXES_UN_SENSOR,
                  [{"bucket": "2026-07-22T09:00:04.500", "value": 33.89, "n": 1}])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When
    origen_id, caja, sensor_id, sensor_type, _, ts_medicion, valor = next(
        iter(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(minutes=30))))

    # Then: se dice explicitamente que no se sabe, en vez de inventarlo
    assert origen_id is None
    assert ts_medicion is None
    assert (caja, sensor_id, sensor_type, valor) == (CAJA, "sensor-a", TIPO, 33.89)


def test_el_rango_se_pide_sin_sufijo_z(monkeypatch):
    # Given: con 'Z' la API responde 400 ("trailing input"), pese a lo que dice la doc
    llamadas = _falsear_http(monkeypatch, BOXES_UN_SENSOR, [])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When
    list(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(minutes=30)))

    # Then
    url = _urls_de_readings(llamadas)[0]
    assert "Z&" not in url and not url.endswith("Z")
    assert ":" in url.split("from=")[1][:20]        # la hora va literal, sin %3A


def test_el_catalogo_de_cajas_se_pide_una_sola_vez(monkeypatch):
    # Given: dos sensores y varias ventanas -> muchas llamadas a /readings
    llamadas = _falsear_http(monkeypatch, BOXES_DOS_SENSORES, [])
    fuente = api_agrodash.FuenteAgroDashAPI(BASE)

    # When
    list(fuente.lecturas(CAJA, TIPO, datetime.now() - timedelta(hours=5)))

    # Then: /boxes cachea; un backfill lo pediria miles de veces
    assert sum(1 for u in llamadas if "/boxes" in u) == 1


# ── Eleccion de la fuente por el esquema de la URL ──────────────────────────

@pytest.mark.parametrize("url", [
    "postgresql://usuario:clave@127.0.0.1:5433/agrodash_control",
    "postgres://usuario:clave@100.101.177.71:5432/control",
])
def test_una_url_postgres_elige_el_camino_postgres(url):
    assert ingesta.clasificar(url) == ingesta.TIPO_POSTGRES


@pytest.mark.parametrize("url", [
    "https://agrodash.nm.35-208-114-233.nip.io/api/v1",
    "http://localhost:8080/api/v1",
])
def test_una_url_http_elige_la_api_publica(url):
    assert ingesta.clasificar(url) == ingesta.TIPO_HTTP


@pytest.mark.parametrize("url", ["host=x port=5432 dbname=y", "mysql://a/b", ""])
def test_un_esquema_desconocido_falla_explicito_y_no_cae_en_un_default(url):
    # Un default silencioso aca = ingerir de la fuente equivocada sin enterarse
    with pytest.raises(ValueError, match="no soportado"):
        ingesta.clasificar(url)
