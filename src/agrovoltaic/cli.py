"""Menu interactivo del ETL AgroVoltaic.

Punto de entrada: `python3 run.py` (en la raiz del repo).
Muestra un menu numerado; cada opcion ejecuta un paso del pipeline.
"""

from __future__ import annotations

import logging
import sys


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


# --- Acciones del menu ------------------------------------------------------
def cmd_audit() -> None:
    from . import config, normalize
    mapping, unknown = normalize.audit_dataset(config.DATASET_DIR)
    print(f"Headers crudos mapeados: {len(mapping)}")
    print(f"Columnas canonicas: {len(normalize.CANONICAL_COLUMNS)}")
    if unknown:
        print(f"\nHEADERS DESCONOCIDOS ({len(unknown)}) — revisar normalize.CONCEPT_MAP:")
        for h in unknown:
            print(f"  {h!r}  (slug: {normalize.slugify(h)!r})")
    else:
        print("\nTodos los headers del dataset estan cubiertos.")


def cmd_dry_run() -> None:
    from . import config, pipeline
    elec, rad = pipeline.dry_run()
    for label, df in (("ELECTRICO (5 min)", elec), ("RADIACION (15 s)", rad)):
        print(f"\n=== {label} ===")
        print(f"Filas resultantes: {len(df):,}")
        if df.empty:
            continue
        print(f"Rango: {df['timestamp'].min()} -> {df['timestamp'].max()}")
        nulls = df.isna().mean().mul(100).round(1)
        print("% NULL por columna:")
        print(nulls.to_string())

    resp = input("\nGuardar resultados a CSV? (s/n): ").strip().lower()
    if resp in ("s", "si", "y", "yes"):
        config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if not elec.empty:
            elec.to_csv(config.OUTPUT_DIR / "dry_run_electrico.csv", index=False)
        if not rad.empty:
            rad.to_csv(config.OUTPUT_DIR / "dry_run_radiacion.csv", index=False)
        print(f"Guardados en: {config.OUTPUT_DIR}")


def cmd_print_schema() -> None:
    from . import ddl
    print("DDL generado por ddl.py desde el schema canonico (no se escribe a disco;")
    print("usar la opcion 'Generar archivo sql/001_schema.sql' para guardarlo):\n")
    print(ddl.full_schema_sql(), end="")


def cmd_generate_schema() -> None:
    from . import config, ddl
    config.SQL_DIR.mkdir(parents=True, exist_ok=True)
    config.SCHEMA_FILE.write_text(ddl.full_schema_sql(), encoding="utf-8")
    print(f"DDL generado en: {config.SCHEMA_FILE}")


def cmd_init_db() -> None:
    import psycopg

    from . import config, ddl
    with psycopg.connect(config.require_database_url()) as conn:
        ddl.init_db(conn)
    print("Tablas creadas/actualizadas en Supabase.")


def cmd_refresh_clearsky() -> None:
    import psycopg

    from . import calibracion, config, performance
    with psycopg.connect(config.require_database_url()) as conn:
        n = calibracion.refresh_clearsky(conn, full=False)
        conn.commit()
        m = performance.refresh_poa(conn, full=False)
        conn.commit()
    print(f"Clear-sky: {n} timestamps. POA por arreglo: {m} timestamps.")


def cmd_run_incremental() -> None:
    _run(full=False)


def cmd_run_full() -> None:
    _run(full=True)


def _run(full: bool) -> None:
    from . import pipeline
    result = pipeline.run(full=full)
    print(f"OK procesados={len(result.processed)} saltados={len(result.skipped)} "
          f"fallidos={len(result.failed)} | electrico={result.rows_electrico} "
          f"radiacion={result.rows_radiacion} filas")
    for name, err in result.failed.items():
        print(f"  FALLO {name}: {err}", file=sys.stderr)


# --- Menu -------------------------------------------------------------------
_MENU = [
    ("Auditar dataset (cobertura de headers)", cmd_audit),
    ("Dry-run (procesar sin base de datos)", cmd_dry_run),
    ("Crear/actualizar tablas (generar sql/schema.sql)", cmd_generate_schema),
    ("Subir tablas a Supabase (aplicar el DDL)", cmd_init_db),
    ("Ver DDL en pantalla (solo muestra, no guarda)", cmd_print_schema),
    ("Calcular clear-sky + POA (calibracion/QC + Performance Ratio)", cmd_refresh_clearsky),
    ("Cargar datos a Supabase (incremental)", cmd_run_incremental),
    ("Cargar datos a Supabase (reprocesar TODO — vacía y recarga)", cmd_run_full),
]


def main() -> int:
    _setup_logging()
    print("=== AgroVoltaic ETL ===")
    while True:
        print("\nOpciones:")
        for i, (label, _) in enumerate(_MENU, start=1):
            print(f"  {i}. {label}")
        print("  0. Salir")
        try:
            choice = input("\nElegi una opcion: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if choice in ("0", "q", "salir", "exit"):
            return 0
        if not choice.isdigit() or not (1 <= int(choice) <= len(_MENU)):
            print("Opcion invalida.")
            continue
        try:
            _MENU[int(choice) - 1][1]()
        except Exception as exc:  # noqa: BLE001 — el menu no debe morir por 1 fallo
            print(f"Error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
