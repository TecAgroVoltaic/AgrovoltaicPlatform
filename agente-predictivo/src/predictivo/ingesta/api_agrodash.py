"""
Fuente HTTP: la API publica de AgroDash (Cartago).

    https://agrodash.nm.35-208-114-233.nip.io/api/v1

Publica de verdad: no pide autenticacion ni el header `Origin` que menciona la doc
vieja. Es la app Rust/Axum del equipo de Cartago, la MISMA que alimenta su
dashboard, asi que entrega dato vivo (~30 s de rezago) sin depender de la tailnet.

═══ LO QUE HAY QUE SABER ANTES DE TOCAR ESTE ARCHIVO ═══

`GET /readings` NO devuelve los timestamps reales de las lecturas. Devuelve el
CENTRO DEL BIN de una grilla que la API arma con (ventana, points), y el ancho del
bin se topa para no pasar de ~7200 buckets por respuesta.

Medido contra el store, sensor 45a5c0a7…, 2026-07-22 09:00-10:00 (12 lecturas cuyo
`created_at` real ya estaba ingerido por el camino Postgres):

    ventana 1 h  -> bin 1 s      -> 09:00:04.500   = created_at + 0,5 s   EXACTO
    ventana 2 h  -> bin 1 s      -> 09:00:04.500   = created_at + 0,5 s   EXACTO
    ventana 3 h  -> bin 2 s      -> 09:00:05       corrido
    ventana 24 h -> bin 17,28 s  -> 09:00:10.500   corrido 6 s

De ahi las dos reglas de este modulo:

  1. VENTANAS DE 7200 s COMO MAXIMO. Solo con ventanas asi de cortas el bin baja a
     1 s, y entonces truncar la fraccion `.500` recupera el `created_at` exacto.

  2. `n == 1` NO ALCANZA COMO GUARDA. A 3 h los timestamps ya estan corridos y `n`
     SIGUE SIENDO 1, porque las lecturas estan a 5 min y nunca comparten bin. La
     guarda que si distingue es exigir que todo bucket termine en `.500`: eso solo
     pasa con bins de 1 s.

Por que importa tanto: la PK del store es `(serie_id, ts)`. Un timestamp corrido
medio segundo NO colisiona, asi que cada corrida incremental (que re-lee 2 h de
solape) insertaria duplicados de todo lo ya ingerido. Seria corrupcion silenciosa
del store, no un error visible. Por eso las guardas LEVANTAN en vez de avisar: mas
vale que el ETL falle ruidoso y deje `fallo:fuente` en `agente_log`.

═══ LO QUE ESTA FUENTE NO PUEDE DAR ═══

  * `readings.id` -> `origen_id` va NULL (migracion 003).
  * `timestamp_real` aparte de `created_at` -> `ts_medicion` va NULL, que el
    esquema ya contempla ("a veces NULL").

Otra trampa de la doc vieja: `from`/`to` con sufijo `Z` dan HTTP 400
("trailing input"). Van sin sufijo, y son hora LOCAL de Costa Rica.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Iterator
from zoneinfo import ZoneInfo

CR = ZoneInfo("America/Costa_Rica")

# Maximo que mantiene el bin en 1 s (ver cabecera). No subir sin volver a medir
# contra el store: arriba de esto los timestamps dejan de ser los reales.
VENTANA_MAX_SEG = 7200

# Con bins de 1 s el centro del bin SIEMPRE cae en medio segundo. Es la firma de
# que la API nos dio la grilla fina, y la unica guarda que detecta lo contrario.
SUFIJO_BIN_1S = ".500"

# Una lectura por bin. Redundante con la guarda de arriba en la practica, pero
# barata: si dos lecturas cayeran en el mismo segundo, promediarlas seria perder una.
LECTURAS_POR_BIN = 1

# Reintentos por request. El backfill son miles de llamadas y un corte de red no
# deberia tirar cincuenta minutos de trabajo. Corridas normales: 22 llamadas.
REINTENTOS = 3
ESPERA_REINTENTO_SEG = 2


class RespuestaInesperada(RuntimeError):
    """La API contesto algo que NO se puede ingerir sin corromper el store."""


class CajaNoEncontrada(RuntimeError):
    """La caja o el tipo de sensor no existen en la API.

    Es un error y no "cero filas" a proposito: una fuente que no encuentra lo que
    le piden tiene que gritarlo. Devolver vacio en silencio es como el ETL estuvo
    nueve dias fallando sin que nadie se enterara.
    """


class FuenteAgroDashAPI:
    """Lee lecturas crudas de la API publica, en ventanas que preservan el instante."""

    def __init__(self, base_url: str, timeout_seg: int = 15) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout_seg
        self._cajas: list[dict] | None = None      # cache de /boxes por corrida

    # ── HTTP ────────────────────────────────────────────────────────────────
    def _get(self, ruta: str, params: dict | None = None) -> list | dict:
        url = f"{self._base}/{ruta.lstrip('/')}"
        if params:
            # quote_via=quote para NO convertir los ':' de la hora en '%3A' ni los
            # espacios en '+': la API los quiere literales.
            url = f"{url}?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote, safe=':')}"
        ultimo: Exception | None = None
        for intento in range(REINTENTOS):
            try:
                with urllib.request.urlopen(url, timeout=self._timeout) as resp:
                    return json.loads(resp.read())
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                ultimo = exc
                if intento < REINTENTOS - 1:
                    time.sleep(ESPERA_REINTENTO_SEG * (intento + 1))
        raise RuntimeError(f"AgroDash API no respondio ({ruta}): {ultimo}") from ultimo

    # ── Catalogo ────────────────────────────────────────────────────────────
    def _sensores(self, caja: str, tipo: str) -> list[str]:
        """sensor_ids de una caja para un tipo. Cachea /boxes: cambia poco y el
        backfill lo pediria miles de veces."""
        if self._cajas is None:
            self._cajas = self._get("boxes")            # type: ignore[assignment]
        encontrada = next((b for b in self._cajas if b.get("name") == caja), None)
        if encontrada is None:
            disponibles = sorted(b.get("name", "?") for b in self._cajas)
            raise CajaNoEncontrada(
                f"La caja {caja!r} no existe en la API. Disponibles: {disponibles}")
        ids = [s["id"] for s in encontrada.get("sensors", []) if s.get("type") == tipo]
        if not ids:
            tipos = sorted({s.get("type") for s in encontrada.get("sensors", [])})
            raise CajaNoEncontrada(
                f"La caja {caja!r} no tiene sensores de tipo {tipo!r}. Tipos: {tipos}")
        return ids

    # ── Lecturas ────────────────────────────────────────────────────────────
    def _ventanas(self, desde: datetime, hasta: datetime) -> Iterator[tuple[datetime, datetime]]:
        """Parte [desde, hasta) en tramos de VENTANA_MAX_SEG como mucho."""
        paso = timedelta(seconds=VENTANA_MAX_SEG)
        ini = desde
        while ini < hasta:
            yield ini, min(ini + paso, hasta)
            ini += paso

    def _tramo(self, sensor_id: str, ini: datetime, fin: datetime) -> list[dict]:
        """Un tramo crudo, ya validado. `points` = segundos del tramo -> bins de 1 s."""
        span = max(int((fin - ini).total_seconds()), 1)
        crudo = self._get("readings", {
            "sensor_id": sensor_id,
            # Sin sufijo 'Z': con el la API responde 400 (ver cabecera).
            "from": ini.strftime("%Y-%m-%dT%H:%M:%S"),
            "to": fin.strftime("%Y-%m-%dT%H:%M:%S"),
            "points": span,
        })
        conValor = [b for b in crudo if b.get("value") is not None]
        for b in conValor:
            bucket = b.get("bucket", "")
            if not bucket.endswith(SUFIJO_BIN_1S):
                raise RespuestaInesperada(
                    f"Bucket {bucket!r} no termina en {SUFIJO_BIN_1S!r}: la API dejo "
                    f"de usar bins de 1 s, asi que el timestamp YA NO es el real y "
                    f"escribirlo duplicaria el store. Tramo {ini}..{fin} "
                    f"({span} s, sensor {sensor_id}).")
            if b.get("n", LECTURAS_POR_BIN) != LECTURAS_POR_BIN:
                raise RespuestaInesperada(
                    f"Bucket {bucket!r} agrupa {b.get('n')} lecturas: la API esta "
                    f"promediando y se perderian valores. Sensor {sensor_id}.")
        return conValor

    def lecturas(self, caja: str, tipo: str, desde: datetime) -> Iterator[tuple]:
        """(origen_id, caja, sensor_id, sensor_type, ts, ts_medicion, valor).

        `desde` es NAIVE en hora local CR (lo que ya calcula el ETL desde el
        watermark). El tope es "ahora" en la misma hora local.
        """
        hasta = datetime.now(CR).replace(tzinfo=None, microsecond=0)
        for sensor_id in self._sensores(caja, tipo):
            for ini, fin in self._ventanas(desde, hasta):
                for b in self._tramo(sensor_id, ini, fin):
                    # Truncar (no redondear) la fraccion: el centro del bin de 1 s
                    # es created_at + 0,5 s, asi que el segundo entero ES el original.
                    ts = datetime.fromisoformat(b["bucket"]).replace(microsecond=0)
                    yield (
                        None,        # origen_id: la API no expone readings.id
                        caja,
                        sensor_id,
                        tipo,
                        ts,
                        None,        # ts_medicion: la API no expone timestamp_real
                        b["value"],
                    )


@contextmanager
def abrir(url: str, timeout_seg: int = 15) -> Iterator[FuenteAgroDashAPI]:
    """Misma forma que `ingesta.postgres.abrir`. No hay conexion que soltar: HTTP
    es sin estado y el cache de /boxes muere con el objeto."""
    yield FuenteAgroDashAPI(url, timeout_seg)
