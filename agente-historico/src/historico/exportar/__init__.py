"""Exportacion de datos por rango de fechas: CSV, DAT (texto tabulado) y MAT (MATLAB).

Responsabilidad unica: convertir un rango [desde, hasta] de un DATASET permitido en
un archivo descargable. No es una tool del LLM: sirve al humano que quiere llevarse
los datos a MATLAB, Python, Excel u Origin.

Dos FUENTES (dos "vias" distintas):
- `supabase` (via SQL, pool de `db.py`): la Supabase PV de San Carlos (historico
  estandarizado por el ETL de CSV + capas de analisis + el store ambiental que copia
  el agente de pronostico).
- `agrodash` (via API HTTP, `agrodash_api.py`): la plataforma de sensores de la region
  (cajas -> sensores -> lecturas), leida en vivo por su API publica. Filtrable por caja
  y tipo de sensor, con `paso` (ancho del bucket; 0 = crudo). Si la API no responde,
  la fuente se reporta como no disponible y el resto sigue funcionando.

Seguridad: misma regla que `datos.py` — el dataset, las columnas y los filtros se
resuelven contra un catalogo (allowlist estatica o `information_schema`) ANTES de
interpolarse en el SQL; los valores (rango, cajas, tipos) van parametrizados (%s);
todo corre en sesiones de SOLO LECTURA.

Memoria: CSV y DAT se emiten por lotes (`db.en_streaming` -> generador de bytes),
asi una exportacion de cientos de miles de filas no carga todo en RAM. MAT exige
el arreglo completo en memoria (scipy), por eso tiene un tope de filas explicito.

Convenciones de cada formato (documentadas para quien consume el archivo):
- csv: coma, UTF-8, encabezado, nulo = celda vacia, booleano = true/false.
- dat: tabulador, encabezado en la 1.ª linea, nulo = NaN, booleano = 1/0, y por
  cada columna temporal se agrega `<col>_unix` (segundos Unix reales). Pensado
  para `readtable`/`loadtxt`.
- mat: una variable MATLAB por columna (vector columna Nx1; numerico=double con
  NaN, texto=cell de char) + `<col>_unix` y `<col>_datenum` por columna temporal
  + struct `meta` (fuente, dataset, rango, filas, zona horaria, generado_en).

Reloj (verificado contra las bases el 2026-09-11): TODAS las horas se exportan en
hora local de Costa Rica (UTC-6) SIN sufijo de zona, y el rango [desde, hasta] se
interpreta en dias locales. Las bases mezclan tres convenciones y cada dataset
declara la suya (`reloj`, `tcol_tz`):
- Tablas PV de Supabase: `timestamptz` cuyo RELOJ ya es local pero quedo etiquetado
  +00 (el pico de potencia cae a las 11-12 "UTC") -> reloj='local': se exporta tal
  cual y el rango se filtra con limites naive (la sesion esta en UTC).
- Store ambiental de Supabase (`lecturas_ambientales_sc.ts`): `timestamptz` UTC REAL
  (pico de irradiancia a las 17 UTC = 11 local) -> reloj='utc', tcol_tz=True: se
  convierte a local y el rango lleva zona (-06:00).
- AgroDash (API, `bucket`): texto ISO NAIVE en HORA LOCAL CR (la API convierte; la DB
  detras guarda UTC, y de ahi salio el store) -> reloj='local', tcol_tz=False: se
  exporta tal cual y el rango se pide a la API en hora local naive (rechaza la "Z").
  Verificado cruzando valores con el store: coinciden uno a uno en local.
"""
from __future__ import annotations

from historico import agrodash_api, config, datos, db  # noqa: F401 — puntos de sustitucion
from historico.exportar.archivo import _nombre_archivo, _slug, exportar  # noqa: F401
from historico.exportar.consulta import _consulta, _filas, _lista_select  # noqa: F401
from historico.exportar.datasets import DATASETS, FUENTES  # noqa: F401
from historico.exportar.estimacion import estimar, previa  # noqa: F401
from historico.exportar.inventario import (  # noqa: F401
    _catalogo_agrodash, _catalogo_supabase, _entrada, _motivo, catalogo,
)
from historico.exportar.matlab import _ident_matlab, _mat  # noqa: F401
from historico.exportar.modelo import (  # noqa: F401
    FORMATOS, LOTE, MAX_FILAS_MAT, PASOS_SEG, TZ, UTC,
    Columna, Dataset, Exportacion, ExportacionDemasiadoGrande,
)
from historico.exportar.reloj import (  # noqa: F401
    _epoch, _expr_local, _fecha, _iso, _limite_sql, _local, _rango_api, rango,
)
from historico.exportar.resolucion import _columnas, _ds, _filtros, _formato, _paso, _seleccion  # noqa: F401
from historico.exportar.texto import _celda_csv, _celda_dat, _csv, _dat, _es_numero, _es_tiempo  # noqa: F401
