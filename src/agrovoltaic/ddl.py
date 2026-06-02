"""Generacion del schema SQL a partir de la definicion canonica de columnas.

El DDL NO se escribe a mano: se deriva de schemas.CANONICAL_COLUMNS +
GENERATED_COLUMNS, infiriendo el tipo SQL de cada columna. Agregar una columna
al schema canonico la incluye automaticamente en la tabla destino.

Tipos inferidos:
  time        -> TIMESTAMPTZ (PRIMARY KEY)
  meta entero -> INTEGER     (n_muestras, intervalo_original_seg)
  meta texto  -> TEXT        (tipo_fila, fuente_archivo)
  resto       -> DOUBLE PRECISION (todas las medidas numericas)
"""

from __future__ import annotations

from . import config
from .schemas import CANONICAL_COLUMNS, GENERATED_COLUMNS, _ALL_TAGS

# Columnas de metadata que son enteras (el resto de 'meta' es texto).
_INTEGER_META = {"n_muestras", "intervalo_original_seg"}


def sql_type(col: str) -> str:
    """Tipo SQL inferido para una columna."""
    tags = _ALL_TAGS.get(col, set())
    if "time" in tags:
        return "TIMESTAMPTZ"
    if "meta" in tags:
        return "INTEGER" if col in _INTEGER_META else "TEXT"
    return "DOUBLE PRECISION"


def _column_def(col: str) -> str:
    type_sql = sql_type(col)
    if "time" in _ALL_TAGS.get(col, set()):
        type_sql += " PRIMARY KEY"
    return f"    {col:<30} {type_sql}"


def main_table_ddl() -> str:
    """CREATE TABLE de la tabla principal, generado desde el schema canonico."""
    cols = CANONICAL_COLUMNS + list(GENERATED_COLUMNS)
    body = ",\n".join(_column_def(c) for c in cols)
    return f"CREATE TABLE IF NOT EXISTS {config.TABLE_MAIN} (\n{body}\n);"


def alter_table_ddl() -> str:
    """ALTER ADD COLUMN IF NOT EXISTS por cada columna (menos timestamp/PK).

    Hace el schema EVOLUTIVO: si la tabla ya existe, CREATE no agrega columnas
    nuevas, pero estos ALTER sí. Agregar una columna al CONCEPT_MAP y regenerar
    -> aparece en la tabla existente (NULL en filas viejas), sin perder datos.
    NO borra ni cambia el tipo de columnas existentes (eso requiere migracion manual).
    """
    cols = [c for c in CANONICAL_COLUMNS + list(GENERATED_COLUMNS) if c != "timestamp"]
    lines = [
        f"ALTER TABLE {config.TABLE_MAIN} ADD COLUMN IF NOT EXISTS {c} {sql_type(c)};"
        for c in cols
    ]
    return "\n".join(lines)


def ingest_log_ddl() -> str:
    """Tabla de control de ingesta (estructura fija, no depende del schema de datos)."""
    return (
        f"CREATE TABLE IF NOT EXISTS {config.TABLE_INGEST_LOG} (\n"
        "    filename       TEXT PRIMARY KEY,\n"
        "    md5            TEXT NOT NULL,\n"
        "    rows           INTEGER,\n"
        "    processed_at   TIMESTAMPTZ DEFAULT now()\n"
        ");"
    )


def full_schema_sql() -> str:
    """Schema completo, idempotente Y evolutivo. Apto para Supabase SQL Editor o psql."""
    return "\n\n".join([
        "-- GENERADO por agrovoltaic.ddl — NO editar a mano.",
        "-- Regenerar desde el menú: opción 'Crear/actualizar tablas'.",
        "-- Tabla principal (1 fila = 1 ventana de 5 min). La PK en timestamp ya",
        "-- da indice btree para consultas por rango/dia.",
        main_table_ddl(),
        "-- Evolucion del schema: agrega columnas nuevas si la tabla ya existia.",
        alter_table_ddl(),
        "-- Control de ingesta (idempotencia por md5 de archivo)",
        ingest_log_ddl(),
    ]) + "\n"


def init_db(conn) -> None:
    """Aplica el schema completo a la base (idempotente)."""
    with conn.cursor() as cur:
        cur.execute(full_schema_sql())
    conn.commit()
