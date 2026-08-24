"""CLI del Comparador.

    python -m comparador sol       --desde 2024-11-01 --hasta 2026-06-30
    python -m comparador barrido   [--desde ... --hasta ...]
    python -m comparador cielo     [--desde ... --hasta ...]
    python -m comparador reporte   [--desde ... --hasta ...]
    python -m comparador todo      [--desde ... --hasta ...]

Sin fechas usa todo el rango disponible en la Supabase PV. `hasta` es EXCLUSIVO,
igual que en el resto del proyecto.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta

from comparador import calidad, cielo, db, reporte, sol


def _rango(args) -> tuple[date, date]:
    """Fechas pedidas, o todo lo que haya en la base."""
    if args.desde and args.hasta:
        return date.fromisoformat(args.desde), date.fromisoformat(args.hasta)
    lim = db.uno(
        'SELECT min("timestamp")::date AS d0, max("timestamp")::date AS d1 '
        "FROM radiacion_sc_15s"
    )
    if not lim.get("d0"):
        raise SystemExit("no hay datos en radiacion_sc_15s")
    d0 = date.fromisoformat(args.desde) if args.desde else date.fromisoformat(lim["d0"])
    # +1 dia porque `hasta` es exclusivo y el ultimo dia tiene que entrar
    d1 = date.fromisoformat(args.hasta) if args.hasta else \
        date.fromisoformat(lim["d1"]) + timedelta(days=1)
    return d0, d1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="comparador", description=__doc__)
    p.add_argument("accion", choices=["sol", "barrido", "cielo", "reporte", "todo"])
    p.add_argument("--desde", help="fecha ISO inclusive")
    p.add_argument("--hasta", help="fecha ISO EXCLUSIVA")
    args = p.parse_args(argv)

    try:
        desde, hasta = _rango(args)

        if args.accion in ("sol", "todo"):
            n = sol.poblar(desde, hasta - timedelta(days=1))
            print(f"ventana solar: {n} dias", file=sys.stderr)

        if args.accion in ("barrido", "todo"):
            print(json.dumps(calidad.barrer(desde, hasta), indent=2, ensure_ascii=False),
                  file=sys.stderr)

        if args.accion in ("cielo", "todo"):
            print(json.dumps(cielo.caracterizar(desde, hasta), indent=2, ensure_ascii=False),
                  file=sys.stderr)

        if args.accion in ("reporte", "todo"):
            print(reporte.generar(desde, hasta))
        return 0
    finally:
        db.cerrar()


if __name__ == "__main__":
    raise SystemExit(main())
