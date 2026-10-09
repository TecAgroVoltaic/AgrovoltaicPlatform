"""Cliente de la API publica de AgroDash (dashboard de sensores, Rust/Axum) — SOLO LECTURA.

Responsabilidad unica: hablar HTTP con AgroDash y devolver filas planas para la
exportacion. Es la segunda fuente de `exportar.py`. Se eligio la API y no la DB
porque esta expuesta en internet (sin autenticacion; solo exige el header Origin)
y por tanto funciona desde cualquier maquina, no solo desde la EC2.

Lo que la API da (verificado en vivo el 2026-09-11; el PDF de referencia de abril
quedo viejo en dos puntos):
- `GET /boxes`                          cajas con sus sensores (id, sensor_number, type)
- `GET /readings/time-range`            {first, last} de toda la tabla de lecturas
- `GET /readings?sensor_id&from&to&points`  buckets: {bucket, value(prom), n, min, max, std}
  * `from`/`to` y `bucket` van en HORA LOCAL de Costa Rica, naive ("2026-09-09T06:00:00");
    con "Z" responde 400. (El PDF decia UTC: hoy la API convierte a local. Verificado
    cruzando valores con el store de Supabase, que si guarda UTC real.)
  * El servidor emite hasta ~5000 buckets por llamada aunque se pidan mas.
  * Un bucket con n=0 (sin lecturas) trae value=None: se descarta.
  * Con buckets mas finos que la cadencia del sensor, cada bucket tiene n=1 -> dato crudo.
- `GET /readings/last?sensor_id`        ultima lectura del sensor.

No hay endpoint de lecturas crudas ni de exportacion: la exportacion se arma
pidiendo buckets finos por sensor y por tramos del rango.

Fachada del paquete: `cliente` (HTTP y sensores), `particion` (tramos y ventanas),
`buckets` (lecturas de un sensor), `planas` (filas para la exportacion) y
`regiones` (San Carlos o Cartago segun el nombre de la caja).
"""
from __future__ import annotations

from historico.agrodash_api.buckets import _crudo, _crudo_ventana, _tramo, conteo, lecturas  # noqa: F401
from historico.agrodash_api.cliente import (  # noqa: F401
    MAX_PROFUNDIDAD, MAX_PUNTOS_LLAMADA, MAX_SENSORES_CONTEO, OBJETIVO_CRUDO, ORIGIN, PARALELO,
    PASOS_SEG, SENSORES_PARALELO, TIMEOUT_SEG, URL_BASE, AgroDashNoDisponible, _get, cajas,
    rango_disponible, sensores,
)
from historico.agrodash_api.particion import _map_ventana, _parse_bucket, tramos, ventanas  # noqa: F401
from historico.agrodash_api.planas import conteos, filas, filas_sensores  # noqa: F401
from historico.agrodash_api.regiones import (  # noqa: F401
    CARTAGO, SAN_CARLOS, SUFIJO_SAN_CARLOS, es_san_carlos, region_de,
)
