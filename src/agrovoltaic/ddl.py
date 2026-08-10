"""Generacion del schema SQL desde la definicion canonica de columnas.

El DDL NO se escribe a mano: se deriva de schemas.* (columnas canonicas + tags).
Modelo nuevo (validado con Leo Cardinale, 2026-08-10):

  TABLAS CRUDAS (el dato se conserva tal cual):
    monitoreo_sc_electrico   1 fila = ventana de 5 min  (inversor + DS18B20)
    radiacion_sc_15s         1 fila = ventana de 15 s   (piranometro + SP722)

  CAPA DE CORRECCION (vistas, aqui viven las decisiones de limpieza):
    v_sc_electrico_corregido   temp 85/fuera de rango -> NULL, limites de validez
    v_sc_radiacion_corregida   offset -38.845 -> 0, negativos -> 0, pre-2025 invalida

  SOPORTE:
    diccionario_variables   definiciones/abreviaciones (Leo P1)
    _ingest_log             idempotencia por md5 de archivo

Tipos inferidos: time->TIMESTAMPTZ PK; meta entero->INTEGER; meta texto->TEXT;
resto->DOUBLE PRECISION.
"""

from __future__ import annotations

from . import config
from .schemas import (
    DESCRIPTIONS,
    GENERATED_COLUMNS,
    _ALL_TAGS,
    cols_electrico,
    cols_radiacion,
    electrico_table_columns,
    is_radiacion,
    radiacion_table_columns,
)

# Columnas de metadata que son enteras (el resto de 'meta' es texto).
_INTEGER_META = {"n_muestras", "intervalo_original_seg"}


# --- Tipos y definicion de columnas -----------------------------------------
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
    return f"    {col:<32} {type_sql}"


def _table_ddl(table: str, columns: list[str]) -> str:
    body = ",\n".join(_column_def(c) for c in columns)
    return f"CREATE TABLE IF NOT EXISTS {table} (\n{body}\n);"


def _alter_ddl(table: str, columns: list[str]) -> str:
    """ALTER ADD COLUMN IF NOT EXISTS por columna (menos la PK). Schema evolutivo."""
    lines = [
        f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {c} {sql_type(c)};"
        for c in columns if c != "timestamp"
    ]
    return "\n".join(lines)


# --- Capa de correccion (expresiones SQL derivadas de tags + config) ---------
def correction_expr(col: str) -> str:
    """Expresion SQL de la columna corregida. Devuelve el nombre crudo si no aplica.

    Implementa las decisiones de Leo SOBRE UNA VISTA (el crudo queda intacto en la
    tabla). Todo se deriva de tags/nombre + umbrales de config -> cero columnas quemadas.
    """
    tags = _ALL_TAGS.get(col, set())

    # --- Radiacion ---
    if col.startswith("irradiancia"):
        off = config.OFFSET_NOCTURNO
        cut = config.IRRAD_INVALIDA_ANTES
        return (
            f"CASE WHEN timestamp < '{cut}'::timestamptz THEN NULL "        # pre-mediados-2025 invalida (P12)
            f"WHEN abs({col} - ({off})) < 1e-3 THEN 0 "                      # offset nocturno (P4/P5)
            f"WHEN {col} < 0 THEN 0 "                                        # negativos -> 0
            f"ELSE {col} END"
        )
    if col.startswith("albedo"):
        lo, hi = config.ALBEDO_RANGE
        return f"CASE WHEN {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"
    if col.endswith("_mv"):
        return col  # lectura cruda del detector, sin corregir

    # --- Electrico ---
    if "temperatura" in tags:
        lo, hi = config.TEMP_VALID_RANGE
        return (
            f"CASE WHEN {col} = {config.TEMP_SENSOR_ERROR} "                 # error DS18B20 (P2)
            f"OR {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"       # rango 10-80 (P9)
        )
    if "potencia" in tags:
        lo, hi = config.POT_STRING_RANGE
        return f"CASE WHEN {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"
    if col.startswith("voltaje_pv"):
        lo, hi = config.VOLT_STRING_RANGE
        return f"CASE WHEN {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"
    if col.startswith("corriente_pv"):
        lo, hi = config.CORR_STRING_RANGE
        return f"CASE WHEN {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"
    if col == "frecuencia_hz":
        lo, hi = config.FREQ_VALID_RANGE
        return f"CASE WHEN {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"
    if col == "voltaje_vac":
        lo, hi = config.VAC_VALID_RANGE
        return f"CASE WHEN {col} < {lo} OR {col} > {hi} THEN NULL ELSE {col} END"

    # energia (acumuladores), corriente_aac, codigo_error: crudo
    return col


def _view_ddl(view: str, table: str, measures: list[str], extra: list[str]) -> str:
    """CREATE OR REPLACE VIEW aplicando correction_expr() a cada medida.

    `security_invoker = on`: la vista respeta permisos/RLS del que consulta (no del
    creador). Es el default seguro recomendado por Supabase (evita el lint
    security_definer_view).
    """
    select = ["    timestamp"]
    for c in measures:
        expr = correction_expr(c)
        select.append(f"    {c}" if expr == c else f"    {expr} AS {c}")
    select.extend(f"    {c}" for c in extra)
    body = ",\n".join(select)
    return (
        f"CREATE OR REPLACE VIEW {view} WITH (security_invoker = on) AS\n"
        f"SELECT\n{body}\nFROM {table};"
    )


def electrico_view_ddl() -> str:
    return _view_ddl(
        config.VIEW_ELECTRICO_CORR, config.TABLE_ELECTRICO,
        cols_electrico(), list(GENERATED_COLUMNS),
    )


def radiacion_view_ddl() -> str:
    """Vista de radiacion corregida + bandera `valido` (pre-mediados-2025 invalida, P12).

    Correccion cruda (offset -> 0, negativos -> 0, pre-2025 -> NULL). La calibracion a
    W/m2 + kt* + QC va en la vista superior v_sc_radiacion_calibrada (usa clear-sky).
    """
    cut = config.IRRAD_INVALIDA_ANTES
    extra = [f"(timestamp >= '{cut}'::timestamptz) AS valido", *GENERATED_COLUMNS]
    return _view_ddl(
        config.VIEW_RADIACION_CORR, config.TABLE_RADIACION,
        cols_radiacion(), extra,
    )


def clearsky_table_ddl() -> str:
    """Tabla compañera con el GHI de cielo despejado (pvlib) por timestamp."""
    return (
        f"CREATE TABLE IF NOT EXISTS {config.TABLE_CLEARSKY} (\n"
        "    timestamp      TIMESTAMPTZ PRIMARY KEY,\n"
        "    cs_ghi_wm2     DOUBLE PRECISION\n"
        ");"
    )


def poa_table_ddl() -> str:
    """Tabla compañera con la POA por arreglo (frontal + bifacial efectiva) por timestamp."""
    return (
        f"CREATE TABLE IF NOT EXISTS {config.TABLE_POA} (\n"
        "    timestamp           TIMESTAMPTZ PRIMARY KEY,\n"
        "    poa_pv1_front_wm2   DOUBLE PRECISION,\n"
        "    poa_pv1_wm2         DOUBLE PRECISION,\n"
        "    poa_pv2_front_wm2   DOUBLE PRECISION,\n"
        "    poa_pv2_wm2         DOUBLE PRECISION\n"
        ");"
    )


def performance_view_ddl() -> str:
    """Vista de Performance Ratio por arreglo: PR = (P_dc/P0) / (POA_bifacial/1000).

    Junta la potencia DC corregida con la POA efectiva (bifacial) de cada arreglo.
    PR solo se calcula con POA util (> UMBRAL_POA) y potencia no negativa.
    """
    p1 = config.PV_ARRAYS["pv1"]["p0"]
    p2 = config.PV_ARRAYS["pv2"]["p0"]
    u = config.UMBRAL_POA
    return (
        f"CREATE OR REPLACE VIEW {config.VIEW_PERFORMANCE} WITH (security_invoker = on) AS\n"
        "SELECT\n"
        "    e.timestamp,\n"
        "    e.potencia_pv1_w,\n"
        "    e.potencia_pv2_w,\n"
        "    p.poa_pv1_wm2,\n"
        "    p.poa_pv2_wm2,\n"
        "    p.poa_pv1_front_wm2,\n"
        "    p.poa_pv2_front_wm2,\n"
        f"    CASE WHEN p.poa_pv1_wm2 > {u} AND e.potencia_pv1_w >= 0\n"
        f"         THEN (e.potencia_pv1_w / {p1}) / (p.poa_pv1_wm2 / 1000.0) END AS pr_pv1,\n"
        f"    CASE WHEN p.poa_pv2_wm2 > {u} AND e.potencia_pv2_w >= 0\n"
        f"         THEN (e.potencia_pv2_w / {p2}) / (p.poa_pv2_wm2 / 1000.0) END AS pr_pv2\n"
        f"FROM {config.VIEW_ELECTRICO_CORR} e JOIN {config.TABLE_POA} p USING (timestamp);"
    )


def radiacion_calibrada_view_ddl() -> str:
    """Vista superior: crudo corregido + clear-sky -> W/m2, kt*, qc_ok.

    - irradiancia_*_wm2 = correccion cruda * IRRAD_SCALE (el periodo valido ya esta en
      W/m2, escala ~1.0).
    - kt_star = incidente_wm2 / cs_ghi_wm2 (solo donde cs_ghi > UMBRAL_CS).
    - qc_ok = FALSE si el valor supera KT_STAR_MAX * cs_ghi (spike/ruido no fisico).
    El crudo NO se toca; esto es capa de analisis (regla de Leo).
    """
    scale = config.IRRAD_SCALE
    umbral = config.UMBRAL_CS
    ktmax = config.KT_STAR_MAX
    inc = f"({scale} * ({correction_expr('irradiancia_incidente')}))"
    ref = f"({scale} * ({correction_expr('irradiancia_reflejada')}))"
    inc_sp = f"({scale} * ({correction_expr('irradiancia_incidente_sp722')}))"
    ref_sp = f"({scale} * ({correction_expr('irradiancia_reflejada_sp722')}))"
    alb = correction_expr("albedo")
    alb_sp = correction_expr("albedo_sp722")
    cut = config.IRRAD_INVALIDA_ANTES
    body = ",\n".join([
        "    timestamp",
        f"    {inc} AS irradiancia_incidente_wm2",
        f"    {ref} AS irradiancia_reflejada_wm2",
        f"    {alb} AS albedo",
        f"    {inc_sp} AS irradiancia_incidente_sp722_wm2",
        f"    {ref_sp} AS irradiancia_reflejada_sp722_wm2",
        f"    {alb_sp} AS albedo_sp722",
        "    cs_ghi_wm2",
        f"    CASE WHEN cs_ghi_wm2 > {umbral} THEN ({inc}) / cs_ghi_wm2 END AS kt_star",
        f"    (({inc}) IS NULL OR ({inc}) <= GREATEST({ktmax} * cs_ghi_wm2, 50)) AS qc_ok",
        f"    (timestamp >= '{cut}'::timestamptz) AS valido",
        "    n_muestras",
        "    intervalo_original_seg",
        "    fuente_archivo",
    ])
    return (
        f"CREATE OR REPLACE VIEW {config.VIEW_RADIACION_CAL} WITH (security_invoker = on) AS\n"
        f"SELECT\n{body}\n"
        f"FROM {config.TABLE_RADIACION} LEFT JOIN {config.TABLE_CLEARSKY} USING (timestamp);"
    )


# --- Diccionario y log de ingesta -------------------------------------------
def diccionario_ddl() -> str:
    """Tabla de definiciones (Leo P1) + seed idempotente desde schemas.DESCRIPTIONS."""
    create = (
        f"CREATE TABLE IF NOT EXISTS {config.TABLE_DICCIONARIO} (\n"
        "    variable       TEXT PRIMARY KEY,\n"
        "    descripcion    TEXT NOT NULL,\n"
        "    tabla          TEXT\n"
        ");"
    )
    rows = []
    for var, desc in DESCRIPTIONS.items():
        tabla = "radiacion" if is_radiacion(var) else "electrico"
        d = desc.replace("'", "''")
        rows.append(f"    ('{var}', '{d}', '{tabla}')")
    seed = (
        f"INSERT INTO {config.TABLE_DICCIONARIO} (variable, descripcion, tabla) VALUES\n"
        + ",\n".join(rows)
        + "\nON CONFLICT (variable) DO UPDATE SET "
        "descripcion = EXCLUDED.descripcion, tabla = EXCLUDED.tabla;"
    )
    return create + "\n" + seed


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


# --- Ensamblado --------------------------------------------------------------
def full_schema_sql() -> str:
    """Schema completo, idempotente y evolutivo. Apto para Supabase SQL Editor o psql."""
    return "\n\n".join([
        "-- GENERADO por agrovoltaic.ddl — NO editar a mano. Regenerar desde el menu.",
        "-- Modelo: crudo en tablas base + correccion en vistas (decision Leo 2026-08-10).",
        "-- === Tabla ELECTRICA (crudo, 5 min) ===",
        _table_ddl(config.TABLE_ELECTRICO, electrico_table_columns()),
        _alter_ddl(config.TABLE_ELECTRICO, electrico_table_columns()),
        "-- === Tabla RADIACION (crudo, 15 s, base aparte) ===",
        _table_ddl(config.TABLE_RADIACION, radiacion_table_columns()),
        _alter_ddl(config.TABLE_RADIACION, radiacion_table_columns()),
        "-- === Clear-sky + POA (pvlib) para calibracion/QC y Performance Ratio ===",
        clearsky_table_ddl(),
        poa_table_ddl(),
        "-- === Control de ingesta (idempotencia por md5) ===",
        ingest_log_ddl(),
        "-- === Diccionario de variables (Leo P1) ===",
        diccionario_ddl(),
        "-- === Capa de correccion: vistas (el crudo NO se toca) ===",
        electrico_view_ddl(),
        radiacion_view_ddl(),
        "-- === Capa de calibracion: radiacion en W/m2 + kt* + QC (usa clear-sky) ===",
        radiacion_calibrada_view_ddl(),
        "-- === Performance Ratio por arreglo (potencia vs POA bifacial) ===",
        performance_view_ddl(),
    ]) + "\n"


def init_db(conn) -> None:
    """Aplica el schema completo a la base (idempotente)."""
    with conn.cursor() as cur:
        cur.execute(full_schema_sql())
    conn.commit()
