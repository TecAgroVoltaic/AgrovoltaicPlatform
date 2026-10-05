"""
Aislamiento de la suite: ningun test lee el store ni el parquet de la maquina.

`data.cargar_serie` cae al parquet local y, si no existe, al store de Supabase.
En una maquina de desarrollo el parquet esta y los tests pasan leyendo datos
reales; en CI no hay parquet ni STORE_URL y los mismos tests revientan. Aca se
corta ese camino para todos: el cache apunta a un directorio vacio y "bajar del
store" devuelve una serie vacia. El test que necesita datos los inyecta
(monkeypatch de `cargar_serie`), como ya hace el resto de la suite.
"""
import pandas as pd
import pytest

from predictivo import config, data


@pytest.fixture(autouse=True)
def _sin_store_ni_parquet(monkeypatch, tmp_path):
    def _serie_vacia(variable, verbose=True):
        idx = pd.DatetimeIndex([], tz=config.TZ, name="ts")
        return pd.Series([], index=idx, name=variable, dtype="float64")

    # `config` carga el .env de la maquina al importarse: con un STORE_URL real ahi,
    # el gasto y el uso se leerian de la base de produccion en vez de fallar como
    # en CI. Sin URL, el store "no esta" para toda la suite.
    monkeypatch.setattr(config, "STORE_URL", None)
    monkeypatch.setattr(data, "DATA_DIR", tmp_path)
    monkeypatch.setattr(data, "_SERIES", {})
    monkeypatch.setattr(data, "_descargar_desde_store", _serie_vacia)
